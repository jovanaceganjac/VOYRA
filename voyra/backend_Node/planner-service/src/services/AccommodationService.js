const axios = require('axios');

const INTEGRATION_URL = process.env.INTEGRATION_SERVICE_URL || 'http://localhost:4003';
const TIMEOUT = parseInt(process.env.INTEGRATION_TIMEOUT_MS, 10) || 10000;

/**
 * Tanak klijent ka Integration Service-u.
 * Planner ne zna odakle podaci dolaze (Duffel/LiteAPI/OpenTripMap/mock) -
 * to je briga Integration Service-a.
 */
class AccommodationService {
  async fetch(query, requestId) {
    try {
      const odgovor = await axios.get(`${INTEGRATION_URL}/accommodations`, {
        params: query,
        timeout: TIMEOUT,
        headers: requestId ? { 'X-Request-ID': requestId } : {}
      });

      // `source` govori odakle podaci dolaze (duffel/liteapi/cache/mock).
      // Cuva se da bi orchestrator mogao da ga prenese frontendu.
      this.poslednjiIzvor = odgovor.data.source || null;

      return odgovor.data.data || [];
    } catch (err) {
      this.poslednjiIzvor = 'unavailable';
      console.error('[ACCOMMODATION_SERVICE] Error:', err.response?.data?.message || err.message);
      return [];
    }
  }
}

module.exports = AccommodationService;
