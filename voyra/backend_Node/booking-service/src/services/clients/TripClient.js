const axios = require('axios');

/**
 * Klijent ka Trip Service-u.
 *
 * Citanje putovanja ide javnom rutom sa korisnickim tokenom (vlasnistvo
 * proverava Trip Service), a promena statusa internom rutom - korisnik
 * ne sme sam da proglasi putovanje rezervisanim.
 */
class TripClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.TRIP_SERVICE_URL || 'http://localhost:4002';
    this.timeout = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 10000;
  }

  /** Putovanje korisnika; null kada ne postoji ili nije njegovo. */
  async putovanje(tripId, token) {
    if (!tripId) return null;

    try {
      const r = await axios.get(`${this.baseUrl}/api/trips/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: this.timeout
      });

      return r.data.data;
    } catch (err) {
      console.warn(`[TRIP_CLIENT] Putovanje ${tripId} nedostupno: ${err.message}`);
      return null;
    }
  }

  /**
   * Promena statusa putovanja (spec §4.9).
   *
   * Vraca {ok, razlog} umesto da baca: neuspela promena statusa ne sme
   * da ponisti rezervaciju koja je kod avio-kompanije vec kreirana.
   * Pozivalac to prijavljuje kao upozorenje.
   */
  async promeniStatus(tripId, status, bookingInfo = null, requestId = null) {
    if (!tripId) return { ok: false, razlog: 'Putovanje nije zadato' };

    try {
      await axios.patch(
        `${this.baseUrl}/internal/trips/${tripId}/status`,
        { status, bookingInfo },
        {
          headers: {
            'X-Internal-Key': process.env.INTERNAL_API_KEY,
            ...(requestId ? { 'X-Request-ID': requestId } : {})
          },
          timeout: this.timeout
        }
      );

      return { ok: true };
    } catch (err) {
      const poruka = err.response?.data?.message || err.message;
      console.error(`[TRIP_CLIENT] Status ${tripId} -> ${status} neuspesan: ${poruka}`);

      return { ok: false, razlog: poruka };
    }
  }
}

module.exports = TripClient;
