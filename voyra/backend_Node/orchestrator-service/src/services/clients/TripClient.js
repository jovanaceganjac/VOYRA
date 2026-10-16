const HttpClient = require('./httpClient');
const { REGISTRY } = require('../../config/serviceRegistry');

/**
 * Klijent ka Trip Service-u (nije kritican).
 * Uvek prosledjuje korisnikov JWT - Trip Service sam proverava vlasnistvo.
 */
class TripClient {
  constructor() {
    this.http = new HttpClient('trip', REGISTRY.trip);
  }

  async get(tripId, token, requestId) {
    const { data } = await this.http.zahtev({
      putanja: `/api/trips/${tripId}`,
      token,
      requestId
    });

    return data.data;
  }

  /** POST /api/trips - telo prema stvarnom ugovoru Trip Service-a. */
  async save(plan, zahtev, token, requestId) {
    const { data, durationMs } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/trips',
      telo: {
        title: zahtev.title || `${zahtev.from} -> ${zahtev.to}`,
        description: zahtev.description,
        from: zahtev.from,
        to: zahtev.to,
        date: zahtev.date || zahtev.checkIn,
        checkIn: zahtev.checkIn,
        checkOut: zahtev.checkOut,
        passengers: zahtev.passengers,
        guests: zahtev.guests || zahtev.passengers,
        budget: zahtev.budget,
        // Gradovi sa aerodromima; `from`/`to` ostaju zbog
        // kompatibilnosti sa ranije sacuvanim putovanjima
        fromCity: zahtev.fromCity,
        toCity: zahtev.toCity,
        // Spec §9: preferencije se cuvaju uz putovanje
        preferences: plan?.preferences || zahtev.preferences,
        itinerary: plan
      },
      token,
      requestId
    });

    return { trip: data.data, durationMs };
  }

  /** Pretraga gradova (spec §4.2) - javna, bez tokena. */
  async cities(q, limit, requestId) {
    const { data } = await this.http.zahtev({
      putanja: `/api/cities?q=${encodeURIComponent(q)}&limit=${limit}`,
      requestId
    });

    return data.data || [];
  }

  async city(id, requestId) {
    const { data } = await this.http.zahtev({
      putanja: `/api/cities/${encodeURIComponent(id)}`,
      requestId
    });

    return data.data;
  }

  /** Grad kome pripada IATA kod - da stari zahtevi i dalje rade. */
  async cityPoIata(kod, requestId) {
    try {
      const { data } = await this.http.zahtev({
        putanja: `/api/cities/by-iata/${encodeURIComponent(kod)}`,
        requestId
      });

      return data.data;
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Cuvanje izmenjenog plana sa proverom verzije.
   * `version` je `updatedAt` putovanja koje je klijent video.
   */
  async sacuvajPlan(tripId, itinerary, { version, budget }, token, requestId) {
    const { data } = await this.http.zahtev({
      metod: 'put',
      putanja: `/api/trips/${tripId}`,
      telo: {
        itinerary,
        ...(budget !== undefined ? { budget } : {}),
        ...(version ? { version } : {})
      },
      token,
      requestId
    });

    return data.data;
  }

  async update(tripId, plan, zahtev, token, requestId) {
    const { data, durationMs } = await this.http.zahtev({
      metod: 'put',
      putanja: `/api/trips/${tripId}`,
      telo: {
        title: zahtev.title,
        description: zahtev.description,
        preferences: plan?.preferences || zahtev.preferences,
        itinerary: plan
      },
      token,
      requestId
    });

    return { trip: data.data, durationMs };
  }

  // =================================================================
  // Destinacije i statistika pretraga (spec §4.1)
  // =================================================================

  /** Istaknute destinacije, poredjane kako ih je admin poredjao. */
  async destinacijeIstaknute(requestId) {
    const { data } = await this.http.zahtev({
      putanja: '/internal/destinations',
      internalKey: process.env.INTERNAL_API_KEY,
      requestId
    });

    return data.data || [];
  }

  /** Popularne destinacije poslednjih 30 dana. */
  async destinacijePopularne(limit, requestId) {
    const { data } = await this.http.zahtev({
      putanja: `/internal/destinations/popular?limit=${encodeURIComponent(limit)}`,
      internalKey: process.env.INTERNAL_API_KEY,
      requestId
    });

    return data.data || [];
  }

  /**
   * Belezi pretragu ili sacuvan plan po gradu odredista.
   *
   * "Posalji i zaboravi": statistika pocetne strane ne sme da uspori ni
   * da obori planiranje, pa se greska samo ispisuje.
   */
  async zabeleziPretragu({ gradId, vrsta, userId, sessionId }, requestId) {
    if (!gradId) return;

    try {
      await this.http.zahtev({
        metod: 'post',
        putanja: '/internal/search-stats',
        telo: { gradId, vrsta, userId, sessionId },
        internalKey: process.env.INTERNAL_API_KEY,
        requestId
      });
    } catch (err) {
      console.warn('[ORCHESTRATOR] Statistika pretrage nije zabelezena:', err.message);
    }
  }
}

module.exports = TripClient;
