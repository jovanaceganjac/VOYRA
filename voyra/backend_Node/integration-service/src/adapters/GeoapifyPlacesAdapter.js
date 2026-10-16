const axios = require('axios');

const BaseAdapter = require('./BaseAdapter');
const AttractionsAdapter = require('./AttractionsAdapter');
const { AttractionsCacheModel, TTL } = require('../models/CacheModels');
const { GEOAPIFY, geoapifyKonfigurisan } = require('../config/externalApis');
const { procitajRadnoVreme } = require('../utils/radnoVreme');
const krediti = require('../utils/geoapifyKrediti');

/**
 * GEOAPIFY PLACES ADAPTER (spec §5: „OpenTripMap ili Geoapify").
 *
 * OpenTripMap kljuc nije mogao da se dobije - potvrda registracije ne
 * stize - pa je uzet drugi izvor koji specifikacija dozvoljava.
 *
 * Adapter vraca ISTI interni oblik atrakcije kao `OpenTripMapAdapter`,
 * pa Planner ne mora da zna odakle podatak dolazi; razlikuje ih samo
 * polje `source`.
 *
 * Zvanicna dokumentacija (https://apidocs.geoapify.com/docs/places/):
 *   GET /v2/places
 *     ?categories=tourism.sights,entertainment.museum
 *     &filter=circle:lon,lat,radiusM
 *     &bias=proximity:lon,lat
 *     &limit=60&lang=en&apiKey=...
 *
 * Odgovor je GeoJSON `FeatureCollection`; svaki `feature.properties`
 * nosi `name`, `categories[]`, `lat`, `lon`, `place_id`, `formatted` i
 * `datasource.raw` sa sirovim OSM tagovima (tu su `wikipedia`,
 * `wikidata`, `opening_hours`, `website` - kada ih objekat u OSM-u ima).
 */

/** Geoapify kategorije kada korisnik nije izabrao nijedno interesovanje. */
const PODRAZUMEVANE_KATEGORIJE = [
  'tourism.sights',
  'tourism.attraction',
  'entertainment.museum',
  'entertainment.culture',
  'leisure.park',
  'heritage'
];

/**
 * Ocena atrakcije iz onoga sto izvor ZAISTA daje.
 *
 * Geoapify nema ocenu posetilaca, pa se ona NE izmislja. Koristi se
 * jedini signal prepoznatljivosti koji odgovor nosi - veza ka
 * Wikipediji ili Wikidati u OSM tagovima:
 *
 *   3.0  osnovica ("ne znamo") - ista kao kod OpenTripMap-a
 *   +0.8 objekat ima `wikipedia` tag (neko je o njemu napisao clanak)
 *   +0.4 ima samo `wikidata` (slabiji signal od celog clanka)
 *   +0.3 UNESCO bastina (`heritage.unesco`)
 *
 * Gornja granica je 4.5, nikad 5.0: bez stvarnih ocena posetilaca
 * najvisa ocena bi bila obecanje koje podaci ne pokrivaju. Pravilo je
 * zapisano i u `ALGORITHMS.md` kao ogranicenje izvora.
 */
const oceniIzSignala = (raw = {}, kategorije = []) => {
  let ocena = 3.0;

  if (raw.wikipedia) ocena += 0.8;
  else if (raw.wikidata) ocena += 0.4;

  if (kategorije.some((k) => String(k).startsWith('heritage'))) ocena += 0.3;

  return Math.round(Math.min(ocena, 4.5) * 10) / 10;
};

class GeoapifyPlacesAdapter extends BaseAdapter {
  constructor() {
    super(AttractionsCacheModel, TTL.attractions);

    // Poslednji stepenik u lancu izvora
    this.mockAdapter = new AttractionsAdapter();
  }

  /**
   * Geoapify kategorije za izabrana interesovanja.
   *
   * Mapiranje stize iz baze (`interest_categories.geoapifyKategorije`),
   * koje Planner prosledjuje kao `geoCategories`. Bez njega se koriste
   * podrazumevane - adapter mora da radi i kada ga neko pozove direktno.
   */
  kategorijeZaUpit(geoCategories) {
    const lista = Array.isArray(geoCategories)
      ? geoCategories
      : String(geoCategories || '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);

    const jedinstvene = [...new Set(lista.length > 0 ? lista : PODRAZUMEVANE_KATEGORIJE)];

    return jedinstvene.join(',');
  }

  /** Koliko mesta trazimo - iz potrebe plana, ne fiksno. */
  limitIzPotrebe(ukupanCilj) {
    const cilj = Number(ukupanCilj);
    const izPotrebe = Number.isFinite(cilj) && cilj > 0 ? cilj * GEOAPIFY.limitPoCilju : 0;

    return Math.min(GEOAPIFY.limitMax, Math.max(GEOAPIFY.limitMin, Math.round(izPotrebe)));
  }

  /**
   * Nase kategorije za jedan objekat.
   *
   * Geoapify kategorije su hijerarhijske (`tourism`, `tourism.sights`,
   * `tourism.sights.memorial`), pa se poredi po PREFIKSU: kategorija
   * `tourism.sights` iz baze pokriva i sve svoje podgrupe.
   */
  kategorije(geoKategorije = [], mapa = {}) {
    const nadjene = [];

    for (const [nasa, njihove] of Object.entries(mapa)) {
      const pogodak = (njihove || []).some((n) =>
        geoKategorije.some((g) => String(g) === n || String(g).startsWith(`${n}.`))
      );

      if (pogodak && !nadjene.includes(nasa)) nadjene.push(nasa);
    }

    return nadjene;
  }

  /**
   * GeoJSON `feature` -> interni oblik atrakcije.
   *
   * Isti kljucevi kao kod `OpenTripMapAdapter`-a; Planner ih dalje
   * dopunjuje ocenom, trajanjem i satnicom.
   */
  normalize(feature, { city, mapaKategorija = {} } = {}) {
    const p = feature?.properties || {};
    const raw = p.datasource?.raw || {};

    const geoKategorije = Array.isArray(p.categories) ? p.categories : [];
    const nase = this.kategorije(geoKategorije, mapaKategorija);

    // Radno vreme iz izvora ima prednost; slozena pravila se odbijaju
    const izIzvora = procitajRadnoVreme(raw.opening_hours);

    return {
      id: `GEO-${p.place_id || raw.osm_id || feature?.id}`,
      xid: p.place_id || null,
      /*
       * OSM `name` je na jeziku mesta („Πλατεία Κοτζιά"), pa se uzima
       * medjunarodni oblik kada ga izvor ima - korisniku u Srbiji
       * „Kotzia Square" znaci vise od grckog zapisa. Kada ga nema,
       * ostaje lokalni naziv; ne prevodi se sam.
       */
      name: p.name_international?.[GEOAPIFY.lang] || p.name_international?.en || p.name,
      nameLocal: p.name || null,
      city: city || p.city || p.formatted || null,

      categories: nase,
      category: nase[0] || null,

      lat: Number(p.lat),
      lon: Number(p.lon),

      // Geoapify ne daje opis; Planner ga dopunjuje sa Wikipedije
      description: '',

      // Kao i kod OpenTripMap-a: cena ulaznice nije u izvoru
      price: 0,
      currency: 'EUR',

      rating: oceniIzSignala(raw, geoKategorije),
      views: 0,

      // Veza za sliku i opis
      wikipedia: raw.wikipedia || null,
      wikidata: raw.wikidata || null,
      website: raw.website || null,

      ...(izIzvora ? { openingHours: izIzvora, openingHoursEstimated: false } : {}),

      source: 'geoapify'
    };
  }

  /** Jedan poziv ka `/v2/places`. */
  async _uKrugu({ lat, lon, radius, categories, limit }) {
    const parametri = {
      categories,
      filter: `circle:${lon},${lat},${radius}`,
      bias: `proximity:${lon},${lat}`,
      limit,
      lang: GEOAPIFY.lang,
      apiKey: GEOAPIFY.apiKey
    };

    const { data } = await axios.get(`${GEOAPIFY.baseUrl}/places`, {
      params: parametri,
      timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 10000
    });

    // Dnevni limit: 20 mesta = 1 kredit (dokumentacija)
    krediti.zabelezi(limit);

    return Array.isArray(data?.features) ? data.features : [];
  }

  /**
   * Pretraga oko grada.
   *
   * Prvi krug je 15 km; kada u njemu nema ni koliko plan trazi, sledi
   * siri krug od 25 km - isto pravilo kao kod OpenTripMap-a.
   */
  async _pretrazi({ lat, lon, categories, ukupanCilj, city, mapaKategorija }) {
    const limit = this.limitIzPotrebe(ukupanCilj);

    const poId = new Map();

    const dodaj = (features) => {
      for (const f of features) {
        const p = f?.properties || {};

        // Objekat bez imena ili koordinata ne moze da udje u plan
        if (!p.name || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon))) {
          continue;
        }

        const kljuc = p.place_id || `${p.lat},${p.lon}`;
        if (!poId.has(kljuc)) poId.set(kljuc, f);
      }
    };

    dodaj(await this._uKrugu({ lat, lon, radius: GEOAPIFY.radiusM, categories, limit }));

    if (poId.size < Math.max(1, Number(ukupanCilj) || 0)) {
      dodaj(
        await this._uKrugu({
          lat,
          lon,
          radius: GEOAPIFY.radiusProsireniM,
          categories,
          limit
        })
      );
    }

    const sve = [...poId.values()].map((f) => this.normalize(f, { city, mapaKategorija }));

    /*
     * OGRANICENJE IZVORA: Geoapify nema ocenu ni rang popularnosti, a
     * `bias=proximity` vraca NAJBLIZE objekte. U gustom centru to znaci
     * na desetine spomen-ploca i statua pre nego sto se dodje do onoga
     * zbog cega se u grad putuje.
     *
     * Zato se koristi jedini signal prepoznatljivosti koji odgovor nosi:
     * objekti sa vezom ka Wikipediji ili Wikidati idu prvi. Nista se ne
     * izmislja - samo se menja redosled onoga sto je izvor vratio.
     */
    const saVezom = sve.filter((a) => a.wikipedia || a.wikidata);
    const bezVeze = sve.filter((a) => !a.wikipedia && !a.wikidata);

    return [...saVezom, ...bezVeze];
  }

  /**
   * @param {object} query - { city, lat, lon, interests, geoCategories,
   *   categoryMap, targetCount }
   */
  async fetch(query) {
    const { city, targetCount, lat, lon } = query;

    if (!city) {
      const greska = new Error('Missing required parameters: city');
      greska.code = 'VALIDATION_ERROR';
      throw greska;
    }

    const interesovanja =
      typeof query.interests === 'string'
        ? query.interests.split(',').map((i) => i.trim()).filter(Boolean)
        : query.interests;

    const categories = this.kategorijeZaUpit(query.geoCategories);

    // Mapa nasa -> Geoapify kategorije, za obrnuto prepoznavanje
    let mapaKategorija = {};

    try {
      mapaKategorija =
        typeof query.categoryMap === 'string' ? JSON.parse(query.categoryMap) : query.categoryMap || {};
    } catch {
      mapaKategorija = {};
    }

    const kljucInteresovanja = (interesovanja || []).slice().sort().join('+') || 'sve';
    const queryKey = `attractions-${city}-${kljucInteresovanja}-${this.limitIzPotrebe(targetCount)}`;

    let source = 'cache';

    const rezultat = await this.withCache(queryKey, async () => {
      if (!geoapifyKonfigurisan()) {
        source = 'mock';
        return this.mockAdapter.ucitajIFiltriraj(query);
      }

      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
        console.warn('[GEOAPIFY] Nema koordinata grada - koristim mock podatke');
        source = 'mock';
        return this.mockAdapter.ucitajIFiltriraj(query);
      }

      try {
        source = 'geoapify';

        return await this._pretrazi({
          lat: Number(lat),
          lon: Number(lon),
          categories,
          ukupanCilj: targetCount,
          city,
          mapaKategorija
        });
      } catch (err) {
        const status = err.response?.status;

        console.error(
          `[GEOAPIFY] Greska${status ? ` ${status}` : ''}:`,
          err.response?.data?.message || err.message
        );

        if (status === 429) {
          console.warn('[GEOAPIFY] Dnevni limit je iscrpljen - prelazim na rezervni izvor');
        }

        console.warn('[GEOAPIFY] Prelazim na mock podatke (fallback)');
        source = 'mock-fallback';

        return this.mockAdapter.ucitajIFiltriraj(query);
      }
    });

    return { ...rezultat, source: rezultat.cached ? 'cache' : source };
  }
}

module.exports = GeoapifyPlacesAdapter;
module.exports.oceniIzSignala = oceniIzSignala;
module.exports.PODRAZUMEVANE_KATEGORIJE = PODRAZUMEVANE_KATEGORIJE;
