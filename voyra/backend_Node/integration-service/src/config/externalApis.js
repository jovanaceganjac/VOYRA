/**
 * Centralno mesto za konfiguraciju spoljnih API-ja.
 * Kljucevi se citaju iskljucivo iz .env-a i nikada ne napustaju backend.
 *
 * Izbor servisa prati specifikaciju §5. Amadeus je ugasio besplatni
 * portal za programere 17. 7. 2026, a Skyscanner i Booking.com daju
 * pristup samo komercijalnim partnerima - zato su izabrani servisi koji
 * imaju otvoren test/sandbox rezim.
 */

/** Letovi: pretraga, rezervacija i otkazivanje u test rezimu. */
const DUFFEL = {
  baseUrl: process.env.DUFFEL_API_BASE_URL || 'https://api.duffel.com',
  // Duffel zahteva verziju u zaglavlju svakog poziva
  version: process.env.DUFFEL_API_VERSION || 'v2',
  apiKey: process.env.DUFFEL_API_KEY,
  offerRequestsPath: '/air/offer_requests',
  offersPath: '/air/offers',
  ordersPath: '/air/orders',
  orderCancellationsPath: '/air/order_cancellations',
  maxRezultata: parseInt(process.env.DUFFEL_MAX_OFFERS, 10) || 5,
  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 15000
};

/** Smestaj: pretraga u sandbox rezimu (kljuc pocinje sa `sand_`). */
const LITEAPI = {
  baseUrl: process.env.LITEAPI_API_BASE_URL || 'https://api.liteapi.travel/v3.0',
  apiKey: process.env.LITEAPI_API_KEY,
  hotelsPath: '/data/hotels',
  ratesPath: '/hotels/rates',
  // Koliko hotela se trazi iz kataloga pre nego sto se pitaju cene
  kandidata: parseInt(process.env.LITEAPI_CANDIDATES, 10) || 25,
  maxRezultata: parseInt(process.env.LITEAPI_MAX_RESULTS, 10) || 5,
  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 15000
};

/**
 * Atrakcije. Besplatan kljuc, bez OAuth-a.
 * Radi u dva koraka: naziv grada -> koordinate, pa objekti u krugu.
 */
const OPENTRIPMAP = {
  baseUrl: process.env.OPENTRIPMAP_API_BASE_URL || 'https://api.opentripmap.com/0.1/en',
  apiKey: process.env.OPENTRIPMAP_API_KEY,

  radiusM: parseInt(process.env.OPENTRIPMAP_RADIUS_M, 10) || 15000,
  // Drugi pokusaj kada u prvom krugu nema dovoljno objekata. Vise od
  // 25 km od centra izlazi iz grada, pa dalje nema smisla siriti.
  radiusProsireniM: parseInt(process.env.OPENTRIPMAP_RADIUS_WIDE_M, 10) || 25000,

  /**
   * Koliko objekata se trazi. Racuna se IZ POTREBE, ne fiksno:
   *
   *   limit = min(LIMIT_MAX, max(LIMIT_MIN, PO_CILJU * ukupanCilj))
   *
   * `ukupanCilj` je zbir ciljnih brojeva aktivnosti po danima (Faza 3).
   * Mnozilac 3 daje Fazi 3 prostor da bira: posle filtriranja po oceni i
   * radnom vremenu ostane oko trecine kandidata. Donja granica pokriva
   * kratka putovanja (svaki grad ima bar 60 zanimljivih mesta), a gornja
   * cuva OpenTripMap od nepotrebno velikih upita - 14 dana x 6 aktivnosti
   * je 84 mesta, sto sa 200 kandidata ima dovoljno izbora.
   */
  limitMin: parseInt(process.env.OPENTRIPMAP_LIMIT_MIN, 10) || 60,
  limitMax: parseInt(process.env.OPENTRIPMAP_LIMIT_MAX, 10) || 200,
  limitPoCilju: parseInt(process.env.OPENTRIPMAP_LIMIT_PER_TARGET, 10) || 3,

  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 10000
};

/**
 * Wikipedia REST API - koristi se SAMO za slike i kratke opise
 * (Wikimedia Commons). Bez kljuca, ali Wikimedia trazi opisni
 * `User-Agent` sa kontaktom, inace vraca 403.
 *
 * Slike se ne preuzimaju na server: aplikacija prikazuje slicicu sa
 * `upload.wikimedia.org` i uz nju potpis sa linkom na izvor.
 */
const WIKIPEDIA = {
  baseUrl: process.env.WIKIPEDIA_API_BASE_URL || 'https://{jezik}.wikipedia.org/api/rest_v1',
  userAgent:
    process.env.WIKIPEDIA_USER_AGENT ||
    'Voyra/1.0 (diplomski rad, ETF Beograd; https://github.com/voyra)',
  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 10000
};

/**
 * Kursna lista Evropske centralne banke. Bez kljuca.
 * `/v1/latest` vraca {amount, base, date, rates:{...}} - jednostavniji
 * oblik od novijeg `/v2/rates`, koji vraca niz parova.
 */
const FRANKFURTER = {
  baseUrl: process.env.FRANKFURTER_API_BASE_URL || 'https://api.frankfurter.dev',
  latestPath: '/v1/latest',
  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 10000
};

/**
 * Placeholder vrednosti iz .env sablona ne smeju da se tretiraju kao
 * pravi kljucevi - inace bi adapter pozvao API sa "your_key_here"
 * i dobio 401 na svakom zahtevu.
 */
/**
 * GEOAPIFY PLACES (spec §5: „OpenTripMap ili Geoapify").
 *
 * Endpoint i parametri su iz zvanicne dokumentacije
 * (https://apidocs.geoapify.com/docs/places/): `GET /v2/places` sa
 * `categories`, `filter=circle:lon,lat,radius`, `bias=proximity:lon,lat`,
 * `limit`, `lang` i `apiKey`. Odgovor je GeoJSON FeatureCollection.
 */
const GEOAPIFY = {
  baseUrl: process.env.GEOAPIFY_API_BASE_URL || 'https://api.geoapify.com/v2',
  apiKey: process.env.GEOAPIFY_API_KEY,

  radiusM: parseInt(process.env.GEOAPIFY_RADIUS_M, 10) || 15000,
  radiusProsireniM: parseInt(process.env.GEOAPIFY_RADIUS_WIDE_M, 10) || 25000,

  // Ista pravila kao kod OpenTripMap-a: velicina upita se racuna iz
  // potrebe plana, a ne fiksno
  /*
   * Trazi se VISE nego sto plan koristi, jer izvor nema rang
   * popularnosti: u gustom centru prvih 30 najblizih objekata budu
   * spomen-ploce, pa se iz veceg skupa bira po vezi ka Wikipediji.
   * 120 mesta je 6 kredita, od 3 000 dnevnih.
   */
  limitPoCilju: parseFloat(process.env.GEOAPIFY_LIMIT_PER_TARGET) || 8,
  limitMin: parseInt(process.env.GEOAPIFY_LIMIT_MIN, 10) || 120,
  // Dokumentacija dozvoljava do 500, ali 20 mesta = 1 kredit, pa se ne
  // trazi vise nego sto plan moze da iskoristi
  limitMax: parseInt(process.env.GEOAPIFY_LIMIT_MAX, 10) || 120,

  lang: process.env.GEOAPIFY_LANG || 'en'
};

const PLACEHOLDERI = [
  'your_duffel_key_here',
  'your_liteapi_key_here',
  'your_opentripmap_key_here',
  'your_geoapify_key_here',
  'mock_or_test_key'
];

const jePravaVrednost = (v) => Boolean(v) && !PLACEHOLDERI.includes(v);

const duffelKonfigurisan = () => jePravaVrednost(DUFFEL.apiKey);
const liteApiKonfigurisan = () => jePravaVrednost(LITEAPI.apiKey);
const openTripMapKonfigurisan = () => jePravaVrednost(OPENTRIPMAP.apiKey);

/**
 * Geoapify kljuc je 32 heksadecimalna znaka. Oblik se proverava, ne samo
 * postojanje: kljuc sa suvisnim znakom (npr. dupli `=` u .env-u) bio bi
 * odbijen tek pri pozivu, pa bi svaki zahtev otisao u prazno.
 */
const geoapifyKonfigurisan = () => {
  const k = GEOAPIFY.apiKey;

  if (!jePravaVrednost(k)) return false;

  if (!/^[0-9a-fA-F]{32}$/.test(String(k).trim())) {
    console.warn(
      '[GEOAPIFY] Kljuc nije u ocekivanom obliku (32 heksadecimalna znaka) - ' +
        'preskacem Geoapify i koristim rezervni izvor'
    );
    return false;
  }

  return true;
};

module.exports = {
  DUFFEL,
  LITEAPI,
  OPENTRIPMAP,
  GEOAPIFY,
  WIKIPEDIA,
  FRANKFURTER,
  duffelKonfigurisan,
  liteApiKonfigurisan,
  openTripMapKonfigurisan,
  geoapifyKonfigurisan
};
