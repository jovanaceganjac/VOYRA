const axios = require('axios');

const INTEGRATION_URL = process.env.INTEGRATION_SERVICE_URL || 'http://localhost:4003';
const TIMEOUT = parseInt(process.env.INTEGRATION_TIMEOUT_MS, 10) || 10000;

/**
 * Tanak klijent ka Integration Service-u.
 * Planner ne zna odakle podaci dolaze (Duffel/LiteAPI/OpenTripMap/mock) -
 * to je briga Integration Service-a.
 */
class FlightService {
  async fetch(query, requestId) {
    try {
      const odgovor = await axios.get(`${INTEGRATION_URL}/flights`, {
        // Koordinate idu kao "lat,lon" - axios bi objekat serijalizovao
        // kao `odKoordinate[lat]=`, sto Integration Service ne cita
        params: {
          ...query,
          ...(query.odKoordinate ? { odKoordinate: query.odKoordinate } : {}),
          ...(query.doKoordinate ? { doKoordinate: query.doKoordinate } : {})
        },
        timeout: TIMEOUT,
        headers: requestId ? { 'X-Request-ID': requestId } : {}
      });

      // `source` govori odakle podaci dolaze (duffel/liteapi/cache/mock).
      // Cuva se da bi orchestrator mogao da ga prenese frontendu.
      this.poslednjiIzvor = odgovor.data.source || null;

      return odgovor.data.data || [];
    } catch (err) {
      this.poslednjiIzvor = 'unavailable';
      console.error('[FLIGHT_SERVICE] Error:', err.response?.data?.message || err.message);
      return [];
    }
  }

  /**
   * Ponuda izabrana u koraku 2, po `offerId`-ju (Integration Service je
   * cita iz kesa pretrage ili direktno od Duffel-a).
   *
   * Vraca `null` kada ponuda vise ne vazi ili ne postoji (404/410) - to je
   * stvarni istek izbora. Kvar servisa se prosledjuje kao greska, da se
   * ne bi pogresno prijavio istek.
   */
  async izabrana(offerId, requestId) {
    try {
      const odgovor = await axios.get(
        `${INTEGRATION_URL}/internal/flights/selected/${encodeURIComponent(offerId)}`,
        {
          timeout: TIMEOUT,
          headers: {
            'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
            ...(requestId ? { 'X-Request-ID': requestId } : {})
          }
        }
      );

      return odgovor.data.data || null;
    } catch (err) {
      const status = err.response?.status;

      if (status === 404 || status === 410) return null;

      console.error('[FLIGHT_SERVICE] Izabrana ponuda:', err.response?.data?.message || err.message);

      const e = new Error('Izabrani let trenutno ne može da se proveri — pokušajte ponovo');
      e.code = 'FLIGHT_CHECK_UNAVAILABLE';
      e.statusCode = 503;
      throw e;
    }
  }
}

module.exports = FlightService;
