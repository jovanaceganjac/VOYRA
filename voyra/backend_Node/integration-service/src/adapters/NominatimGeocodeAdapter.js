const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { GeocodeCacheModel, TTL } = require('../models/CacheModels');

const BASE_URL = process.env.NOMINATIM_API_BASE_URL || 'https://nominatim.openstreetmap.org';
const TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 10000;

/**
 * Nominatim trazi da se svaki klijent predstavi (pravila koriscenja).
 * Bez toga servis odgovara sa 403.
 */
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || 'Voyra/1.0 (diplomski rad, ETF Beograd)';

/**
 * Poznati centri gradova za koje postoje mock podaci. Sluze kada
 * Nominatim nije dostupan, da smestaj i dalje dobije udaljenost
 * od centra umesto praznog polja.
 */
const POZNATI_CENTRI = {
  athens: { lat: 37.9838, lon: 23.7275, countryCode: 'GR' },
  belgrade: { lat: 44.7866, lon: 20.4489, countryCode: 'RS' }
};

/**
 * Geokodiranje naziva grada (spec §5: Nominatim/OSM).
 *
 * Daje dve stvari koje drugi adapteri ne mogu sami: koordinate centra
 * grada (za racunanje udaljenosti smestaja) i ISO-2 oznaku drzave
 * (LiteAPI je trazi u pretrazi hotela).
 *
 * Bez kljuca; kes je dugacak jer se koordinate ne menjaju.
 */
class NominatimGeocodeAdapter extends BaseAdapter {
  constructor() {
    super(GeocodeCacheModel, TTL.geocode);
  }

  async _fetchFromNominatim(city, countryCode) {
    const odgovor = await axios.get(`${BASE_URL}/search`, {
      params: {
        city,
        // Bez oznake drzave "Athens" vrati Atinu u Dzordziji (SAD)
        ...(countryCode ? { countrycodes: String(countryCode).toLowerCase() } : {}),
        format: 'json',
        limit: 1,
        addressdetails: 1
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: TIMEOUT
    });

    const prvi = Array.isArray(odgovor.data) ? odgovor.data[0] : null;

    if (!prvi) {
      const greska = new Error(`Nominatim ne poznaje grad: ${city}`);
      greska.code = 'CITY_NOT_FOUND';
      throw greska;
    }

    return {
      lat: parseFloat(prvi.lat),
      lon: parseFloat(prvi.lon),
      countryCode: String(prvi.address?.country_code || '').toUpperCase() || null,
      displayName: prvi.display_name || city
    };
  }

  /**
   * Koordinate i drzava grada. Nikada ne baca: kada ni Nominatim ni
   * ugradjena tabela nemaju grad, vraca null, a pozivalac odlucuje
   * sta dalje.
   */
  async grad(city, countryCode = null) {
    if (!city) return null;

    const kljuc = `geo-${String(city).toLowerCase().trim()}-${countryCode || 'xx'}`;

    const izKesa = await this.getCached(kljuc);
    if (izKesa) return { ...izKesa.data, source: 'cache' };

    try {
      const podaci = await this._fetchFromNominatim(city, countryCode);
      await this.setCache(kljuc, podaci);

      console.log(`[NOMINATIM] ${city} -> ${podaci.lat}, ${podaci.lon} (${podaci.countryCode})`);

      return { ...podaci, source: 'nominatim' };
    } catch (err) {
      console.warn(`[NOMINATIM] ${city}: ${err.message}`);

      const poznat = POZNATI_CENTRI[String(city).toLowerCase().trim()];
      if (poznat) {
        return {
          ...poznat,
          countryCode: countryCode || poznat.countryCode,
          displayName: city,
          source: 'mock-fallback'
        };
      }

      return null;
    }
  }

  async fetch(query) {
    const podaci = await this.grad(query.city, query.countryCode);

    if (!podaci) {
      const greska = new Error(`Grad nije pronadjen: ${query.city}`);
      greska.code = 'CITY_NOT_FOUND';
      greska.statusCode = 404;
      throw greska;
    }

    const { source, ...ostalo } = podaci;

    return { data: ostalo, cached: source === 'cache', source };
  }
}

// Jedna instanca - kes koordinata se deli izmedju adaptera
const geokoder = new NominatimGeocodeAdapter();

module.exports = { geokoder, NominatimGeocodeAdapter, POZNATI_CENTRI };
