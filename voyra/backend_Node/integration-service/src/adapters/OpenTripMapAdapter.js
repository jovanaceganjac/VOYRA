const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const AttractionsAdapter = require('./AttractionsAdapter');
const { geokoder } = require('./NominatimGeocodeAdapter');
const { OPENTRIPMAP, openTripMapKonfigurisan } = require('../config/externalApis');
const { AttractionsCacheModel, TTL } = require('../models/CacheModels');

/**
 * OpenTripMap `kind` -> interesovanja iz specifikacije §4.2.
 *
 * Jedan objekat nosi vise `kinds` odjednom (i nadredjene i podredjene),
 * pa se kategorije SKUPLJAJU: muzej je i `muzeji` i `kultura`. To je
 * bitno za Fazu 3, gde se ocena racuna kao udeo pogodjenih kategorija.
 */
const KIND_U_INTERESOVANJA = {
  museums: ['muzeji', 'kultura'],

  cultural: ['kultura'],
  historic: ['kultura'],
  historic_architecture: ['kultura'],
  architecture: ['kultura'],
  monuments_and_memorials: ['kultura'],
  religion: ['kultura'],
  archaeology: ['kultura'],
  fortifications: ['kultura'],
  castles: ['kultura'],
  palaces: ['kultura'],

  natural: ['priroda'],
  gardens_and_parks: ['priroda'],
  beaches: ['priroda'],
  nature_reserves: ['priroda'],
  water: ['priroda'],
  geological_formations: ['priroda'],

  foods: ['gastronomija'],
  restaurants: ['gastronomija'],
  cafes: ['gastronomija'],
  fast_food: ['gastronomija'],
  biergartens: ['gastronomija', 'nocni_zivot'],
  marketplaces: ['gastronomija', 'soping'],

  nightclubs: ['nocni_zivot'],
  bars: ['nocni_zivot'],
  pubs: ['nocni_zivot'],
  theatres_and_entertainments: ['nocni_zivot', 'kultura'],

  shops: ['soping'],
  malls: ['soping'],
  department_stores: ['soping'],
  supermarkets: ['soping']
};

/**
 * Krovna grupa OpenTripMap-a za "sve sto vredi videti".
 *
 * Trazi se u DRUGOM upitu, bez obzira na interesovanja: Faza 3 bira po
 * formuli iz §6.2, pa joj i atrakcije van interesovanja trebaju da bi
 * dopunila dan kada onih u interesovanjima nema dovoljno.
 */
const OPSTI_KINDS = 'interesting_places';

/**
 * Interesovanje -> `kinds` koje treba TRAZITI.
 *
 * `adult` se namerno ne trazi: ta grupa sadrzi i sadrzaje koji ne
 * pripadaju planu putovanja, pa se nocni zivot trazi preko konkretnih
 * podgrupa.
 */
const INTERESOVANJE_U_KINDS = {
  kultura: [
    'cultural',
    'historic',
    'architecture',
    'historic_architecture',
    'monuments_and_memorials',
    'religion'
  ],
  muzeji: ['museums'],
  priroda: ['natural', 'gardens_and_parks', 'beaches'],
  gastronomija: ['foods', 'restaurants', 'cafes', 'marketplaces'],
  nocni_zivot: ['nightclubs', 'bars', 'pubs', 'theatres_and_entertainments'],
  soping: ['shops', 'malls', 'department_stores']
};

/** Kada nijedan `kind` nije prepoznat. */
const PODRAZUMEVANA_KATEGORIJA = 'kultura';

const MAX_OPIS = 300;

/**
 * Adapter za atrakcije preko OpenTripMap API-ja (spec §5).
 *
 * Bez kljuca ili kada API ne odgovara vraca se na mock podatke
 * (vidi polje `source`).
 *
 * Poziva se u tri koraka:
 *   1. koordinate grada - iz Nominatim geokodera, SA oznakom drzave
 *      (naziv grada sam po sebi je dvosmislen: "Athens" postoji i u
 *      americkoj drzavi Dzordziji)
 *   2. radius   - objekti u krugu, ograniceni na trazena interesovanja
 *   3. xid/{id} - opis pojedinacnog objekta (samo za prvih nekoliko)
 */
class OpenTripMapAdapter extends BaseAdapter {
  constructor() {
    super(AttractionsCacheModel, TTL.attractions);
    this.baseUrl = OPENTRIPMAP.baseUrl;
    this.mockAdapter = new AttractionsAdapter();
  }

  async _get(putanja, params) {
    const odgovor = await axios.get(`${this.baseUrl}${putanja}`, {
      params: { ...params, apikey: OPENTRIPMAP.apiKey },
      timeout: OPENTRIPMAP.timeout
    });

    return odgovor.data;
  }

  /**
   * KORAK 1: koordinate centra grada.
   *
   * Prvo se pita Nominatim (isti geokoder koji koristi i smestaj), jer
   * prima oznaku drzave. OpenTripMap `geoname` je rezerva kada Nominatim
   * ne odgovori - on razlikovanje po drzavi nema, pa se koristi tek ako
   * mora.
   */
  async _koordinateGrada(city, countryCode, lat, lon) {
    /*
     * Koordinate koje stignu uz zahtev imaju PREDNOST.
     *
     * Sada ih orchestrator uzima iz sopstvene baze gradova
     * (GeoNames), pa geokodiranje po imenu nije ni potrebno - a time
     * nestaje i cela klasa gresaka tipa "Athens u Dzordziji".
     */
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat: Number(lat), lon: Number(lon), izvor: 'zahtev' };
    }

    const izNominatima = await geokoder.grad(city, countryCode);

    if (izNominatima) {
      return { lat: izNominatima.lat, lon: izNominatima.lon, izvor: izNominatima.source };
    }

    const podaci = await this._get('/places/geoname', { name: city });

    if (!podaci || !Number.isFinite(podaci.lat) || !Number.isFinite(podaci.lon)) {
      const greska = new Error(`Grad nije pronadjen: ${city}`);
      greska.code = 'CITY_NOT_FOUND';
      throw greska;
    }

    return { lat: podaci.lat, lon: podaci.lon, izvor: 'opentripmap' };
  }

  /**
   * Interesovanja -> vrednost `kinds` parametra.
   *
   * Sada kategorije uredjuje administrator, pa Planner salje
   * gotovu listu `kinds` iz baze; ugradjena mapa ostaje kao rezerva za
   * pozive koji je ne posalju (probe, stariji klijenti).
   */
  kindsZaInteresovanja(interesovanja, kindsIzKataloga = null) {
    if (Array.isArray(kindsIzKataloga) && kindsIzKataloga.length > 0) {
      return kindsIzKataloga.join(',');
    }

    if (typeof kindsIzKataloga === 'string' && kindsIzKataloga.trim()) {
      return kindsIzKataloga.trim();
    }

    const lista = Array.isArray(interesovanja) && interesovanja.length > 0
      ? interesovanja
      : Object.keys(INTERESOVANJE_U_KINDS);

    const kinds = new Set();

    for (const i of lista) {
      for (const k of INTERESOVANJE_U_KINDS[i] || []) kinds.add(k);
    }

    return [...kinds].join(',');
  }

  /**
   * Sve kategorije objekta, u redosledu u kom ih izvor navodi.
   * Duplikati se uklanjaju, a nepoznati `kinds` se preskacu.
   */
  kategorije(kinds) {
    const grupe = String(kinds || '').split(',');
    const nadjene = [];

    for (const g of grupe) {
      for (const kategorija of KIND_U_INTERESOVANJA[g] || []) {
        if (!nadjene.includes(kategorija)) nadjene.push(kategorija);
      }
    }

    return nadjene.length > 0 ? nadjene : [PODRAZUMEVANA_KATEGORIJA];
  }

  /**
   * OpenTripMap `rate` je ZNACAJ objekta (1-3, sufiks "h" za kulturnu
   * bastinu), a ne ocena posetilaca - aplikacija radi sa skalom 1-5,
   * pa se prevodi: 1 -> 3.5, 2 -> 4.0, 3 -> 4.5, bastina +0.3.
   */
  _uOcenu(rate) {
    const tekst = String(rate ?? '');
    const broj = parseInt(tekst, 10);

    if (!Number.isFinite(broj) || broj <= 0) return 3.0;

    const bastina = tekst.includes('h') ? 0.3 : 0;

    return Math.min(5, Math.round((3 + broj * 0.5 + bastina) * 10) / 10);
  }

  /** KORAK 3: opis objekta. Neuspeh je dozvoljen - atrakcija ostaje bez opisa. */
  async _opis(xid) {
    try {
      const detalj = await this._get(`/places/xid/${encodeURIComponent(xid)}`, {});
      const tekst = detalj?.info?.descr || detalj?.wikipedia_extracts?.text || '';

      return tekst.length > MAX_OPIS ? `${tekst.slice(0, MAX_OPIS).trimEnd()}...` : tekst;
    } catch {
      return '';
    }
  }

  /** Opisi za prvih N objekata, u malim grupama da se API ne preplavi. */
  async _dodajOpise(atrakcije) {
    const saOpisom = atrakcije.slice(0, OPENTRIPMAP.saOpisom);
    const VELICINA_GRUPE = 6;

    for (let i = 0; i < saOpisom.length; i += VELICINA_GRUPE) {
      const grupa = saOpisom.slice(i, i + VELICINA_GRUPE);
      const opisi = await Promise.all(grupa.map((a) => this._opis(a.xid)));

      grupa.forEach((a, j) => {
        a.description = opisi[j];
      });
    }

    return atrakcije;
  }

  /** OpenTripMap format -> VOYRA format */
  _transform(objekat, city) {
    const kategorije = this.kategorije(objekat.kinds);

    return {
      id: `OTM-${objekat.xid}`,
      xid: objekat.xid,
      name: objekat.name,
      city,
      // Vise kategorija; `category` ostaje zbog ranije sacuvanih planova
      categories: kategorije,
      category: kategorije[0],
      lat: objekat.point?.lat ?? 0,
      lon: objekat.point?.lon ?? 0,
      description: '',
      // OpenTripMap ne daje cenu ulaznice - vodi se kao 0 i tako ulazi
      // u procenu troska
      price: 0,
      currency: 'EUR',
      rating: this._uOcenu(objekat.rate),
      views: 0
    };
  }

  /**
   * Koliko objekata traziti - IZ POTREBE, ne fiksno.
   *
   * `ukupanCilj` je zbir ciljnih brojeva aktivnosti po danima; Planner ga
   * salje uz zahtev. Bez njega se uzima donja granica.
   */
  limitIzPotrebe(ukupanCilj) {
    const cilj = Number(ukupanCilj);
    const izPotrebe = Number.isFinite(cilj) && cilj > 0 ? cilj * OPENTRIPMAP.limitPoCilju : 0;

    return Math.min(OPENTRIPMAP.limitMax, Math.max(OPENTRIPMAP.limitMin, Math.round(izPotrebe)));
  }

  /** Jedan `radius` upit; vraca sirove objekte. */
  async _uKrugu({ lat, lon, radius, kinds, limit }) {
    const objekti = await this._get('/places/radius', {
      radius,
      lat,
      lon,
      kinds,
      // `rate=2` izbacuje objekte bez ikakvog znacaja
      rate: 2,
      format: 'json',
      limit
    });

    return Array.isArray(objekti) ? objekti : [];
  }

  /**
   * DVA UPITA: prvi po izabranim interesovanjima, drugi po
   * opstim znamenitostima. Drugi postoji da bi Faza 3 imala cime da
   * dopuni dan kada u interesovanjima nema dovoljno mesta.
   *
   * Kada ni oba zajedno ne daju koliko plan trazi, ide JOS JEDAN upit sa
   * vecim poluprecnikom - najvise jedan, da se OpenTripMap ne opterecuje.
   */
  async _fetchFromOpenTripMap(
    city,
    countryCode,
    interesovanja,
    ukupanCilj,
    koordinate = {},
    kindsIzKataloga = null
  ) {
    const { lat, lon } = await this._koordinateGrada(
      city,
      countryCode,
      koordinate.lat,
      koordinate.lon
    );
    const limit = this.limitIzPotrebe(ukupanCilj);

    const poXid = new Map();
    const dodaj = (objekti) => {
      for (const o of objekti) {
        if (o?.xid && o.name && o.point && !poXid.has(o.xid)) poXid.set(o.xid, o);
      }
    };

    dodaj(
      await this._uKrugu({
        lat,
        lon,
        radius: OPENTRIPMAP.radiusM,
        kinds: this.kindsZaInteresovanja(interesovanja, kindsIzKataloga),
        limit
      })
    );

    dodaj(
      await this._uKrugu({ lat, lon, radius: OPENTRIPMAP.radiusM, kinds: OPSTI_KINDS, limit })
    );

    // Treci upit samo ako u prvom krugu nema ni koliko plan trazi
    const potrebno = Number(ukupanCilj) > 0 ? Number(ukupanCilj) : OPENTRIPMAP.limitMin;

    if (poXid.size < potrebno) {
      console.log(
        `[OPENTRIPMAP] ${poXid.size} objekata u ${OPENTRIPMAP.radiusM} m - ` +
        `sirim na ${OPENTRIPMAP.radiusProsireniM} m`
      );

      dodaj(
        await this._uKrugu({
          lat,
          lon,
          radius: OPENTRIPMAP.radiusProsireniM,
          kinds: OPSTI_KINDS,
          limit
        })
      );
    }

    const atrakcije = [...poXid.values()]
      .map((o) => this._transform(o, city))
      .sort((a, b) => b.rating - a.rating);

    console.log(`[OPENTRIPMAP] Dobijeno ${atrakcije.length} atrakcija za ${city}`);

    // Opis i slika se ne traze ovde: to je jedan poziv PO ATRAKCIJI, pa
    // ide tek za izabrane, kroz `POST /attractions/details`
    return atrakcije;
  }

  async fetch(query) {
    const { city, countryCode, interests, targetCount, lat, lon } = query;

    // `kinds` koje Planner racuna iz kategorija u bazi
    const kindsIzKataloga = query.kinds ?? null;

    if (!city) {
      const greska = new Error('Missing required parameters: city');
      greska.code = 'VALIDATION_ERROR';
      throw greska;
    }

    const interesovanja = typeof interests === 'string'
      ? interests.split(',').map((i) => i.trim()).filter(Boolean)
      : interests;

    /*
     * Kljuc kesa i dalje nosi interesovanja (prvi upit ide po njima), a
     * uz njih i velicinu upita: isti grad sa 14-dnevnim planom trazi vise
     * objekata nego sa trodnevnim, pa manji odgovor ne sme da posluzi
     * kao kes za veci.
     */
    const kljucInteresovanja = (interesovanja || []).slice().sort().join('+') || 'sve';
    const queryKey = `attractions-${city}-${kljucInteresovanja}-${this.limitIzPotrebe(targetCount)}`;

    let source = 'cache';

    const rezultat = await this.withCache(queryKey, async () => {
      if (!openTripMapKonfigurisan()) {
        console.warn('[OPENTRIPMAP] Kljuc nije podesen - koristim mock podatke');
        source = 'mock';
        return this.mockAdapter.ucitajIFiltriraj(query);
      }

      try {
        source = 'opentripmap';
        return await this._fetchFromOpenTripMap(
          city,
          countryCode,
          interesovanja,
          targetCount,
          { lat: Number(lat), lon: Number(lon) },
          kindsIzKataloga
        );
      } catch (err) {
        console.error('[OPENTRIPMAP] Error:', err.response?.data?.error || err.message);
        console.warn('[OPENTRIPMAP] Prelazim na mock podatke (fallback)');
        source = 'mock-fallback';
        return this.mockAdapter.ucitajIFiltriraj(query);
      }
    });

    return { ...rezultat, source };
  }
}

module.exports = OpenTripMapAdapter;
module.exports.KIND_U_INTERESOVANJA = KIND_U_INTERESOVANJA;
module.exports.INTERESOVANJE_U_KINDS = INTERESOVANJE_U_KINDS;
