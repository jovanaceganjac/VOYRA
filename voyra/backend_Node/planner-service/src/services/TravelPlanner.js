const {
  procitajOdrediste,
  procitajPolaziste,
  zaIzvor,
  aerodromDolaska
} = require('../utils/odrediste');
const {
  PODRAZUMEVANE_PREFERENCIJE,
  MAX_DANA,
  TRANSFER_PO_DOLASKU_MIN,
  PRAG_AERODROMA_U_GRADU_KM
} = require('../config/preferencije');

/**
 * Duffel ne dokumentuje gornju granicu putnika u pretrazi, pa pretraga
 * ide sa stvarnim brojem. Rezervacija je ipak ogranicena na 9 (spec
 * §4.8), sto plan prijavljuje kao upozorenje.
 */
const MAX_PUTNIKA_PO_REZERVACIJI = 9;

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

/** `kinds` koje izvor treba da trazi, iz kategorija u bazi. */
const kindoviZa = (interesovanja, katalog) => {
  const mapa = katalog?.interesovanjeUKinds || {};

  const izvori =
    Array.isArray(interesovanja) && interesovanja.length > 0 ? interesovanja : Object.keys(mapa);

  const kinds = new Set();

  for (const i of izvori) {
    for (const k of mapa[i] || []) kinds.add(k);
  }

  return [...kinds];
};

/**
 * Koliko kilometara ima od aerodroma do grada, za izabranu ponudu.
 *
 * Aerodrom u gradu (do 30 km) ne daje poseban transfer - njega pokriva
 * onih 90 min koje prvi dan ionako gubi na prtljag i prijavu.
 */
const udaljenostTransfera = (odrediste, let_) => {
  const a = aerodromDolaska(odrediste, let_);

  if (!a || !(Number(a.udaljenostKm) > PRAG_AERODROMA_U_GRADU_KM)) return 0;

  return Number(a.udaljenostKm) || 0;
};

/** Naziv tempa u upozorenjima koja korisnik cita. */
const OPIS_TEMPA = {
  opusten: 'Opušten',
  umeren: 'Umeren',
  intenzivan: 'Intenzivan'
};

const { rangirajLetove } = require('./FazaLetovi');
const { rangirajSmestaj, ukupnaCena } = require('./FazaSmestaj');
const { izaberiAtrakcije } = require('./FazaAtrakcije');
const { spoji } = require('./SpajanjeAtrakcija');
const AdminAtrakcijeService = require('./AdminAtrakcijeService');
const { rasporediPoDanima } = require('./FazaRaspodela');
const { sastaviDan, napraviSatnicu } = require('./FazaRedosled');
const {
  izracunajDane,
  brojDana,
  ukupanCilj,
  ukupnoVreme,
  voznjaOdAerodroma,
  uTrajanje
} = require('./Dani');

/**
 * Orkestrira pet faza planiranja putovanja (spec §6).
 *
 *   1. rangiranje letova        (§6.1)
 *   2. rangiranje smestaja      (§6.1)
 *   3. izbor atrakcija          (§6.2)
 *   4. raspodela po danima      (§6.3)  k-means++ sa kapacitetom
 *   5. redosled i satnica       (§6.4)  najblizi sused + 2-opt
 *
 * Budzet je MEKA granica (spec §4.7): nista se ne odseca, a prekoracenje
 * se prijavljuje kroz `overBudget` i upozorenje.
 */
class TravelPlanner {
  constructor(flightService, accommodationService, attractionService, adminAtrakcije = null) {
    // Atrakcije administratora (spec §4.5) - spajaju se sa eksternim
    this.adminAtrakcije = adminAtrakcije || new AdminAtrakcijeService();
    this.flightService = flightService;
    this.accommodationService = accommodationService;
    this.attractionService = attractionService;
  }

  /**
   * Dopunjava izabrane atrakcije opisom i slikom.
   *
   * Radi se NA MESTU, nad istim objektima koji ulaze u raspored, pa se
   * detalji vide i u planu i u sacuvanom putovanju. Neuspeh se preskace:
   * plan bez slike je i dalje plan.
   */
  async _dodajDetalje(atrakcije, requestId) {
    if (!atrakcije || atrakcije.length === 0) return;

    // Uz id ide i Wikipedia veza - odatle Geoapify atrakcije dobijaju sliku
    const veze = Object.fromEntries(
      atrakcije.filter((a) => a.wikipedia).map((a) => [a.id, a.wikipedia])
    );

    const detalji = await this.attractionService.detalji(
      atrakcije.map((a) => a.id),
      requestId,
      veze
    );

    if (detalji.length === 0) return;

    const poId = new Map(detalji.map((d) => [d.id, d]));

    for (const a of atrakcije) {
      const d = poId.get(a.id);
      if (!d) continue;

      // Opis iz izvora ima prednost samo kada ga atrakcija jos nema
      if (!a.description && d.description) a.description = d.description;
      a.image = d.image || null;
    }
  }

  /**
   * Ponuda iz liste po identifikatoru; null kada je nema.
   *
   * Poredi se i `offerId` i `id`: let se bira po `offerId`-ju, a smestaj
   * po `id`-ju hotela. LiteAPI smestaj nosi OBA polja (`id` hotela i
   * `offerId` sobe, koji je nov pri svakoj pretrazi cena), pa bi
   * poredjenje samo po `offerId ?? id` izbor hotela uvek promasilo.
   */
  _nadjiPonudu(lista, id) {
    if (!id) return null;

    const trazeno = String(id);

    return (
      lista.find(
        (p) => (p.offerId != null && String(p.offerId) === trazeno) || String(p.id) === trazeno
      ) || null
    );
  }

  /** Izbor koji vise ne postoji - 410, uz podatak STA je isteklo. */
  _istekaoIzbor(sta) {
    const e = new Error(
      sta === 'flight'
        ? 'Izabrani let više nije dostupan — izaberite ponovo'
        : 'Izabrani smeštaj više nije dostupan — izaberite ponovo'
    );
    e.code = 'SELECTION_EXPIRED';
    e.statusCode = 410;
    e.selection = sta;
    return e;
  }

  /**
   * Izabrani let (korak 2) za plan.
   *
   * Duffel svakoj pretrazi daje NOVE id-jeve ponuda, pa izabrani
   * `offerId` ne mora da bude u listi ponovne pretrage (kes istekao ili
   * osvezen). Tada se ISTA ponuda trazi po id-ju od Integration Service-a,
   * koji je vraca iz kesa pretrage ili je proverava kod Duffel-a. Tek ako
   * ni tamo ne vazi, izbor je stvarno istekao.
   *
   * @returns {{ izabranLet: object|null, letovi: object[] }}
   */
  async _izabraniLet({ letovi, selectedFlightOfferId, preferencije, budget, filteri, requestId }) {
    if (!selectedFlightOfferId) {
      return { izabranLet: letovi.find((f) => f.recommended) || letovi[0] || null, letovi };
    }

    const uListi = this._nadjiPonudu(letovi, selectedFlightOfferId);
    if (uListi) return { izabranLet: uListi, letovi };

    const ponuda =
      typeof this.flightService.izabrana === 'function'
        ? await this.flightService.izabrana(selectedFlightOfferId, requestId)
        : null;

    if (!ponuda) throw this._istekaoIzbor('flight');

    // Izabrana ponuda ulazi u listu i rangira se zajedno sa ostalima
    const rangirani = rangirajLetove([ponuda, ...letovi], {
      transportPriority: preferencije.transportPriority,
      budget,
      filteri: {}
    });

    return {
      izabranLet: this._nadjiPonudu(rangirani, selectedFlightOfferId) || ponuda,
      letovi: rangirani
    };
  }

  /**
   * Izabrani smestaj (korak 3) za plan.
   *
   * Filteri koraka 3 (tip, ocena, cena) mogu da se razlikuju od
   * preferencija iz koraka 1, pa izbor koji je korisnik svesno napravio
   * ne sme da „nestane" zato sto ga filter preferencija ovde izbacuje -
   * trazi se i u nefiltriranoj listi iz izvora.
   *
   * @returns {{ izabranSmestaj: object|null, smestaji: object[] }}
   */
  _izabraniSmestaj({ smestaji, sviSmestaji, selectedAccommodationId, opcijeRangiranja }) {
    if (!selectedAccommodationId) {
      return {
        izabranSmestaj: smestaji.find((s) => s.recommended) || smestaji[0] || null,
        smestaji
      };
    }

    const uListi = this._nadjiPonudu(smestaji, selectedAccommodationId);
    if (uListi) return { izabranSmestaj: uListi, smestaji };

    if (!this._nadjiPonudu(sviSmestaji, selectedAccommodationId)) {
      throw this._istekaoIzbor('accommodation');
    }

    // Isto rangiranje, samo bez filtera preferencija
    const { ponude } = rangirajSmestaj(sviSmestaji, {
      ...opcijeRangiranja,
      preferencije: {
        ...opcijeRangiranja.preferencije,
        accommodationTypes: [],
        minAccommodationRating: null
      }
    });

    const izabran = this._nadjiPonudu(ponude, selectedAccommodationId);

    return { izabranSmestaj: izabran, smestaji: [izabran, ...smestaji] };
  }

  async plan(query) {
    const {
      from,
      to,
      date,
      checkIn,
      checkOut,
      passengers = 1,
      guests,
      budget = null,
      preferences,
      selectedFlightOfferId = null,
      selectedAccommodationId = null,
      filteri = {},
      // Katalog kategorija; bez njega vaze ugradjene konstante
      katalog = null,
      requestId,
      random
    } = query;

    const preferencije = { ...PODRAZUMEVANE_PREFERENCIJE, ...(preferences || {}) };

    const odrediste = procitajOdrediste(query);
    const grad = odrediste?.naziv || String(to || '').toUpperCase();
    /*
     * Spoljni izvori (LiteAPI, OpenTripMap) i mock podaci poznaju grad po
     * MEDJUNARODNOM nazivu, pa u upit ide `nazivEn` - „Athens", a ne
     * „Atina". Srpski naziv ostaje samo za prikaz i upozorenja.
     */
    const gradZaIzvor = odrediste?.nazivEn || grad;
    const drzava = odrediste?.drzava || null;

    const numDays = Math.min(brojDana(checkIn, checkOut), MAX_DANA);
    const upozorenja = [];

    // ---------------------------------------------------------------
    // FAZA 1: letovi
    // ---------------------------------------------------------------
    const polaziste = procitajPolaziste(query);

    const sviLetovi = await this.flightService.fetch(
      {
        from,
        to,
        checkIn,
        checkOut,
        date,
        passengers,
        // Koordinate gradova - demo generator iz njih racuna trajanje i
        // cenu leta
        ...(polaziste?.lat != null ? { odKoordinate: `${polaziste.lat},${polaziste.lon}` } : {}),
        ...(odrediste?.lat != null ? { doKoordinate: `${odrediste.lat},${odrediste.lon}` } : {})
      },
      requestId
    );

    const rangiraniLetovi = rangirajLetove(sviLetovi, {
      transportPriority: preferencije.transportPriority,
      budget,
      filteri
    });

    const { izabranLet, letovi } = await this._izabraniLet({
      letovi: rangiraniLetovi,
      selectedFlightOfferId,
      preferencije,
      budget,
      filteri,
      requestId
    });

    // ---------------------------------------------------------------
    // Dani putovanja (zavise od izabranog leta)
    // ---------------------------------------------------------------
    /*
     * Grad bez sopstvenog aerodroma (Bled -> LJU) trazi i put od
     * aerodroma do grada; prvi i poslednji dan se za toliko skracuju.
     * Racuna se od aerodroma IZ IZABRANE PONUDE, ne od najblizeg.
     */
    const transferKm = udaljenostTransfera(odrediste, izabranLet);

    const dani = izracunajDane({ checkIn, numDays, preferencije, let_: izabranLet, transferKm });

    // ---------------------------------------------------------------
    // FAZA 3: atrakcije (pre smestaja, zbog preostalog budzeta)
    // ---------------------------------------------------------------
    const { sveAtrakcije, izabrane, ocenjeneAtrakcije, procenaUlaznica } = await this._faza3({
      gradZaIzvor,
      drzava,
      odrediste,
      preferencije,
      dani,
      passengers,
      katalog,
      requestId
    });

    // ---------------------------------------------------------------
    // FAZA 2: smestaj
    // ---------------------------------------------------------------
    const sviSmestaji = await this.accommodationService.fetch(
      zaIzvor(odrediste, {
        city: gradZaIzvor,
        cityCode: to,
        countryCode: drzava,
        checkIn,
        checkOut,
        guests: guests || passengers
      }),
      requestId
    );

    const opcijeRangiranja = {
      preferencije,
      budget,
      flightPrice: izabranLet ? Number(izabranLet.priceEUR ?? izabranLet.price ?? 0) : 0,
      attractionsEstimate: procenaUlaznica
    };

    const { ponude: rangiraniSmestaji, upozorenja: upozorenjaSmestaja } = rangirajSmestaj(
      sviSmestaji,
      opcijeRangiranja
    );

    upozorenja.push(...upozorenjaSmestaja);

    const { izabranSmestaj, smestaji } = this._izabraniSmestaj({
      smestaji: rangiraniSmestaji,
      sviSmestaji,
      selectedAccommodationId,
      opcijeRangiranja
    });

    return this._faze45({
      dani,
      izabrane,
      sveAtrakcije,
      ocenjeneAtrakcije,
      izabranLet,
      izabranSmestaj,
      odrediste,
      letovi,
      smestaji,
      preferencije,
      grad,
      drzava,
      numDays,
      passengers,
      budget,
      upozorenja,
      random
    });
  }

  /**
   * PONOVNO PLANIRANJE (spec §4.6, "Generisi ponovo").
   *
   * Pokrece faze 3-5 nad VEC izabranim letom i smestajem, koji dolaze iz
   * sacuvanog putovanja. Letovi i smestaj se namerno NE pretrazuju
   * ponovo: Duffel ponuda u medjuvremenu istekne, a rezervisan let ne
   * sme da se promeni pod nogama korisniku (§4.8). Ko hoce drugi let,
   * pravi novo putovanje kroz carobnjaka.
   *
   * @param {object} q - { to, checkIn, checkOut, passengers, guests,
   *                       budget, preferences, flight, accommodation,
   *                       requestId, random }
   */
  async replan(q) {
    const {
      to,
      checkIn,
      checkOut,
      passengers = 1,
      budget = null,
      preferences,
      flight = null,
      accommodation = null,
      katalog = null,
      requestId,
      random
    } = q;

    const preferencije = { ...PODRAZUMEVANE_PREFERENCIJE, ...(preferences || {}) };

    const odrediste = procitajOdrediste(q);
    const grad = odrediste?.naziv || String(to || '').toUpperCase();
    /*
     * Spoljni izvori (LiteAPI, OpenTripMap) i mock podaci poznaju grad po
     * MEDJUNARODNOM nazivu, pa u upit ide `nazivEn` - „Athens", a ne
     * „Atina". Srpski naziv ostaje samo za prikaz i upozorenja.
     */
    const gradZaIzvor = odrediste?.nazivEn || grad;
    const drzava = odrediste?.drzava || null;
    const numDays = Math.min(brojDana(checkIn, checkOut), MAX_DANA);

    // Isto pravilo kao u `plan`: transfer prati aerodrom iz ponude
    const transferKm = udaljenostTransfera(odrediste, flight);

    const dani = izracunajDane({ checkIn, numDays, preferencije, let_: flight, transferKm });

    const { sveAtrakcije, izabrane, ocenjeneAtrakcije } = await this._faza3({
      gradZaIzvor,
      drzava,
      odrediste,
      preferencije,
      dani,
      passengers,
      katalog,
      requestId
    });

    return this._faze45({
      dani,
      izabrane,
      sveAtrakcije,
      ocenjeneAtrakcije,
      izabranLet: flight,
      izabranSmestaj: accommodation,
      odrediste,
      // Liste ponuda se ne pretrazuju ponovo; sacuvano putovanje ih ima
      letovi: flight ? [flight] : [],
      smestaji: accommodation ? [accommodation] : [],
      preferencije,
      grad,
      drzava,
      numDays,
      passengers,
      budget,
      random
    });
  }

  /**
   * FAZA 3 - izbor atrakcija sa detaljima (spec §6.2).
   * Izdvojena zato sto je koriste i `plan` i `replan`.
   */
  async _faza3({
    gradZaIzvor,
    drzava,
    odrediste,
    preferencije,
    dani,
    passengers,
    katalog = null,
    requestId
  }) {
    const eksterne = await this.attractionService.fetch(
      zaIzvor(odrediste, {
        city: gradZaIzvor,
        countryCode: drzava,
        interests: preferencije.interests,
        // `kinds` iz kategorija u bazi - izvor ne drzi svoju kopiju mape
        ...(katalog
          ? { kinds: kindoviZa(preferencije.interests, katalog), ...geoZa(preferencije.interests, katalog) }
          : {}),
        // Koliko aktivnosti plan trazi - izvor iz toga racuna velicinu
        // upita, umesto fiksnih 30 objekata
        targetCount: ukupanCilj(dani)
      }),
      requestId
    );

    /*
     * Atrakcije administratora (spec §4.5). Idu uz eksterne, a ne umesto
     * njih; isto mesto iz oba izvora ostaje kao JEDAN zapis, i to onaj
     * administratorov. Zato gradovi bez OpenTripMap podataka mogu da
     * dobiju plan cim im administrator unese atrakcije.
     */
    const adminske = await this.adminAtrakcije.zaGrad(odrediste?.id || null, requestId);
    const { spojene: sveAtrakcije, duplikata } = spoji(eksterne, adminske);

    if (adminske.length > 0) {
      console.log(
        `[PLANNER] Atrakcije administratora: ${adminske.length}` +
          `${duplikata > 0 ? `, spojeno sa eksternim: ${duplikata}` : ''}`
      );
    }

    const { izabrane, sve: ocenjeneAtrakcije } = izaberiAtrakcije(sveAtrakcije, {
      interesovanja: preferencije.interests,
      ciljniBroj: ukupanCilj(dani),
      raspolozivoMinuta: ukupnoVreme(dani),
      katalog
    });

    // Opis i slika samo za ono sto je uslo u plan
    await this._dodajDetalje(izabrane, requestId);

    const procenaUlaznica = izabrane.reduce((z, a) => z + (a.price || 0), 0) * passengers;

    return { sveAtrakcije, izabrane, ocenjeneAtrakcije, procenaUlaznica };
  }

  /**
   * FAZE 4 i 5 sa racunom troska i upozorenjima.
   *
   * Izdvojene da bi `replan` mogao da ih pokrene nad VEC
   * izabranim letom i smestajem, bez nove pretrage - ista logika, jedno
   * mesto, bez druge kopije.
   */
  async _faze45({
    dani,
    izabrane,
    sveAtrakcije,
    ocenjeneAtrakcije,
    izabranLet,
    izabranSmestaj,
    odrediste = null,
    letovi = [],
    smestaji = [],
    preferencije,
    grad,
    drzava,
    numDays,
    passengers,
    budget,
    upozorenja = [],
    random
  }) {
    // ---------------------------------------------------------------
    // FAZA 4: raspodela po danima
    // ---------------------------------------------------------------
    const { raspored, slobodniDani } = rasporediPoDanima(izabrane, dani, { random });

    // ---------------------------------------------------------------
    // FAZA 5: redosled i satnica
    // ---------------------------------------------------------------
    const polaziste = izabranSmestaj?.lat && izabranSmestaj?.lon
      ? { lat: izabranSmestaj.lat, lon: izabranSmestaj.lon }
      : null;

    const itinerary = [];
    const uklonjene = [];

    for (const dan of dani) {
      const zaDan = raspored.get(dan.day) || [];
      const start = polaziste || this._centroid(zaDan);

      const sastavljen = sastaviDan({ atrakcije: zaDan, start, dan });

      // Dan koji ima vremena, ali nije dobio nijednu atrakciju
      const slobodan = slobodniDani.includes(dan.day);

      itinerary.push({
        day: dan.day,
        date: dan.date,
        availableFrom: dan.availableFrom,
        availableTo: dan.availableTo,
        freeDay: slobodan,
        note: slobodan
          ? 'Nema više atrakcija koje odgovaraju izabranom tempu i interesovanjima'
          : dan.note,
        accommodation: izabranSmestaj,
        flight: this._letZaDan(dan, dani, izabranLet),
        attractions: sastavljen.attractions,
        lunch: sastavljen.lunch,
        totalDistance: sastavljen.totalDistance,
        estimatedBudget: sastavljen.attractions.reduce((z, a) => z + (a.price || 0), 0)
      });

      uklonjene.push(...sastavljen.removedAttractions.map((a) => ({ ...a, day: dan.day })));
    }

    // Zatvorene atrakcije prvo idu drugom danu sa slobodnim mestom
    const preostaleUklonjene = this._premestiUDrugiDan({
      uklonjene,
      itinerary,
      dani,
      polaziste
    });

    // ---------------------------------------------------------------
    // Trosak i upozorenja
    // ---------------------------------------------------------------
    const totalBudget = this._trosak({
      let_: izabranLet,
      smestaj: izabranSmestaj,
      itinerary,
      numDays,
      passengers,
      budget
    });

    if (totalBudget.overBudget) {
      upozorenja.push(
        `Plan premasuje budzet za ${totalBudget.overBy} EUR - ponude nisu odsecene, ` +
        'izaberi jeftiniju varijantu ako zelis'
      );
    }

    // Spec §4.8: rezervacija je ogranicena na 9 putnika, pretraga nije
    if (passengers > MAX_PUTNIKA_PO_REZERVACIJI) {
      upozorenja.push(
        `Za vise od ${MAX_PUTNIKA_PO_REZERVACIJI} putnika let se rezervise u vise delova`
      );
    }

    // --- tempo koji nije mogao da se ispuni (§2.3) ---
    if (slobodniDani.length > 0) {
      upozorenja.push(
        `Pronađeno je ${izabrane.length} atrakcija, a izabrani tempo traži ${ukupanCilj(dani)}. ` +
        `${slobodniDani.length} ${slobodniDani.length === 1 ? 'dan je ostavljen' : 'dana je ostavljeno'} ` +
        'slobodno — dodajte interesovanja ili izaberite opušteniji tempo'
      );
    }

    // Dan je dobio grupu, ali u njega nije stalo sve zbog trajanja poseta
    const skraceniDani = itinerary.filter((d, i) => {
      const cilj = dani[i]?.targetCount ?? 0;
      return cilj > 0 && !d.freeDay && d.attractions.length < cilj;
    });

    if (skraceniDani.length > 0) {
      upozorenja.push(
        `${OPIS_TEMPA[preferencije.pace] ?? 'Izabrani'} tempo: u pojedine dane stalo je manje ` +
        'aktivnosti zbog trajanja poseta'
      );
    }

    // Grad bez aerodroma - korisnik mora da zna gde se sleće (§2.4)
    const a = aerodromDolaska(odrediste, izabranLet);

    if (a && Number(a.udaljenostKm) > PRAG_AERODROMA_U_GRADU_KM) {
      const ukupno = TRANSFER_PO_DOLASKU_MIN + voznjaOdAerodroma(a.udaljenostKm);

      upozorenja.push(
        `Let ide do aerodroma ${a.iata}${a.naziv ? ` (${a.naziv})` : ''}, ` +
        `${Math.round(a.udaljenostKm)} km od grada ${odrediste.naziv} — ` +
        `procenjen transfer ${uTrajanje(ukupno)}, uračunat u prvi i poslednji dan`
      );
    }

    if (letovi.length === 0) upozorenja.push('Za ovu rutu i datume nije pronađen nijedan let');
    if (smestaji.length === 0) upozorenja.push('Za ovaj grad i datume nije pronađen nijedan smeštaj');

    // Bez atrakcija plan ostaje niz praznih dana - korisnik mora da zna zasto.
    // Izvor (API) se ne imenuje: to je interni podatak, ne tekst za korisnika.
    if (sveAtrakcije.length === 0) {
      upozorenja.push(
        `Za ${odrediste?.naziv || 'ovaj grad'} trenutno nema dostupnih atrakcija — ` +
        'dani su zato prazni'
      );
    } else if (izabrane.length === 0) {
      upozorenja.push('Nijedna atrakcija ne odgovara izabranim interesovanjima');
    }

    return {
      flights: letovi,
      accommodations: smestaji,
      selectedFlight: izabranLet,
      selectedAccommodation: izabranSmestaj,
      itinerary,
      totalDays: numDays,
      totalBudget,
      removedAttractions: preostaleUklonjene,
      warnings: upozorenja,
      preferences: preferencije,
      meta: {
        destinationCity: grad,
        destinationCountry: drzava,
        sources: {
          flights: this.flightService.poslednjiIzvor || null,
          accommodations: this.accommodationService.poslednjiIzvor || null,
          attractions: this.attractionService.poslednjiIzvor || null
        },
        attractionsFound: ocenjeneAtrakcije.length,
        attractionsSelected: izabrane.length,
        targetActivities: ukupanCilj(dani),
        daysWithoutAttractions: itinerary.filter((d) => d.attractions.length === 0).length
      }
    };
  }

  /** Sredisnja tacka grupe - rezerva kada smestaj nema koordinate. */
  _centroid(atrakcije) {
    if (!atrakcije || atrakcije.length === 0) return null;

    return {
      lat: atrakcije.reduce((z, a) => z + (a.lat || 0), 0) / atrakcije.length,
      lon: atrakcije.reduce((z, a) => z + (a.lon || 0), 0) / atrakcije.length
    };
  }

  /** Let se prikazuje prvog dana (odlazak) i poslednjeg (povratak). */
  _letZaDan(dan, dani, let_) {
    if (!let_) return null;
    if (dan.day === 1) return let_;
    if (dan.day === dani.length && let_.inbound) return let_;

    return null;
  }

  /**
   * Atrakcija izbacena zbog radnog vremena prvo se nudi drugom danu koji
   * ima slobodan kapacitet (spec §6.4 t.4). Vraca one koje nisu smestene.
   */
  _premestiUDrugiDan({ uklonjene, itinerary, dani, polaziste }) {
    const zaPremestanje = uklonjene.filter((a) => a.reason === 'zatvoreno u vreme dolaska');
    const ostale = uklonjene.filter((a) => a.reason !== 'zatvoreno u vreme dolaska');

    const nesmestene = [];

    for (const atrakcija of zaPremestanje) {
      let smestena = false;

      for (const dan of dani) {
        if (dan.day === atrakcija.day || dan.targetCount === 0) continue;

        const zapis = itinerary.find((d) => d.day === dan.day);
        if (!zapis || zapis.attractions.length >= dan.targetCount) continue;

        const kandidat = [...zapis.attractions, atrakcija];
        const start = polaziste || this._centroid(kandidat);
        const satnica = napraviSatnicu({ redosled: kandidat, start, dan });

        if (satnica.zatvorene.length > 0 || satnica.nestale.length > 0) continue;

        zapis.attractions = satnica.stavke;
        zapis.lunch = satnica.lunch;
        zapis.totalDistance = satnica.totalDistance;
        zapis.estimatedBudget = satnica.stavke.reduce((z, a) => z + (a.price || 0), 0);

        smestena = true;
        break;
      }

      if (!smestena) nesmestene.push(atrakcija);
    }

    return [...ostale, ...nesmestene];
  }

  /**
   * Ukupan trosak po stavkama (spec §4.7).
   * Cena leta je vec za sve putnike i oba smera; smestaj se mnozi brojem
   * noci; ulaznice brojem putnika.
   */
  _trosak({ let_, smestaj, itinerary, numDays, passengers, budget }) {
    const cenaLeta = let_ ? Number(let_.priceEUR ?? let_.price ?? 0) : 0;
    const cenaSmestaja = smestaj ? ukupnaCena(smestaj) : 0;

    const cenaAtrakcija =
      itinerary.reduce((z, d) => z + (d.estimatedBudget || 0), 0) * passengers;

    const ukupno = cenaLeta + cenaSmestaja + cenaAtrakcija;
    const zaokruzi = (v) => Math.round(v * 100) / 100;

    const preko = budget ? ukupno - budget : 0;

    return {
      flights: zaokruzi(cenaLeta),
      accommodations: zaokruzi(cenaSmestaja),
      attractions: zaokruzi(cenaAtrakcija),
      total: zaokruzi(ukupno),
      currency: 'EUR',
      overBudget: budget ? preko > 0 : false,
      overBy: budget && preko > 0 ? zaokruzi(preko) : 0
    };
  }
}

module.exports = TravelPlanner;
