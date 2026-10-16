const express = require('express');

const TravelPlanner = require('../services/TravelPlanner');
const FlightService = require('../services/FlightService');
const AccommodationService = require('../services/AccommodationService');
const AttractionService = require('../services/AttractionService');

const { rangirajLetove } = require('../services/FazaLetovi');
const { rangirajSmestaj } = require('../services/FazaSmestaj');
const { oceniAtrakcije } = require('../services/FazaAtrakcije');
const { napraviSatnicu, urediDan } = require('../services/FazaRedosled');
const { izracunajDane, brojDana } = require('../services/Dani');
const { validirajPreferencije } = require('../utils/preferencijeValidator');
const kategorije = require('../services/KategorijeService');
const AdminAtrakcijeService = require('../services/AdminAtrakcijeService');
const { spoji } = require('../services/SpajanjeAtrakcija');
const { procitajOdrediste, procitajPolaziste, zaIzvor } = require('../utils/odrediste');
const {
  PRIORITETI_PREVOZA,
  TIPOVI_SMESTAJA,
  INTERESOVANJA,
  TEMPO,
  PODRAZUMEVANE_PREFERENCIJE,
  AKTIVNOSTI_PO_TEMPU,
  MAX_DANA
} = require('../config/preferencije');

const router = express.Router();

const flightService = new FlightService();
const accommodationService = new AccommodationService();
const attractionService = new AttractionService();
const adminAtrakcije = new AdminAtrakcijeService();

const travelPlanner = new TravelPlanner(flightService, accommodationService, attractionService);

/**
 * Katalog kategorija se ucitava JEDNOM po zahtevu i stoji na `req`.
 *
 * Servis ima svoj kes od 60 s, pa ovo obicno ne dodiruje mrezu; kada
 * Trip Service ne odgovara, katalog se vraca iz ugradjenih konstanti i
 * plan se svejedno pravi.
 */
router.use(async (req, res, next) => {
  req.katalog = await kategorije.ucitaj();
  next();
});

/**
 * `kinds` koje treba trazi od spoljnog izvora za data interesovanja.
 *
 * Mapiranje se racuna iz kategorija u bazi, pa administrator dodavanjem
 * `kind`-a kategoriji menja i sta se trazi - bez izmene koda adaptera.
 * Bez interesovanja se traze svi poznati `kinds`.
 */
const kindoviZa = (interesovanja, katalog) => {
  const mapa = katalog?.interesovanjeUKinds || {};

  const izvori =
    Array.isArray(interesovanja) && interesovanja.length > 0
      ? interesovanja
      : Object.keys(mapa);

  const kinds = new Set();

  for (const i of izvori) {
    for (const k of mapa[i] || []) kinds.add(k);
  }

  return [...kinds];
};

/**
 * Geoapify kategorije i mapa za obrnuto prepoznavanje.
 *
 * Adapter iz `geoCategories` gradi upit, a iz `categoryMap` prepoznaje
 * kojoj nasoj kategoriji pripada vraceni objekat.
 */
const geoZa = (interesovanja, katalog) => {
  const mapa = katalog?.interesovanjeUGeo || {};

  const izvori =
    Array.isArray(interesovanja) && interesovanja.length > 0 ? interesovanja : Object.keys(mapa);

  const kategorije = new Set();

  for (const i of izvori) {
    for (const k of mapa[i] || []) kategorije.add(k);
  }

  return { geoCategories: [...kategorije], categoryMap: mapa };
};

const greska = (res, kod, poruka, status = 400, dodatno = {}) =>
  res.status(status).json({
    success: false,
    error: kod,
    message: poruka,
    statusCode: status,
    ...dodatno
  });

/** Zajednicka provera osnovnih parametara pretrage. */
const proveriObavezne = (telo, obavezni) => {
  const nedostaju = obavezni.filter((k) => !telo[k]);
  return nedostaju.length > 0 ? `Missing required: ${nedostaju.join(', ')}` : null;
};

/**
 * GET /api/planner/preferences/schema
 *
 * Dozvoljene vrednosti preferencija. Orchestrator ih ucitava da bi
 * validirao zahtev pre nego sto ga posalje dalje - tako lista ostaje na
 * jednom mestu (spec §4.2), a moze da je prebaci u bazu bez
 * izmena u orchestratoru.
 */
router.get('/preferences/schema', (req, res) => {
  const katalog = req.katalog;

  /*
   * Podrazumevana interesovanja moraju da budu medju AKTIVNIM: ako
   * administrator ugasi „muzeji", korak 1 ne sme da ih ponudi kao
   * unapred izabrane.
   */
  const podrazumevana = PODRAZUMEVANE_PREFERENCIJE.interests.filter((i) =>
    katalog.kljucevi.includes(i)
  );

  res.json({
    success: true,
    data: {
      transportPriority: PRIORITETI_PREVOZA,
      accommodationTypes: TIPOVI_SMESTAJA,
      interests: katalog.kljucevi,
      // Nazivi i opisi iz baze, da ih frontend ne drzi kao trecu kopiju
      interestDetails: katalog.stavke.map((k) => ({
        kljuc: k.kljuc,
        naziv: k.naziv,
        opis: k.opis || ''
      })),
      interestsSource: katalog.izvor,
      pace: TEMPO,
      activitiesPerPace: AKTIVNOSTI_PO_TEMPU,
      maxDays: MAX_DANA,
      defaults: {
        ...PODRAZUMEVANE_PREFERENCIJE,
        interests: podrazumevana.length > 0 ? podrazumevana : katalog.kljucevi.slice(0, 2)
      }
    }
  });
});

/**
 * POST /api/planner/flights - korak 2 carobnjaka.
 * Pretraga + FAZA 1 (rangiranje i filteri).
 */
router.post('/flights', async (req, res, next) => {
  const { from, to, checkIn, checkOut, date, passengers = 1, budget, preferences, filteri, refresh } =
    req.body;

  const nedostaje = proveriObavezne(req.body, ['from', 'to']);
  if (nedostaje) return greska(res, 'VALIDATION_ERROR', nedostaje);
  if (!checkIn && !date) return greska(res, 'VALIDATION_ERROR', 'Missing required: checkIn');

  const { valid, errors, value } = validirajPreferencije(preferences, req.katalog.kljucevi);
  if (!valid) return greska(res, 'VALIDATION_ERROR', 'Preferencije nisu ispravne', 400, { errors });

  try {
    const odrediste = procitajOdrediste(req.body);
    const polaziste = procitajPolaziste(req.body);

    const sve = await flightService.fetch(
      {
        // `refresh` preskace kes - koristi se pred rezervaciju
        from,
        to,
        checkIn: checkIn || date,
        checkOut,
        date,
        passengers,
        refresh,
        ...(polaziste?.lat != null ? { odKoordinate: `${polaziste.lat},${polaziste.lon}` } : {}),
        ...(odrediste?.lat != null ? { doKoordinate: `${odrediste.lat},${odrediste.lon}` } : {})
      },
      req.requestId
    );

    const rangirani = rangirajLetove(sve, {
      transportPriority: value.transportPriority,
      budget: budget ?? null,
      filteri: filteri || {}
    });

    res.json({
      success: true,
      data: rangirani,
      count: rangirani.length,
      source: flightService.poslednjiIzvor || null,
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planner/accommodations - korak 3 carobnjaka.
 * Pretraga + FAZA 2. Prima `budget` i `flightPrice` za preostali budzet.
 */
router.post('/accommodations', async (req, res, next) => {
  const { to, checkIn, checkOut, guests = 1, budget, flightPrice, attractionsEstimate, preferences, maxPricePerNight } =
    req.body;

  const nedostaje = proveriObavezne(req.body, ['to', 'checkIn', 'checkOut']);
  if (nedostaje) return greska(res, 'VALIDATION_ERROR', nedostaje);

  const { valid, errors, value } = validirajPreferencije(preferences, req.katalog.kljucevi);
  if (!valid) return greska(res, 'VALIDATION_ERROR', 'Preferencije nisu ispravne', 400, { errors });

  try {
    const odrediste = procitajOdrediste(req.body);

    const sve = await accommodationService.fetch(
      zaIzvor(odrediste, { cityCode: to, checkIn, checkOut, guests }),
      req.requestId
    );

    const { ponude, upozorenja } = rangirajSmestaj(sve, {
      preferencije: value,
      budget: budget ?? null,
      flightPrice: flightPrice ?? 0,
      attractionsEstimate: attractionsEstimate ?? 0,
      maxPricePerNight
    });

    res.json({
      success: true,
      data: ponude,
      count: ponude.length,
      warnings: upozorenja,
      source: accommodationService.poslednjiIzvor || null,
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

/** Koliko atrakcija na stranici „Atrakcije" odmah dobija sliku. */
const PRVA_STRANA = 24;

/**
 * POST /api/planner/attractions - stranica „Atrakcije" (spec §10).
 * Pretraga + ocena iz FAZE 3, bez izbora i rasporedjivanja.
 */
router.post('/attractions', async (req, res, next) => {
  const { to, preferences } = req.body;

  const nedostaje = proveriObavezne(req.body, ['to']);
  if (nedostaje) return greska(res, 'VALIDATION_ERROR', nedostaje);

  const { valid, errors, value } = validirajPreferencije(preferences, req.katalog.kljucevi);
  if (!valid) return greska(res, 'VALIDATION_ERROR', 'Preferencije nisu ispravne', 400, { errors });

  try {
    /*
     * `details` obogacuje prvu stranu rezultata slikom i opisom
     * Detalj je jedan poziv po atrakciji, pa se ne trazi
     * za celu listu - ostatak sliku dobija kada se zatrazi sledeca strana.
     */
    const odrediste = procitajOdrediste(req.body);

    const eksterne = await attractionService.fetch(
      zaIzvor(odrediste, {
        interests: value.interests,
        // `kinds` iz baze - izvor ne mora da drzi svoju kopiju mapiranja
        kinds: kindoviZa(value.interests, req.katalog),
        ...geoZa(value.interests, req.katalog),
        details: PRVA_STRANA
      }),
      req.requestId
    );

    // Spec §4.5: stranica prikazuje i atrakcije administratora
    const adminske = await adminAtrakcije.zaGrad(odrediste?.id || null, req.requestId);
    const { spojene } = spoji(eksterne, adminske);

    const ocenjene = oceniAtrakcije(spojene, value.interests, req.katalog).sort(
      (a, b) => b.score - a.score
    );

    res.json({
      success: true,
      data: ocenjene,
      count: ocenjene.length,
      source: attractionService.poslednjiIzvor || null,
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planner/plan - ceo plan (svih pet faza).
 *
 * `selectedFlightOfferId` i `selectedAccommodationId` su opcioni; bez
 * njih se uzimaju preporucene ponude, kao i do sada.
 */
router.post('/plan', async (req, res, next) => {
  const {
    from,
    to,
    date,
    checkIn,
    checkOut,
    passengers,
    guests,
    budget,
    preferences,
    selectedFlightOfferId,
    selectedAccommodationId,
    filteri
  } = req.body;

  const nedostaje = proveriObavezne(req.body, ['from', 'to', 'checkIn', 'checkOut']);
  if (nedostaje) return greska(res, 'VALIDATION_ERROR', nedostaje);

  if (new Date(checkOut) <= new Date(checkIn)) {
    return greska(res, 'INVALID_DATES', 'checkOut mora biti posle checkIn-a');
  }

  // Isti racun kao u Dani.brojDana: dan dolaska i dan povratka se broje
  const dana = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000) + 1;
  if (dana > MAX_DANA) {
    return greska(
      res,
      'VALIDATION_ERROR',
      `Putovanje moze trajati najvise ${MAX_DANA} dana (trazeno ${dana})`
    );
  }

  const brojPutnika = passengers === undefined ? 1 : Number(passengers);
  if (!Number.isInteger(brojPutnika) || brojPutnika < 1) {
    return greska(res, 'VALIDATION_ERROR', 'passengers mora biti ceo broj najmanje 1');
  }

  const { valid, errors, value } = validirajPreferencije(preferences, req.katalog.kljucevi);
  if (!valid) return greska(res, 'VALIDATION_ERROR', 'Preferencije nisu ispravne', 400, { errors });

  try {
    const pocetak = Date.now();

    const itinerary = await travelPlanner.plan({
      from,
      to,
      date: date || checkIn,
      checkIn,
      checkOut,
      passengers: brojPutnika,
      guests: guests || brojPutnika,
      budget: budget ?? null,
      preferences: value,
      selectedFlightOfferId,
      selectedAccommodationId,
      // Opis grada sa koordinatama
      destination: req.body.destination,
      filteri: filteri || {},
      katalog: req.katalog,
      requestId: req.requestId
    });

    console.log(`[PLANNER] Plan generisan za ${Date.now() - pocetak} ms`);

    res.json({ success: true, data: itinerary, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * Dan iz tela zahteva u oblik koji satnica ocekuje.
 * `availableFrom` i `availableTo` su obavezni - bez njih se ne zna prozor.
 */
const procitajDan = (telo) => {
  const d = telo?.day || {};

  return {
    day: Number(d.day) || 1,
    date: d.date || null,
    availableFrom: d.availableFrom || PODRAZUMEVANE_PREFERENCIJE.dayStart,
    availableTo: d.availableTo || PODRAZUMEVANE_PREFERENCIJE.dayEnd,
    note: d.note ?? null
  };
};

/** Polazna tacka dana: smestaj, inace srediste samih atrakcija. */
const polazisteDana = (telo, atrakcije) => {
  const s = telo?.start;

  if (Number.isFinite(s?.lat) && Number.isFinite(s?.lon)) return { lat: s.lat, lon: s.lon };
  if (!atrakcije.length) return null;

  return {
    lat: atrakcije.reduce((z, a) => z + (a.lat || 0), 0) / atrakcije.length,
    lon: atrakcije.reduce((z, a) => z + (a.lon || 0), 0) / atrakcije.length
  };
};

/** Zajednicki oblik odgovora za obe rute nad jednim danom. */
const odgovorZaDan = (dan, satnica) => ({
  day: dan.day,
  date: dan.date,
  availableFrom: dan.availableFrom,
  availableTo: dan.availableTo,
  note: dan.note,
  attractions: satnica.stavke,
  lunch: satnica.lunch,
  totalDistance: satnica.totalDistance,
  estimatedBudget: satnica.stavke.reduce((z, a) => z + (a.price || 0), 0),
  // Broj prekrsaja, da orchestrator ne mora da prebrojava
  violations: satnica.stavke.filter((a) => a.violation).length
});

/**
 * POST /api/planner/attraction-details - opis i slika za zadate atrakcije.
 *
 * Orchestrator je zove kada korisnik rucno doda atrakciju u plan
 * da bi i ona dobila sliku kao one koje je algoritam izabrao.
 * Planner ovde nista ne racuna - samo prosledjuje Integration Service-u,
 * da orchestrator ne bi morao da zna za njega.
 */
router.post('/attraction-details', async (req, res, next) => {
  const { ids } = req.body || {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return greska(res, 'VALIDATION_ERROR', 'ids mora biti neprazna lista');
  }

  try {
    const data = await attractionService.detalji(ids, req.requestId);
    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planner/trip-days - prozori dana za zadati let (spec §6.2).
 *
 * Koristi se kada se let PROMENI posle pravljenja plana:
 * druga vremena poletanja i sletanja pomeraju pocetak prvog i kraj
 * poslednjeg dana. Racun ostaje ovde, u `Dani.js`, da se ista pravila ne
 * prepisuju u orchestratoru.
 */
router.post('/trip-days', async (req, res, next) => {
  const { checkIn, checkOut, preferences, flight } = req.body || {};

  const nedostaje = proveriObavezne(req.body || {}, ['checkIn', 'checkOut']);
  if (nedostaje) return greska(res, 'VALIDATION_ERROR', nedostaje);

  const { valid, errors, value } = validirajPreferencije(preferences, req.katalog.kljucevi);
  if (!valid) return greska(res, 'VALIDATION_ERROR', 'Preferencije nisu ispravne', 400, { errors });

  try {
    const numDays = Math.min(brojDana(checkIn, checkOut), MAX_DANA);

    const dani = izracunajDane({
      checkIn,
      numDays,
      preferencije: value,
      let_: flight || null
    });

    res.json({ success: true, data: dani, count: dani.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planner/schedule-day - satnica za JEDAN dan (spec §4.6).
 *
 * Racuna vremena nad ZADATIM redosledom: nista ne premesta i nista ne
 * izbacuje. Atrakcija koja ne valja dobija `violation`:
 *   `zatvoreno`        - dolazak je van radnog vremena
 *   `posle_kraja_dana` - poseta se zavrsava posle kraja dana
 *
 * Razlika u odnosu na generisanje je namerna: tamo algoritam bira, ovde
 * je korisnik vec izabrao, pa se problem samo obelezava.
 */
router.post('/schedule-day', async (req, res, next) => {
  const { attractions } = req.body || {};

  if (!Array.isArray(attractions)) {
    return greska(res, 'VALIDATION_ERROR', 'attractions mora biti lista');
  }

  try {
    const dan = procitajDan(req.body);
    const start = polazisteDana(req.body, attractions);

    const satnica = napraviSatnicu({ redosled: attractions, start, dan, zadrziSve: true });

    res.json({ success: true, data: odgovorZaDan(dan, satnica), statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planner/optimize-day - "Optimizuj redosled" za jedan dan
 * (spec §4.6, §6.4).
 *
 * Najblizi sused od smestaja, pa 2-opt koji postuje radno vreme - iste
 * funkcije kao u Fazi 5. Satnica se posle toga racuna sa `zadrziSve`,
 * pa ni ovde nista ne ispada iz dana.
 */
router.post('/optimize-day', async (req, res, next) => {
  const { attractions } = req.body || {};

  if (!Array.isArray(attractions)) {
    return greska(res, 'VALIDATION_ERROR', 'attractions mora biti lista');
  }

  try {
    const dan = procitajDan(req.body);
    const start = polazisteDana(req.body, attractions);

    const { redosled } = urediDan({ atrakcije: attractions, start, dan });

    const optimizovana = napraviSatnicu({ redosled, start, dan, zadrziSve: true });
    const zatecena = napraviSatnicu({ redosled: attractions, start, dan, zadrziSve: true });

    /*
     * Najblizi sused ZAMENJUJE zatecen redosled, a 2-opt prihvata samo
     * zamene koje ne narusavaju radno vreme - pa rezultat ume da bude
     * duzi od onoga sto je korisnik vec imao. Dugme "Optimizuj redosled"
     * ne sme da pogorsa dan, zato se vraca krace od dva resenja.
     */
    const bolja =
      optimizovana.totalDistance <= zatecena.totalDistance ? optimizovana : zatecena;

    res.json({ success: true, data: odgovorZaDan(dan, bolja), statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planner/replan - "Generisi ponovo" (spec §4.6).
 *
 * Faze 3-5 sa letom i smestajem koji stizu iz sacuvanog putovanja.
 * Letovi i smestaj se NE pretrazuju ponovo.
 */
router.post('/replan', async (req, res, next) => {
  const { to, checkIn, checkOut, passengers, budget, preferences, flight, accommodation } =
    req.body || {};

  const nedostaje = proveriObavezne(req.body || {}, ['to', 'checkIn', 'checkOut']);
  if (nedostaje) return greska(res, 'VALIDATION_ERROR', nedostaje);

  const { valid, errors, value } = validirajPreferencije(preferences, req.katalog.kljucevi);
  if (!valid) return greska(res, 'VALIDATION_ERROR', 'Preferencije nisu ispravne', 400, { errors });

  try {
    const pocetak = Date.now();

    const itinerary = await travelPlanner.replan({
      to,
      checkIn,
      checkOut,
      passengers: Number(passengers) || 1,
      budget: budget ?? null,
      preferences: value,
      flight: flight || null,
      accommodation: accommodation || null,
      destination: req.body.destination,
      katalog: req.katalog,
      requestId: req.requestId
    });

    console.log(`[PLANNER] Plan ponovo napravljen za ${Date.now() - pocetak} ms`);

    res.json({ success: true, data: itinerary, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
