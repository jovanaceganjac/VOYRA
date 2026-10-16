const express = require('express');
const { optionalToken, requireAdmin, requireAuth } = require('../middleware/optionalToken');
const {
  validatePlanRequest,
  validirajPreferencije,
  validirajFiltere
} = require('../utils/validatePlanRequest');
const OrchestrationService = require('../services/OrchestrationService');
const StatsService = require('../services/StatsService');
const PlannerClient = require('../services/clients/PlannerClient');
const PlanEditService = require('../services/PlanEditService');
const FlightChangeService = require('../services/FlightChangeService');
const TripClient = require('../services/clients/TripClient');
const CityResolver = require('../services/CityResolver');

const router = express.Router();
const orchestration = new OrchestrationService();
const stats = new StatsService();
const planner = new PlannerClient();
const izmena = new PlanEditService();
const letovi = new FlightChangeService();
const tripClient = new TripClient();
const gradovi = new CityResolver();

const IATA = /^[A-Z]{3}$/;

const greskaValidacije = (res, errors) =>
  res.status(400).json({
    success: false,
    error: 'VALIDATION_ERROR',
    message: 'Zahtev nije ispravan',
    errors,
    statusCode: 400
  });

/** Lista iz query parametra: "hotel,hostel" -> ['hotel', 'hostel'] */
const uListu = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (Array.isArray(v)) return v;

  return String(v).split(',').map((x) => x.trim()).filter(Boolean);
};

/** Preferencije iz query parametara (koraci carobnjaka su GET rute). */
const preferencijeIzUpita = (q) => {
  const p = {};

  if (q.transportPriority) p.transportPriority = q.transportPriority;
  if (q.pace) p.pace = q.pace;
  if (q.dayStart) p.dayStart = q.dayStart;
  if (q.dayEnd) p.dayEnd = q.dayEnd;

  const tipovi = uListu(q.accommodationTypes);
  if (tipovi) p.accommodationTypes = tipovi;

  const interesovanja = uListu(q.interests);
  if (interesovanja) p.interests = interesovanja;

  if (q.minAccommodationRating !== undefined && q.minAccommodationRating !== '') {
    p.minAccommodationRating = Number(q.minAccommodationRating);
  }

  return Object.keys(p).length > 0 ? p : undefined;
};

/**
 * GET /v1/preferences/schema - dozvoljene vrednosti preferencija (§4.2).
 *
 * Prosledjuje shemu iz Planner Service-a, koji je jedini izvor istine za
 * te liste. Bez ove rute frontend bi drzao TRECU kopiju spiska
 * interesovanja, tempa i tipova smestaja, pa bi se kasnije
 * (kategorije u bazi) razisla sa backendom.
 */
router.get('/preferences/schema', async (req, res, next) => {
  try {
    const schema = await planner.schema(req.requestId);

    if (!schema) {
      return res.status(503).json({
        success: false,
        error: 'PLANNER_UNAVAILABLE',
        message: 'Planner Service trenutno nije dostupan',
        statusCode: 503
      });
    }

    res.json({ success: true, data: schema, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/flights - korak 2 carobnjaka (spec §4.3).
 *
 * Vraca rangirane ponude sa tacno jednom `recommended`. Nista se ne
 * odseca po budzetu - skuplje ponude nose `overBudget: true`.
 */
router.get('/flights', optionalToken, async (req, res, next) => {
  const { from, to, checkIn, checkOut, passengers, budget, maxStops, departureFrom, departureTo } =
    req.query;

  const greske = [];

  // Grad se zadaje preko `fromCityId`/`toCityId` ili starog IATA koda
  const imaGradove = Boolean(req.query.fromCityId && req.query.toCityId);

  if (!imaGradove) {
    if (!IATA.test(String(from || '').toUpperCase())) {
      greske.push('from mora biti IATA kod ili fromCityId');
    }
    if (!IATA.test(String(to || '').toUpperCase())) {
      greske.push('to mora biti IATA kod ili toCityId');
    }
  }

  if (!checkIn) greske.push('checkIn je obavezan');

  const brojPutnika = passengers === undefined ? 1 : Number(passengers);
  if (!Number.isInteger(brojPutnika) || brojPutnika < 1) {
    greske.push('passengers mora biti ceo broj najmanje 1');
  }

  const preferencije = preferencijeIzUpita(req.query);
  const filteri = { maxStops, departureFrom, departureTo };

  const schema = await planner.schema(req.requestId);
  greske.push(...validirajPreferencije(preferencije, schema));
  greske.push(...validirajFiltere(filteri));

  if (greske.length > 0) return greskaValidacije(res, greske);

  try {
    const { od, do_, kodOd, kodDo } = await razresiGradove(req.query, req.requestId);

    if (!kodDo) {
      return res.status(200).json({
        success: true,
        data: [],
        count: 0,
        source: null,
        warnings: [
          `Za ${do_?.naziv || 'ovo odredište'} nema aerodroma u krugu od 150 km — ` +
            'plan se može napraviti bez leta'
        ]
      });
    }

    const r = await planner.flights(
      {
        from: kodOd,
        to: kodDo,
        // Opisi gradova sa koordinatama
        origin: gradovi.opisZaPlanner(od),
        destination: gradovi.opisZaPlanner(do_),
        checkIn,
        checkOut,
        passengers: brojPutnika,
        budget: budget ? Number(budget) : undefined,
        preferences: preferencije,
        filteri
      },
      req.requestId
    );

    res.json({
      success: true,
      data: r.ponude,
      count: r.ponude.length,
      source: r.source,
      // Aerodrom nije u gradu - korisnik to vidi jos u koraku 2
      ...(gradovi.aerodromZaGrad(do_)?.izvanGrada
        ? { transfer: gradovi.aerodromZaGrad(do_) }
        : {}),
      durationMs: r.durationMs
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/accommodations - korak 3 carobnjaka (spec §4.4).
 * `budget` i `flightPrice` sluze za racun preostalog budzeta.
 */
router.get('/accommodations', optionalToken, async (req, res, next) => {
  const { to, checkIn, checkOut, guests, budget, flightPrice, maxPricePerNight } = req.query;

  const greske = [];

  // Odrediste je `toCityId` (novo) ili IATA kod (staro)
  if (!req.query.toCityId && !IATA.test(String(to || '').toUpperCase())) {
    greske.push('to mora biti IATA kod ili toCityId');
  }
  if (!checkIn) greske.push('checkIn je obavezan');
  if (!checkOut) greske.push('checkOut je obavezan');

  const preferencije = preferencijeIzUpita(req.query);

  const schema = await planner.schema(req.requestId);
  greske.push(...validirajPreferencije(preferencije, schema));

  if (greske.length > 0) return greskaValidacije(res, greske);

  try {
    const odrediste = await gradovi.izZahteva(req.query, 'to', req.requestId);

    const r = await planner.accommodations(
      {
        to: gradovi.kodZaLet(odrediste) || String(to || '').toUpperCase(),
        // Planner dobija ceo opis grada, sa koordinatama
        destination: gradovi.opisZaPlanner(odrediste),
        checkIn,
        checkOut,
        guests: guests ? Number(guests) : 1,
        budget: budget ? Number(budget) : undefined,
        flightPrice: flightPrice ? Number(flightPrice) : 0,
        maxPricePerNight: maxPricePerNight ? Number(maxPricePerNight) : undefined,
        preferences: preferencije
      },
      req.requestId
    );

    res.json({
      success: true,
      data: r.ponude,
      count: r.ponude.length,
      warnings: r.warnings,
      source: r.source,
      durationMs: r.durationMs
    });
  } catch (err) {
    next(err);
  }
});

/** GET /v1/attractions - stranica „Atrakcije" (spec §10). */
router.get('/attractions', optionalToken, async (req, res, next) => {
  const { to } = req.query;

  const greske = [];
  // Odrediste je `toCityId` (novo) ili IATA kod (staro)
  if (!req.query.toCityId && !IATA.test(String(to || '').toUpperCase())) {
    greske.push('to mora biti IATA kod ili toCityId');
  }

  const preferencije = preferencijeIzUpita(req.query);

  const schema = await planner.schema(req.requestId);
  greske.push(...validirajPreferencije(preferencije, schema));

  if (greske.length > 0) return greskaValidacije(res, greske);

  try {
    const odrediste = await gradovi.izZahteva(req.query, 'to', req.requestId);

    const r = await planner.attractions(
      {
        to: gradovi.kodZaLet(odrediste) || String(to || '').toUpperCase(),
        destination: gradovi.opisZaPlanner(odrediste),
        preferences: preferencije
      },
      req.requestId
    );

    res.json({
      success: true,
      data: r.atrakcije,
      count: r.atrakcije.length,
      source: r.source,
      durationMs: r.durationMs
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/plan - jedinstveni ulaz za planiranje.
 *
 * JWT je opcion; X-Save-Trip i X-Trip-ID ga zahtevaju.
 * `selectedFlightOfferId` i `selectedAccommodationId` razresava SERVER,
 * tako sto ponovo dobavi listu (iz kesa Integration Service-a) i u njoj
 * potrazi izbor - klijent ne salje objekat ponude, pa ne moze da
 * podmetne cenu.
 */
router.post('/plan', optionalToken, async (req, res, next) => {
  try {
    const schema = await planner.schema(req.requestId);

    // KORAK 2: validacija pre bilo kakvog poziva servisa
    const { valid, errors, value } = validatePlanRequest(req.body, schema);

    if (!valid) return greskaValidacije(res, errors);

    const saveTrip = String(req.headers['x-save-trip'] || '').toLowerCase() === 'true';
    const tripId = req.headers['x-trip-id'] || null;

    // KORAK 3: cuvanje zahteva prijavu
    if ((saveTrip || tripId) && !req.user) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Cuvanje putovanja zahteva prijavu',
        statusCode: 401
      });
    }

    const odgovor = await orchestration.plan({
      zahtev: value,
      user: req.user,
      token: req.token,
      requestId: req.requestId,
      // Otisak gostujuce sesije za statistiku pretraga (spec §4.1)
      sessionId: otisakSesije(req),
      saveTrip,
      tripId
    });

    res.json(odgovor);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/plan/:sessionId/save - cuva tacno prikazan plan (§9).
 * Zahteva prijavu; gostujuca sesija se tada preuzima.
 */
router.post('/plan/:sessionId/save', optionalToken, async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Cuvanje putovanja zahteva prijavu',
      statusCode: 401
    });
  }

  try {
    const r = await orchestration.sacuvajSesiju({
      sessionId: req.params.sessionId,
      user: req.user,
      token: req.token,
      requestId: req.requestId
    });

    res.json({
      success: true,
      savedTripId: r.savedTripId,
      alreadySaved: r.vecSacuvano,
      warnings: r.warnings,
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

// GET /v1/plan/:sessionId - sacuvan odgovor (vazi 24 h)
router.get('/plan/:sessionId', optionalToken, async (req, res, next) => {
  try {
    res.json(await orchestration.getSession(req.params.sessionId, req.user));
  } catch (err) {
    next(err);
  }
});

// =================================================================
// IZMENA PLANA (spec §4.6) - sve trazi prijavu i vlasnistvo
// =================================================================

/**
 * Polaziste i odrediste iz zahteva (spec §4.2).
 *
 * Prima `fromCityId` / `toCityId` (novo) ili `from` / `to` kao IATA kod
 * (staro). Vraca opise gradova i IATA kodove za pretragu leta.
 */
const razresiGradove = async (izvor, requestId) => {
  const [od, do_] = await Promise.all([
    gradovi.izZahteva(izvor, 'from', requestId),
    gradovi.izZahteva(izvor, 'to', requestId)
  ]);

  return {
    od,
    do_,
    // Grad sa vise aerodroma ide preko koda grada (LON, PAR)
    kodOd: gradovi.kodZaLet(od) || String(izvor.from || '').toUpperCase() || null,
    kodDo: gradovi.kodZaLet(do_) || String(izvor.to || '').toUpperCase() || null
  };
};

/** Telo `{ days: [{ day, attractionIds }] }` iz zahteva. */
const procitajDane = (telo) => {
  const dani = telo?.days;

  if (!Array.isArray(dani) || dani.length === 0) return null;

  for (const d of dani) {
    if (!Number.isFinite(Number(d?.day))) return null;
    if (!Array.isArray(d?.attractionIds)) return null;
  }

  return dani.map((d) => ({ day: Number(d.day), attractionIds: d.attractionIds.map(String) }));
};

/** GET /v1/trips/:id - putovanje, da li se sme menjati i verzija. */
router.get('/trips/:id', optionalToken, requireAuth, async (req, res, next) => {
  try {
    const trip = await izmena.ucitaj(req.params.id, req.token, req.requestId);

    res.json({
      success: true,
      data: trip,
      editable: izmena.jeIzmenjivo(trip),
      version: izmena.verzija(trip)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/trips/:id/days/preview - nova vremena bez cuvanja.
 *
 * Klijent salje SAMO izmenjene dane i samo `id`-jeve atrakcija; server
 * ih razresava iz plana ili iz liste za odrediste.
 */
router.post('/trips/:id/days/preview', optionalToken, requireAuth, async (req, res, next) => {
  const dani = procitajDane(req.body);

  if (!dani) {
    return greskaValidacije(res, ['days mora biti lista oblika { day, attractionIds: [...] }']);
  }

  try {
    res.json({
      success: true,
      ...(await izmena.preview(req.params.id, dani, {
        token: req.token,
        requestId: req.requestId
      }))
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /v1/trips/:id/days - cuvanje izmene, uz proveru verzije. */
router.put('/trips/:id/days', optionalToken, requireAuth, async (req, res, next) => {
  const dani = procitajDane(req.body);

  if (!dani) {
    return greskaValidacije(res, ['days mora biti lista oblika { day, attractionIds: [...] }']);
  }

  try {
    const trip = await izmena.sacuvaj(req.params.id, dani, req.body?.version || null, {
      token: req.token,
      requestId: req.requestId,
      user: req.user
    });

    res.json({
      success: true,
      data: trip,
      editable: izmena.jeIzmenjivo(trip),
      version: izmena.verzija(trip)
    });
  } catch (err) {
    next(err);
  }
});

/** POST /v1/trips/:id/days/:day/optimize - "Optimizuj redosled" (§6.4). */
router.post(
  '/trips/:id/days/:day/optimize',
  optionalToken,
  requireAuth,
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        ...(await izmena.optimizujDan(
          req.params.id,
          Number(req.params.day),
          req.body?.attractionIds,
          { token: req.token, requestId: req.requestId }
        ))
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /v1/trips/:id/flight/refresh - osvezavanje istekle ponude (§4.8).
 *
 * Trazi ISTI let u svezoj pretrazi, po otisku (kompanija, brojevi letova,
 * vremena polaska). Kada ga nema, vraca alternative.
 */
router.post('/trips/:id/flight/refresh', optionalToken, requireAuth, async (req, res, next) => {
  try {
    res.json({
      success: true,
      ...(await letovi.osvezi(req.params.id, { token: req.token, requestId: req.requestId }))
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /v1/trips/:id/flight - zamena leta; prvi i poslednji dan se preracunavaju. */
router.put('/trips/:id/flight', optionalToken, requireAuth, async (req, res, next) => {
  const { offerId, version } = req.body || {};

  if (!offerId) return greskaValidacije(res, ['offerId je obavezan']);

  try {
    res.json({
      success: true,
      ...(await letovi.zameni(req.params.id, offerId, version || null, {
        token: req.token,
        requestId: req.requestId
      }))
    });
  } catch (err) {
    next(err);
  }
});

/** POST /v1/trips/:id/regenerate - "Generisi ponovo"; let i smestaj ostaju. */
router.post('/trips/:id/regenerate', optionalToken, requireAuth, async (req, res, next) => {
  try {
    const trip = await izmena.regenerisi(req.params.id, {
      token: req.token,
      requestId: req.requestId,
      user: req.user
    });

    res.json({
      success: true,
      data: trip,
      editable: izmena.jeIzmenjivo(trip),
      version: izmena.verzija(trip)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Otisak onoga ko pretrazuje, za statistiku popularnih destinacija.
 *
 * Prijavljen korisnik se prepoznaje po `id`; gost salje `X-Session-Id`
 * (nasumican broj iz `sessionStorage`). Kada ga nema, koristi se IP i
 * User-Agent - to nije pouzdano, ali sprecava da jedno osvezavanje
 * stranice dva puta udje u statistiku. Vrednost se u Trip Service-u
 * HESIRA, pa u bazi ne stoji nista cime bi se gost prepoznao.
 */
const otisakSesije = (req) =>
  req.headers['x-session-id'] || `${req.ip}|${req.headers['user-agent'] || ''}`;

// =================================================================
// DESTINACIJE (spec §4.1) - javno, za pocetnu stranu
// =================================================================

/** Kes istaknutih i popularnih - pocetna strana se otvara cesto. */
const kesDestinacija = { featured: null, popular: new Map() };

const KES_ISTAKNUTE_MS = 60 * 1000;
/** Popularne se menjaju sporo (dnevna granularnost), pa 5 min. */
const KES_POPULARNE_MS = 5 * 60 * 1000;

/**
 * GET /v1/destinations/featured
 *
 * Istaknute destinacije koje bira i redja administrator. Prazna lista je
 * ispravan odgovor - pocetna strana tada ne prikazuje sekciju, umesto da
 * izmislja sadrzaj.
 */
router.get('/destinations/featured', async (req, res, next) => {
  try {
    if (kesDestinacija.featured && Date.now() < kesDestinacija.featured.vaziDo) {
      return res.json({
        success: true,
        data: kesDestinacija.featured.data,
        count: kesDestinacija.featured.data.length
      });
    }

    const data = await tripClient.destinacijeIstaknute(req.requestId);

    kesDestinacija.featured = { data, vaziDo: Date.now() + KES_ISTAKNUTE_MS };

    res.json({ success: true, data, count: data.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/destinations/popular?limit=8
 *
 * Popularno poslednjih 30 dana, po broju pretraga i sacuvanih putovanja.
 */
router.get('/destinations/popular', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 24);
    const zapamceno = kesDestinacija.popular.get(limit);

    if (zapamceno && Date.now() < zapamceno.vaziDo) {
      return res.json({ success: true, data: zapamceno.data, count: zapamceno.data.length });
    }

    const data = await tripClient.destinacijePopularne(limit, req.requestId);

    kesDestinacija.popular.set(limit, { data, vaziDo: Date.now() + KES_POPULARNE_MS });

    res.json({ success: true, data, count: data.length });
  } catch (err) {
    next(err);
  }
});

// =================================================================
// GRADOVI (spec §4.2) - javno, poziva se dok korisnik kuca
// =================================================================

/**
 * GET /v1/cities?q=beo&limit=10
 *
 * Pretraga ide nad SOPSTVENOM bazom, a ne nad Nominatim-om: njihova
 * pravila koriscenja izricito zabranjuju pretragu dok korisnik kuca
 * (https://operations.osmfoundation.org/policies/nominatim/).
 */
router.get('/cities', async (req, res, next) => {
  const q = String(req.query.q || '').trim();

  if (q.length < 2) {
    return greskaValidacije(res, ['Upit mora imati bar 2 znaka']);
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 10, 25);
    const data = await tripClient.cities(q, limit, req.requestId);

    res.json({ success: true, data, count: data.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/cities/by-iata/:kod - grad kome taj aerodrom pripada.
 *
 * Sluzi starim adresama (`/planiranje/1?from=BEG&to=ATH`) i sacuvanim
 * putovanjima: prikaz iz koda dobija ceo grad. Stoji ISPRED `/cities/:id`,
 * inace bi "by-iata" bilo procitano kao identifikator grada.
 */
router.get('/cities/by-iata/:kod', async (req, res, next) => {
  try {
    const grad = await tripClient.cityPoIata(req.params.kod, req.requestId);

    if (!grad) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Za kod ${req.params.kod} nema grada` }
      });
    }

    res.json({ success: true, data: grad });
  } catch (err) {
    next(err);
  }
});

/** GET /v1/cities/:id - jedan grad sa svim podacima. */
router.get('/cities/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await tripClient.city(req.params.id, req.requestId) });
  } catch (err) {
    next(err);
  }
});

// GET /v1/health - javno; ?refresh=true pinguje odmah
router.get('/health', async (req, res, next) => {
  try {
    const osvezi = String(req.query.refresh || '').toLowerCase() === 'true';
    res.json(await req.app.locals.healthMonitor.stanje(osvezi));
  } catch (err) {
    next(err);
  }
});

// GET /v1/stats - samo admin
router.get('/stats', optionalToken, requireAdmin, async (req, res, next) => {
  try {
    res.json(await stats.get(req.query.period));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
