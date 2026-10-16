const axios = require('axios');

const BaseAdapter = require('./BaseAdapter');
const { wikipediaAdapter } = require('./WikipediaImageAdapter');
const { loadMockData } = require('../utils/mockData');
const { OPENTRIPMAP, openTripMapKonfigurisan } = require('../config/externalApis');
const { AttractionDetailsCacheModel, TTL } = require('../models/CacheModels');

/** Koliko detalja se trazi uporedo - da se izvor ne preplavi. */
const VELICINA_GRUPE = 6;

/** Duzina opisa koji se prikazuje na kartici. */
const MAX_OPIS = 400;

/**
 * Detalji atrakcije: opis i slika.
 *
 * Jedan poziv PO ATRAKCIJI, pa se ne traze za sve kandidate nego samo za
 * one koje su usle u plan (najvise ~84) ili za prvu stranu liste na
 * stranici „Atrakcije". Kes je najduzi u sistemu - 30 dana - jer se opis
 * i slika prakticno ne menjaju.
 *
 * Dva izvora, oba Wikimedia Commons:
 *   1. OpenTripMap `/places/xid/{xid}` - `preview.source` i veza ka
 *      clanku, za atrakcije koje odatle dolaze;
 *   2. Wikipedia REST `page/summary/{naslov}` - za mock atrakcije (polje
 *      `wikipedia`), za Geoapify atrakcije (`GEO-…`, veza iz OSM taga
 *      `wikipedia` stize uz id) i kao rezerva kada OpenTripMap nema sliku.
 *
 * Neuspeh jedne atrakcije nikada ne obara ostale: ona ostane bez slike.
 */
class AttractionDetailsAdapter extends BaseAdapter {
  constructor() {
    super(AttractionDetailsCacheModel, TTL.attractionDetails);
  }

  /** Mock atrakcije po internom id-ju (`ATR001`). */
  _mockPoId(id) {
    try {
      const sve = loadMockData('attractions.json');

      return sve.find((a) => `ATR${String(a.id).padStart(3, '0')}` === id) || null;
    } catch {
      return null;
    }
  }

  _skrati(tekst) {
    const ceo = String(tekst || '').trim();

    return ceo.length > MAX_OPIS ? `${ceo.slice(0, MAX_OPIS).trimEnd()}...` : ceo;
  }

  /** OpenTripMap detalj objekta; vraca i naslov clanka za rezervu. */
  async _izOpenTripMapa(xid) {
    const { data } = await axios.get(
      `${OPENTRIPMAP.baseUrl}/places/xid/${encodeURIComponent(xid)}`,
      { params: { apikey: OPENTRIPMAP.apiKey }, timeout: OPENTRIPMAP.timeout }
    );

    const opis = data?.info?.descr || data?.wikipedia_extracts?.text || '';

    // Ista obrada kao za Wikipedia slicice: standardna sirina, inace
    // Wikimedia odbija direktan zahtev sa 400
    const slicica = wikipediaAdapter.slicica(
      data?.preview?.source,
      data?.preview?.width,
      data?.preview?.height
    );

    const image = slicica
      ? {
          ...slicica,
          // Veza ka clanku ili Commons stranici, za potpis ispod slike
          sourceUrl: data.wikipedia || data.otm || null,
          credit: 'Wikimedia Commons'
        }
      : null;

    return { opis, image, wikipedia: data?.wikipedia || null };
  }

  /**
   * Detalj jedne atrakcije. `id` odredjuje izvor:
   *   `OTM-<xid>` -> OpenTripMap (pa Wikipedia kao rezerva)
   *   `ATR<broj>` -> mock zapis i njegov naslov clanka
   *   ostalo (`GEO-…`) -> Wikipedia, preko veze koju je poslao pozivalac
   */
  async _detaljZaId(id, wikipedia = null) {
    if (String(id).startsWith('OTM-') && openTripMapKonfigurisan()) {
      const xid = String(id).slice(4);

      try {
        const iz = await this._izOpenTripMapa(xid);

        if (iz.image) return { id, description: this._skrati(iz.opis), image: iz.image };

        // Ima clanak, ali nema sliku - probaj Wikipediju
        if (iz.wikipedia) {
          const sa = await wikipediaAdapter.detalj(this._naslovIzUrl(iz.wikipedia));

          if (sa?.image) {
            return { id, description: this._skrati(iz.opis || sa.opis), image: sa.image };
          }
        }

        return { id, description: this._skrati(iz.opis), image: null };
      } catch (err) {
        console.warn(`[DETALJI] ${id}: ${err.response?.status || err.message}`);
        return { id, description: '', image: null };
      }
    }

    const mock = this._mockPoId(id);

    if (!mock) {
      // Geoapify ne daje sliku, ali OSM tag `wikipedia` vodi do clanka sa njom
      if (!wikipedia) return { id, description: '', image: null };

      const sa = await wikipediaAdapter.detalj(wikipedia);

      return { id, description: this._skrati(sa?.opis), image: sa?.image || null };
    }

    if (!mock.wikipedia) return { id, description: this._skrati(mock.opis), image: null };

    const sa = await wikipediaAdapter.detalj(mock.wikipedia);

    // Opis iz mock podataka ima prednost: pisan je na srpskom
    return { id, description: this._skrati(mock.opis || sa?.opis), image: sa?.image || null };
  }

  /** "https://en.wikipedia.org/wiki/Acropolis" -> "en:Acropolis" */
  _naslovIzUrl(url) {
    const m = String(url || '').match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/i);

    return m ? `${m[1]}:${decodeURIComponent(m[2])}` : url;
  }

  /**
   * @param {string[]} ids
   * @param {Object<string, string>} [veze] - id -> Wikipedia naslov
   *        („en:Colosseum"), za atrakcije koje nemaju sopstveni izvor slike
   * @returns {Promise<Array<{id, description, image}>>}
   */
  async detalji(ids, veze = {}) {
    const spisak = [...new Set((ids || []).map(String).filter(Boolean))];
    const rezultat = [];

    for (let i = 0; i < spisak.length; i += VELICINA_GRUPE) {
      const grupa = spisak.slice(i, i + VELICINA_GRUPE);

      const deo = await Promise.all(
        grupa.map(async (id) => {
          /*
           * `v2`: raniji zapisi za Geoapify atrakcije su sacuvani bez slike
           * (veza ka Wikipediji tada nije stizala), a kes traje 30 dana.
           * Nova oznaka ih zaobilazi bez rucnog brisanja.
           */
          const { data } = await this.withCache(`detail-v2-${id}`, () =>
            this._detaljZaId(id, veze?.[id] || null)
          );
          return data;
        })
      );

      rezultat.push(...deo);
    }

    return rezultat;
  }
}

module.exports = AttractionDetailsAdapter;
