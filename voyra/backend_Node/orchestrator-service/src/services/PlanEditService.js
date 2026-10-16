const PlannerClient = require('./clients/PlannerClient');
const TripClient = require('./clients/TripClient');
const AdminClient = require('./clients/AdminClient');
const CityResolver = require('./CityResolver');

/** Statusi u kojima se plan sme menjati (spec §4.9). */
const IZMENJIVI_STATUSI = ['NACRT', 'REZERVISANO'];

/**
 * IZMENA PLANA (spec §4.6).
 *
 * Pravila koja ovaj servis čuva:
 *   - menja se samo NACRT i REZERVISANO; ostalo je za čitanje;
 *   - let i smeštaj se izmenom plana NE diraju, samo aktivnosti;
 *   - klijent šalje samo `id`-jeve atrakcija, nikad ceo objekat - inače
 *     bi mogao da podmetne svoju cenu ili koordinate (isto pravilo kao
 * kod izbora leta);
 *   - posle ručne izmene ništa se ne izbacuje samo od sebe: problem se
 *     obeleži (`violation`), a odluka ostaje korisniku.
 */
class PlanEditService {
  constructor() {
    this.planner = new PlannerClient();
    this.trip = new TripClient();
    this.admin = new AdminClient();
    this.gradovi = new CityResolver();
  }

  _greska(poruka, kod, status) {
    const e = new Error(poruka);
    e.code = kod;
    e.statusCode = status;
    return e;
  }

  /** Verzija putovanja za uslovno čuvanje; `updatedAt` je dovoljan. */
  verzija(trip) {
    return trip?.updatedAt ? new Date(trip.updatedAt).toISOString() : null;
  }

  jeIzmenjivo(trip) {
    return IZMENJIVI_STATUSI.includes(trip?.status);
  }

  /** Putovanje sa proverom vlasništva (Trip Service vraća 404 za tuđe). */
  async ucitaj(tripId, token, requestId) {
    const trip = await this.trip.get(tripId, token, requestId);

    if (!trip) throw this._greska('Putovanje nije pronađeno', 'NOT_FOUND', 404);

    return trip;
  }

  _zaIzmenu(trip) {
    if (!this.jeIzmenjivo(trip)) {
      throw this._greska(
        `Putovanje u statusu ${trip.status} se više ne menja`,
        'NOT_EDITABLE',
        409
      );
    }
  }

  // ---------------------------------------------------------------
  // Razrešavanje atrakcija po id-ju
  // ---------------------------------------------------------------

  /** Sve atrakcije koje su već u planu, po id-ju. */
  _izPlana(trip) {
    const mapa = new Map();

    for (const dan of trip.itinerary?.itinerary || []) {
      for (const a of dan.attractions || []) mapa.set(String(a.id), a);
    }

    return mapa;
  }

  /**
   * Atrakcije za odredište putovanja - isti izvor kao `/v1/attractions`,
   * pa ide iz keša Integration Service-a (7 dana).
   */
  /**
   * Opis odredista koji Planner ocekuje.
   *
   * Bez njega bi Planner kao naziv grada koristio sam IATA kod, pa bi
   * izvor atrakcija trazio grad „ATH" i vratio prazno. Grad se uzima iz
   * sacuvanog putovanja, a putovanja sacuvana ranije se razresavaju
   * po IATA kodu.
   */
  async _opisOdredista(trip, requestId) {
    const grad = await this.gradovi
      .razresi({ cityId: trip.toCity?.id || null, iata: trip.to }, requestId)
      .catch(() => null);

    return this.gradovi.opisZaPlanner(grad);
  }

  async _zaOdrediste(trip, requestId) {
    try {
      const r = await this.planner.attractions(
        {
          to: trip.to,
          destination: await this._opisOdredista(trip, requestId),
          preferences: trip.preferences || {}
        },
        requestId
      );

      return new Map((r.atrakcije || []).map((a) => [String(a.id), a]));
    } catch (err) {
      console.warn('[IZMENA] Lista atrakcija nije dostupna:', err.message);
      return new Map();
    }
  }

  /**
   * `attractionIds` -> objekti atrakcija.
   *
   * @throws 400 za nepoznat id ili ponovljenu atrakciju
   */
  async razresiAtrakcije(trip, daniIzmene, requestId) {
    const uPlanu = this._izPlana(trip);

    const sviTrazeni = daniIzmene.flatMap((d) => (d.attractionIds || []).map(String));
    const nepoznati = sviTrazeni.filter((id) => !uPlanu.has(id));

    // Spisak sa odredišta se povlači samo ako ima novih atrakcija
    const izvor = nepoznati.length > 0 ? await this._zaOdrediste(trip, requestId) : new Map();

    const razreseni = new Map();
    const novi = [];

    for (const id of sviTrazeni) {
      if (razreseni.has(id)) continue;

      const postojeca = uPlanu.get(id);

      if (postojeca) {
        razreseni.set(id, postojeca);
        continue;
      }

      const nova = izvor.get(id);

      if (!nova) {
        throw this._greska(
          `Atrakcija ${id} ne postoji među atrakcijama za ovo odredište`,
          'UNKNOWN_ATTRACTION',
          400
        );
      }

      razreseni.set(id, { ...nova });
      novi.push(id);
    }

    // Nove atrakcije dobijaju sliku i opis
    if (novi.length > 0) await this._dodajDetalje(razreseni, novi, requestId);

    return razreseni;
  }

  async _dodajDetalje(razreseni, ids, requestId) {
    try {
      const detalji = await this.planner.attractionDetails(ids, requestId);

      for (const d of detalji) {
        const a = razreseni.get(String(d.id));
        if (!a) continue;

        if (d.description && !a.description) a.description = d.description;
        a.image = d.image || a.image || null;
      }
    } catch (err) {
      // Bez slike se plan i dalje čuva
      console.warn('[IZMENA] Detalji atrakcija nisu dostupni:', err.message);
    }
  }

  /** Ista atrakcija ne sme da bude dvaput u planu (ni u istom ni u drugom danu). */
  proveriDuplikate(trip, daniIzmene) {
    const izmenjeni = new Set(daniIzmene.map((d) => Number(d.day)));
    const vidjeni = new Map();

    // Dani koje izmena ne dira ostaju kakvi jesu, ali i oni broje
    for (const dan of trip.itinerary?.itinerary || []) {
      if (izmenjeni.has(Number(dan.day))) continue;

      for (const a of dan.attractions || []) vidjeni.set(String(a.id), dan.day);
    }

    for (const d of daniIzmene) {
      for (const id of (d.attractionIds || []).map(String)) {
        if (vidjeni.has(id)) {
          throw this._greska(
            `Atrakcija ${id} je već u planu (dan ${vidjeni.get(id)})`,
            'DUPLICATE_ATTRACTION',
            400
          );
        }

        vidjeni.set(id, d.day);
      }
    }
  }

  // ---------------------------------------------------------------
  // Preračunavanje dana
  // ---------------------------------------------------------------

  /** Polazna tačka dana je smeštaj; bez njega planer uzima središte grupe. */
  polaziste(trip) {
    const s = trip.itinerary?.selectedAccommodation || trip.itinerary?.accommodations?.[0];

    return Number.isFinite(s?.lat) && Number.isFinite(s?.lon)
      ? { lat: s.lat, lon: s.lon }
      : null;
  }

  /**
   * Preračunava izmenjene dane kroz planner (`schedule-day`).
   * Ne čuva ništa - to radi pozivalac.
   *
   * @returns {{ dani: Array, itinerary: Array }} izmenjeni dani i ceo plan
   */
  async preracunaj(trip, daniIzmene, requestId, { optimizuj = false } = {}) {
    this.proveriDuplikate(trip, daniIzmene);

    const razreseni = await this.razresiAtrakcije(trip, daniIzmene, requestId);
    const start = this.polaziste(trip);

    const postojeci = trip.itinerary?.itinerary || [];
    const noviDani = [];

    for (const izmena of daniIzmene) {
      const broj = Number(izmena.day);
      const stari = postojeci.find((d) => Number(d.day) === broj);

      if (!stari) {
        throw this._greska(`Dan ${izmena.day} ne postoji u planu`, 'UNKNOWN_DAY', 400);
      }

      const telo = {
        day: {
          day: broj,
          date: stari.date,
          availableFrom: stari.availableFrom,
          availableTo: stari.availableTo,
          note: stari.note
        },
        start,
        attractions: (izmena.attractionIds || []).map((id) => razreseni.get(String(id)))
      };

      const dan = optimizuj
        ? await this.planner.optimizeDay(telo, requestId)
        : await this.planner.scheduleDay(telo, requestId);

      // Let i smeštaj ostaju netaknuti - izmena dira samo aktivnosti
      noviDani.push({
        ...stari,
        ...dan,
        flight: stari.flight,
        accommodation: stari.accommodation,
        freeDay: (dan.attractions || []).length === 0 ? stari.freeDay : false
      });
    }

    const spojeni = postojeci.map((d) => noviDani.find((n) => n.day === d.day) || d);

    return { dani: noviDani, itinerary: spojeni };
  }

  /**
   * Trošak posle izmene (spec §4.7).
   * Let i smeštaj su nepromenjeni; menja se samo zbir ulaznica.
   */
  izracunajTrosak(trip, itinerary) {
    const stari = trip.itinerary?.totalBudget || {};
    const putnika = Number(trip.passengers) || 1;

    const ulaznice = itinerary.reduce(
      (zbir, dan) => zbir + (dan.attractions || []).reduce((z, a) => z + (a.price || 0), 0),
      0
    );

    const letovi = Number(stari.flights) || 0;
    const smestaj = Number(stari.accommodations) || 0;
    const total = Math.round((letovi + smestaj + ulaznice * putnika) * 100) / 100;

    const budzet = Number(trip.budget);
    // `budget` u putovanju ume da bude cena plana kada korisnik budžet
    // nije uneo - tada prekoračenja nema
    const imaBudzet = Number.isFinite(budzet) && budzet > 0;

    return {
      ...stari,
      attractions: Math.round(ulaznice * putnika * 100) / 100,
      total,
      currency: stari.currency || 'EUR',
      overBudget: imaBudzet ? total > budzet : false,
      overBy: imaBudzet && total > budzet ? Math.round((total - budzet) * 100) / 100 : 0
    };
  }

  // ---------------------------------------------------------------
  // Javne operacije
  // ---------------------------------------------------------------

  /** Pregled izmene bez čuvanja. */
  async preview(tripId, daniIzmene, { token, requestId }) {
    const trip = await this.ucitaj(tripId, token, requestId);
    this._zaIzmenu(trip);

    const { dani, itinerary } = await this.preracunaj(trip, daniIzmene, requestId);

    return {
      days: dani,
      totalBudget: this.izracunajTrosak(trip, itinerary),
      version: this.verzija(trip)
    };
  }

  /** Optimizacija redosleda jednog dana; takođe bez čuvanja. */
  async optimizujDan(tripId, brojDana, attractionIds, { token, requestId }) {
    const trip = await this.ucitaj(tripId, token, requestId);
    this._zaIzmenu(trip);

    const postojeci = (trip.itinerary?.itinerary || []).find(
      (d) => Number(d.day) === Number(brojDana)
    );

    if (!postojeci) throw this._greska(`Dan ${brojDana} ne postoji u planu`, 'UNKNOWN_DAY', 400);

    // Bez poslatog redosleda uzima se onaj koji je sačuvan
    const ids = Array.isArray(attractionIds) && attractionIds.length > 0
      ? attractionIds
      : (postojeci.attractions || []).map((a) => a.id);

    const { dani, itinerary } = await this.preracunaj(
      trip,
      [{ day: Number(brojDana), attractionIds: ids }],
      requestId,
      { optimizuj: true }
    );

    return {
      day: dani[0],
      totalBudget: this.izracunajTrosak(trip, itinerary),
      version: this.verzija(trip)
    };
  }

  /** Čuvanje izmene uz proveru verzije. */
  async sacuvaj(tripId, daniIzmene, version, { token, requestId, user }) {
    const trip = await this.ucitaj(tripId, token, requestId);
    this._zaIzmenu(trip);

    const { itinerary } = await this.preracunaj(trip, daniIzmene, requestId);
    const totalBudget = this.izracunajTrosak(trip, itinerary);

    const noviPlan = { ...trip.itinerary, itinerary, totalBudget };

    const sacuvan = await this.trip.sacuvajPlan(
      tripId,
      noviPlan,
      { version, budget: trip.budget },
      token,
      requestId
    );

    this.admin
      .log(
        {
          action: 'EDIT_PLAN',
          userId: user?.id || null,
          target: tripId,
          status: 'SUCCESS',
          metadata: { izmenjenoDana: daniIzmene.length }
        },
        requestId
      )
      .catch(() => {});

    return sacuvan;
  }

  /**
   * "Generiši ponovo" (spec §4.6).
   *
   * Letovi i smeštaj se NE pretražuju ponovo: Duffel ponuda u međuvremenu
   * istekne, a rezervisan let ne sme da se promeni pod nogama korisniku.
   */
  async regenerisi(tripId, { token, requestId, user }) {
    const trip = await this.ucitaj(tripId, token, requestId);
    this._zaIzmenu(trip);

    const stari = trip.itinerary || {};

    const { itinerary } = await this.planner.replan(
      {
        to: trip.to,
        // Bez opisa grada izvor atrakcija ne bi nasao odrediste
        destination: await this._opisOdredista(trip, requestId),
        checkIn: trip.checkIn,
        checkOut: trip.checkOut,
        passengers: trip.passengers,
        budget: trip.budget,
        preferences: trip.preferences || stari.preferences,
        flight: stari.selectedFlight || stari.flights?.[0] || null,
        accommodation: stari.selectedAccommodation || stari.accommodations?.[0] || null
      },
      requestId
    );

    const sacuvan = await this.trip.sacuvajPlan(
      tripId,
      itinerary,
      { version: null, budget: trip.budget },
      token,
      requestId
    );

    this.admin
      .log(
        {
          action: 'REGENERATE_PLAN',
          userId: user?.id || null,
          target: tripId,
          status: 'SUCCESS',
          metadata: { dana: itinerary.itinerary?.length || 0 }
        },
        requestId
      )
      .catch(() => {});

    return sacuvan;
  }
}

module.exports = PlanEditService;
