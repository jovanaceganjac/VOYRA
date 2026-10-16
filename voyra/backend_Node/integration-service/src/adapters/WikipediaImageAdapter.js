const axios = require('axios');

const { WIKIPEDIA } = require('../config/externalApis');

/**
 * Standardne sirine slicica u Wikimedia produkciji.
 *
 * Wikimedia direktan zahtev (hotlinking) ODBIJA sa 400 ako sirina nije
 * sa ovog spiska - "Use thumbnail sizes listed on https://w.wiki/GHai".
 * Wikipedia REST vraca 320 px, sto NIJE standardna sirina, pa se adresa
 * mora prevesti pre nego sto se posalje pregledacu.
 */
const STANDARDNE_SIRINE = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];

/** Zeljena sirina slicice na kartici; 500 je prva standardna preko 400. */
const ZELJENA_SIRINA = 500;

/** Slicice se sluze sa `upload.wikimedia.org`; REST ume da vrati drugi host. */
const HOST_SLIKA = 'upload.wikimedia.org';

/**
 * Slike atrakcija sa Wikimedia Commons-a, preko Wikipedia REST API-ja
 * (spec §4.5 prikaz).
 *
 *   GET https://{jezik}.wikipedia.org/api/rest_v1/page/summary/{naslov}
 *
 * Kljuc nije potreban, ali Wikimedia trazi opisni `User-Agent` sa
 * kontaktom - bez njega odgovara 403. Slike se NE preuzimaju na server:
 * cuva se samo adresa slicice na `upload.wikimedia.org` i veza ka izvoru,
 * pa uz prikaz uvek ide potpis.
 */
class WikipediaImageAdapter {
  /** "en:Acropolis_of_Athens" -> { jezik, naslov } */
  _razloziNaslov(wikipedia) {
    const tekst = String(wikipedia || '').trim();
    if (!tekst) return null;

    const razmak = tekst.indexOf(':');

    if (razmak > 0 && razmak <= 3) {
      return { jezik: tekst.slice(0, razmak), naslov: tekst.slice(razmak + 1) };
    }

    return { jezik: 'en', naslov: tekst };
  }

  /**
   * Adresa slicice koju pregledac sme da trazi.
   *
   * Radi tri stvari:
   *   1. sirinu svodi na STANDARDNU (inace Wikimedia vraca 400),
   *   2. host prebacuje na `upload.wikimedia.org`,
   *   3. uklanja prateci upit (`?utm_source=...`), koji nista ne nosi.
   *
   * Ako adresa nije oblika `.../320px-Ime.jpg`, ostaje kakva jeste -
   * nikad se ne izmislja nova.
   */
  _standardnaSlicica(izvor, sirina, visina) {
    const bezUpita = String(izvor || '').split('?')[0];
    const naHostu = bezUpita.replace(/\/\/[^/]+\//, `//${HOST_SLIKA}/`);

    const m = naHostu.match(/\/(\d+)px-([^/]+)$/);
    if (!m) return { url: naHostu, width: sirina ?? null, height: visina ?? null };

    const stara = Number(m[1]);

    // Prva standardna sirina koja nije manja od zeljene
    const nova =
      STANDARDNE_SIRINE.find((w) => w >= ZELJENA_SIRINA) ??
      STANDARDNE_SIRINE[STANDARDNE_SIRINE.length - 1];

    const odnos = Number.isFinite(stara) && stara > 0 ? nova / stara : 1;

    return {
      url: naHostu.replace(`/${m[1]}px-`, `/${nova}px-`),
      width: sirina ? Math.round(sirina * odnos) : nova,
      height: visina ? Math.round(visina * odnos) : null
    };
  }

  /** Ista obrada za slike koje stignu iz drugog izvora (OpenTripMap). */
  slicica(url, sirina, visina) {
    if (!url) return null;
    if (!/wikimedia\.org|wikipedia\.org/.test(String(url))) {
      return { url, width: sirina ?? null, height: visina ?? null };
    }

    return this._standardnaSlicica(url, sirina, visina);
  }

  /**
   * @param {string} wikipedia - "en:Acropolis_of_Athens" ili samo naslov
   * @returns {Promise<{opis: string, image: object|null}|null>}
   */
  async detalj(wikipedia) {
    const razlozen = this._razloziNaslov(wikipedia);
    if (!razlozen) return null;

    const { jezik, naslov } = razlozen;
    const baza = WIKIPEDIA.baseUrl.replace('{jezik}', jezik);
    const url = `${baza}/page/summary/${encodeURIComponent(naslov)}`;

    try {
      const { data } = await axios.get(url, {
        timeout: WIKIPEDIA.timeout,
        headers: { 'User-Agent': WIKIPEDIA.userAgent, Accept: 'application/json' }
      });

      const stranica = data?.content_urls?.desktop?.page || null;
      const sicica = data?.thumbnail;

      const image = sicica?.source
        ? {
            ...this._standardnaSlicica(sicica.source, sicica.width, sicica.height),
            sourceUrl: stranica,
            credit: 'Wikimedia Commons'
          }
        : null;

      return { opis: data?.extract || '', image };
    } catch (err) {
      // Neuspeh nikada ne obara plan - atrakcija ostaje bez slike
      console.warn(`[WIKIPEDIA] ${naslov}: ${err.response?.status || err.message}`);
      return null;
    }
  }
}

module.exports = WikipediaImageAdapter;
module.exports.wikipediaAdapter = new WikipediaImageAdapter();
