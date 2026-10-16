const axios = require('axios');

const INTEGRATION_URL = process.env.INTEGRATION_SERVICE_URL || 'http://localhost:4003';
const TIMEOUT = parseInt(process.env.INTEGRATION_TIMEOUT_MS, 10) || 10000;

/**
 * Tanak klijent ka Integration Service-u.
 * Planner ne zna odakle podaci dolaze (Duffel/LiteAPI/OpenTripMap/mock) -
 * to je briga Integration Service-a.
 */
class AttractionService {
  async fetch(query, requestId) {
    // Interesovanja idu kao lista razdvojena zarezom - axios bi niz
    // serijalizovao kao `interests[]=`, sto Integration Service ne cita
    const params = {
      ...query,
      ...(Array.isArray(query.interests) ? { interests: query.interests.join(',') } : {}),
      // Isto vazi za `kinds` iz kategorija u bazi
      ...(Array.isArray(query.kinds) ? { kinds: query.kinds.join(',') } : {}),
      // Geoapify kategorije; mapa ide kao JSON, jer axios
      // objekat u query stringu ne bi serijalizovao citljivo
      ...(Array.isArray(query.geoCategories)
        ? { geoCategories: query.geoCategories.join(',') }
        : {}),
      ...(query.categoryMap ? { categoryMap: JSON.stringify(query.categoryMap) } : {})
    };

    try {
      const odgovor = await axios.get(`${INTEGRATION_URL}/attractions`, {
        params,
        timeout: TIMEOUT,
        headers: requestId ? { 'X-Request-ID': requestId } : {}
      });

      // `source` govori odakle podaci dolaze (duffel/liteapi/cache/mock).
      // Cuva se da bi orchestrator mogao da ga prenese frontendu.
      this.poslednjiIzvor = odgovor.data.source || null;

      return odgovor.data.data || [];
    } catch (err) {
      this.poslednjiIzvor = 'unavailable';
      console.error('[ATTRACTION_SERVICE] Error:', err.response?.data?.message || err.message);
      return [];
    }
  }

  /**
   * Opis i slika za IZABRANE atrakcije.
   *
   * Detalj je jedan poziv po atrakciji kod spoljnog izvora, pa se trazi
   * tek kada se zna sta ulazi u plan. Neuspeh ne obara plan - atrakcije
   * ostaju bez slike.
   */
  /** `veze` (id -> Wikipedia naslov) je opciono - izvor slike za Geoapify. */
  async detalji(ids, requestId, veze = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return [];

    try {
      const odgovor = await axios.post(
        `${INTEGRATION_URL}/attractions/details`,
        { ids, veze },
        { timeout: TIMEOUT, headers: requestId ? { 'X-Request-ID': requestId } : {} }
      );

      return odgovor.data.data || [];
    } catch (err) {
      console.error('[ATTRACTION_SERVICE] Detalji:', err.response?.data?.message || err.message);
      return [];
    }
  }
}

module.exports = AttractionService;
