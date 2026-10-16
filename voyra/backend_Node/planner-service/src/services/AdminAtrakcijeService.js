const axios = require('axios');

const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || 'http://localhost:4002';
const TIMEOUT = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 5000;

/**
 * ATRAKCIJE ADMINISTRATORA (spec §4.5).
 *
 * Tanak klijent ka Trip Service-u. Nedostupan servis NE obara plan:
 * vraca se prazna lista, pa plan nastavlja samo sa eksternim izvorom.
 */
class AdminAtrakcijeService {
  async zaGrad(gradId, requestId) {
    if (!gradId) return [];

    try {
      const { data } = await axios.get(`${TRIP_SERVICE_URL}/internal/attractions/planner`, {
        params: { gradId: String(gradId) },
        headers: {
          'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
          ...(requestId ? { 'X-Request-ID': requestId } : {})
        },
        timeout: TIMEOUT
      });

      return data?.data || [];
    } catch (err) {
      console.warn('[PLANNER] Atrakcije administratora nisu ucitane:', err.message);
      return [];
    }
  }
}

module.exports = AdminAtrakcijeService;
