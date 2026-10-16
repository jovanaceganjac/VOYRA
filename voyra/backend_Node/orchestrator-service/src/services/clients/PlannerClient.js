const HttpClient = require('./httpClient');
const { REGISTRY } = require('../../config/serviceRegistry');

/**
 * Klijent ka Planner Service-u (KRITICAN).
 *
 * Planner je jedini koji zna algoritam i dozvoljene vrednosti
 * preferencija, pa orchestrator sve to trazi od njega.
 */
/**
 * Koliko dugo vazi zapamcena shema preferencija.
 *
 * Ranije se pamtila zauvek, jer je lista interesovanja bila
 * konstanta u kodu. Sada je uredjuje administrator, pa bi trajan kes
 * znacio da se ugasena kategorija i dalje nudi u koraku 1 sve do
 * restarta orchestratora. 60 s je isto koliko i kes u Planneru.
 */
const KES_SHEME_MS = 60 * 1000;

class PlannerClient {
  constructor() {
    this.http = new HttpClient('planner', REGISTRY.planner);
    this._schema = null;
    this._shemaVaziDo = 0;
  }

  /**
   * Dozvoljene vrednosti preferencija (spec §4.2).
   *
   * Kada Planner ne odgovori, vraca se poslednja poznata shema ako je
   * ima, inace `null` - orchestrator tada preskace proveru pripadnosti,
   * a Planner ce je svejedno uraditi.
   */
  async schema(requestId) {
    if (this._schema && Date.now() < this._shemaVaziDo) return this._schema;

    try {
      const { data } = await this.http.zahtev({
        metod: 'get',
        putanja: '/api/planner/preferences/schema',
        requestId
      });

      this._schema = data.data;
      this._shemaVaziDo = Date.now() + KES_SHEME_MS;

      return this._schema;
    } catch (err) {
      console.warn('[PLANNER_CLIENT] Schema preferencija nije dostupna:', err.message);

      // Zastarela shema je bolja od nikakve - bar validacija nastavlja da radi
      return this._schema || null;
    }
  }

  /** FAZA 1: rangirani letovi (korak 2 carobnjaka). */
  async flights(zahtev, requestId) {
    const { data, durationMs } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/flights',
      telo: zahtev,
      requestId
    });

    return { ponude: data.data, source: data.source, durationMs };
  }

  /** FAZA 2: rangirani smestaj (korak 3 carobnjaka). */
  async accommodations(zahtev, requestId) {
    const { data, durationMs } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/accommodations',
      telo: zahtev,
      requestId
    });

    return { ponude: data.data, warnings: data.warnings || [], source: data.source, durationMs };
  }

  /** FAZA 3 bez izbora: ocenjene atrakcije za stranicu „Atrakcije". */
  async attractions(zahtev, requestId) {
    const { data, durationMs } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/attractions',
      telo: zahtev,
      requestId
    });

    return { atrakcije: data.data, source: data.source, durationMs };
  }

  /** Ceo plan (svih pet faza). */
  async plan(zahtev, requestId) {
    const { data, durationMs } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/plan',
      telo: {
        from: zahtev.from,
        to: zahtev.to,
        date: zahtev.date || zahtev.checkIn, // planner trazi datum polaska
        checkIn: zahtev.checkIn,
        checkOut: zahtev.checkOut,
        passengers: zahtev.passengers,
        guests: zahtev.guests || zahtev.passengers,
        budget: zahtev.budget,
        preferences: zahtev.preferences,
        // Opis gradova sa koordinatama - Planner vise ne
        // pogadja grad iz IATA koda
        destination: zahtev.destination,
        origin: zahtev.origin,
        selectedFlightOfferId: zahtev.selectedFlightOfferId,
        selectedAccommodationId: zahtev.selectedAccommodationId,
        filteri: zahtev.filteri
      },
      requestId
    });

    return { itinerary: data.data, durationMs };
  }
  /** Opis i slika za rucno dodate atrakcije. */
  async attractionDetails(ids, requestId) {
    const { data } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/attraction-details',
      telo: { ids },
      requestId
    });

    return data.data || [];
  }

  /** Prozori dana za zadati let. */
  async tripDays(telo, requestId) {
    const { data } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/trip-days',
      telo,
      requestId
    });

    return data.data || [];
  }

  /** Satnica jednog dana nad ZADATIM redosledom. */
  async scheduleDay(telo, requestId) {
    const { data } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/schedule-day',
      telo,
      requestId
    });

    return data.data;
  }

  /** "Optimizuj redosled" za jedan dan (spec §4.6). */
  async optimizeDay(telo, requestId) {
    const { data } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/optimize-day',
      telo,
      requestId
    });

    return data.data;
  }

  /** "Generisi ponovo": faze 3-5 sa vec izabranim letom i smestajem. */
  async replan(telo, requestId) {
    const { data, durationMs } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/planner/replan',
      telo,
      requestId
    });

    return { itinerary: data.data, durationMs };
  }
}

module.exports = PlannerClient;