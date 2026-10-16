const express = require('express');

const DuffelFlightAdapter = require('../adapters/DuffelFlightAdapter');
const LiteApiHotelAdapter = require('../adapters/LiteApiHotelAdapter');
const OpenTripMapAdapter = require('../adapters/OpenTripMapAdapter');
const GeoapifyPlacesAdapter = require('../adapters/GeoapifyPlacesAdapter');
const { kursAdapter } = require('../adapters/FrankfurterExchangeAdapter');
const { geokoder } = require('../adapters/NominatimGeocodeAdapter');
const { geoapifyKonfigurisan, openTripMapKonfigurisan } = require('../config/externalApis');
const { verifyInternalKey } = require('../middleware/internalKey');

const {
  FlightsCacheModel,
  AccommodationsCacheModel,
  AttractionsCacheModel,
  ExchangeRatesCacheModel,
  GeocodeCacheModel
} = require('../models/CacheModels');

const router = express.Router();

// Adapteri se instanciraju jednom. Svi idu preko spoljnih API-ja, sa
// automatskim povratkom na mock podatke ako API nije dostupan (spec §5):
//   letovi    - Duffel (pretraga, rezervacija i otkazivanje u test rezimu)
//   smestaj   - LiteAPI (pretraga; rezervacija ide na Booking.com link)
//   atrakcije - Geoapify, pa OpenTripMap, pa mock (spec §5)
//   kurs      - Frankfurter (ECB)
//   geokod    - Nominatim (OSM)
const flightAdapter = new DuffelFlightAdapter();
const accommodationAdapter = new LiteApiHotelAdapter();

/**
 * REDOSLED IZVORA ZA ATRAKCIJE.
 *
 * Specifikacija §5 dozvoljava „OpenTripMap ili Geoapify". OpenTripMap
 * kljuc nije mogao da se dobije (potvrda registracije ne stize), pa
 * Geoapify ide prvi kada ima ispravan kljuc, a OpenTripMap ostaje kao
 * rezerva - oba vracaju isti interni oblik, pa Planner ne primecuje
 * razliku osim po polju `source`.
 *
 * Bez ijednog kljuca oba adaptera sama prelaze na mock podatke.
 */
const geoapifyAdapter = new GeoapifyPlacesAdapter();
const openTripMapAdapter = new OpenTripMapAdapter();

const attractionsAdapter = geoapifyKonfigurisan() ? geoapifyAdapter : openTripMapAdapter;

console.log(
  `[INTEGRATION_SERVICE] Izvor atrakcija: ${
    geoapifyKonfigurisan()
      ? 'Geoapify'
      : openTripMapKonfigurisan()
        ? 'OpenTripMap'
        : 'mock podaci (nema kljuca)'
  }`
);
const AttractionDetailsAdapter = require('../adapters/AttractionDetailsAdapter');
const detailsAdapter = new AttractionDetailsAdapter();

/**
 * Proverava da su svi obavezni query parametri prisutni.
 * Vraca true ako je sve u redu, inace salje 400 i vraca false.
 */
const proveriParametre = (req, res, obavezni) => {
  const nedostaju = obavezni.filter((p) => !req.query[p]);

  if (nedostaju.length > 0) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: `Missing required parameters: ${nedostaju.join(', ')}`,
      statusCode: 400
    });
    return false;
  }

  return true;
};

// =================================================================
// Pretraga
// =================================================================

/**
 * GET /flights?from=BEG&to=ATH&checkIn=2027-01-10&checkOut=2027-01-15&passengers=2
 *
 * `checkOut` daje povratni let (spec §4.3); bez njega je jednosmerni.
 * `date` se prihvata kao stariji naziv za `checkIn`.
 */
router.get('/flights', async (req, res, next) => {
  const upit = { ...req.query, checkIn: req.query.checkIn || req.query.date };

  if (!upit.from || !upit.to || !upit.checkIn) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Missing required parameters: from, to, checkIn',
      statusCode: 400
    });
  }

  try {
    const { data, cached, source } = await flightAdapter.fetch(upit);
    res.json({ success: true, data, cached, source });
  } catch (err) {
    next(err);
  }
});

// GET /accommodations?city=Athens&checkIn=2027-01-10&checkOut=2027-01-15&guests=2
router.get('/accommodations', async (req, res, next) => {
  if (!proveriParametre(req, res, ['city', 'checkIn', 'checkOut'])) return;

  try {
    const { data, cached, source } = await accommodationAdapter.fetch(req.query);
    res.json({ success: true, data, cached, source });
  } catch (err) {
    next(err);
  }
});

// GET /attractions?city=Athens&targetCount=21&details=24
router.get('/attractions', async (req, res, next) => {
  if (!proveriParametre(req, res, ['city'])) return;

  try {
    const { data, cached, source } = await attractionsAdapter.fetch(req.query);

    /*
     * `details=N` obogacuje prvih N atrakcija opisom i slikom. Planner ga
     * NE salje (njemu detalji trebaju tek za izabrane, posle Faze 3), a
     * stranica „Atrakcije" salje prvu stranu rezultata.
     */
    const koliko = parseInt(req.query.details, 10);

    if (Number.isFinite(koliko) && koliko > 0) {
      const prvi = data.slice(0, koliko);
      const detalji = await detailsAdapter.detalji(
        prvi.map((a) => a.id),
        Object.fromEntries(prvi.filter((a) => a.wikipedia).map((a) => [a.id, a.wikipedia]))
      );
      const poId = new Map(detalji.map((d) => [d.id, d]));

      for (const a of prvi) {
        const d = poId.get(a.id);
        if (!d) continue;

        if (d.description) a.description = d.description;
        a.image = d.image || null;
      }
    }

    res.json({ success: true, data, cached, source });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /attractions/details  { ids: ["ATR001", "OTM-..."], veze?: { "GEO-1": "en:Colosseum" } }
 *
 * `veze` je opciono: Wikipedia naslov po id-ju, za atrakcije (Geoapify)
 * ciji izvor ne daje sliku.
 *
 * Opis i slika po atrakciji, kesirano 30 dana. Planner je zove posle
 * Faze 3, samo za atrakcije koje su usle u plan.
 */
router.post('/attractions/details', async (req, res, next) => {
  const { ids, veze } = req.body || {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Missing required parameters: ids'
    });
  }

  try {
    const data = await detailsAdapter.detalji(ids, veze && typeof veze === 'object' ? veze : {});
    res.json({ success: true, data, count: data.length });
  } catch (err) {
    next(err);
  }
});

// GET /exchange-rates?from=EUR&to=USD
router.get('/exchange-rates', async (req, res, next) => {
  if (!proveriParametre(req, res, ['from', 'to'])) return;

  try {
    const { data, cached, source } = await kursAdapter.fetch(req.query);
    res.json({ success: true, data, cached, source });
  } catch (err) {
    next(err);
  }
});

// GET /geocode?city=Athens
router.get('/geocode', async (req, res, next) => {
  if (!proveriParametre(req, res, ['city'])) return;

  try {
    const { data, cached, source } = await geokoder.fetch(req.query);
    res.json({ success: true, data, cached, source });
  } catch (err) {
    next(err);
  }
});

// =================================================================
// Interne rute za rezervaciju leta (spec §4.8)
//
// Kljuc spoljnog API-ja postoji samo ovde, pa i rezervaciju kreira
// iskljucivo ovaj servis. Booking Service ih poziva sa X-Internal-Key.
// =================================================================

// GET /internal/flights/offers/:offerId - ponovna provera cene
router.get('/internal/flights/offers/:offerId', verifyInternalKey, async (req, res, next) => {
  try {
    const { data, source } = await flightAdapter.ponuda(req.params.offerId);
    res.json({ success: true, data, source });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /internal/flights/selected/:offerId - ponuda izabrana u koraku 2.
 *
 * Planner je trazi kada izabrani `offerId` nije u listi ponovne pretrage
 * (Duffel svakoj pretrazi daje nove id-jeve). Istekla ponuda -> 410.
 */
router.get('/internal/flights/selected/:offerId', verifyInternalKey, async (req, res, next) => {
  try {
    const { data, source } = await flightAdapter.izabranaPonuda(req.params.offerId);
    res.json({ success: true, data, source });
  } catch (err) {
    next(err);
  }
});

// POST /internal/flights/orders - kreiranje rezervacije
router.post('/internal/flights/orders', verifyInternalKey, async (req, res, next) => {
  const { offerId, passengers, amount, currency } = req.body || {};

  if (!offerId || !Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Obavezni su offerId i lista putnika',
      statusCode: 400
    });
  }

  try {
    const { data, source } = await flightAdapter.kreirajNarudzbinu({
      offerId,
      passengers,
      amount,
      currency: currency || 'EUR'
    });

    res.status(201).json({ success: true, data, source, statusCode: 201 });
  } catch (err) {
    next(err);
  }
});

// POST /internal/flights/orders/:orderId/cancel - otkazivanje
router.post(
  '/internal/flights/orders/:orderId/cancel',
  verifyInternalKey,
  async (req, res, next) => {
    try {
      const { data, source } = await flightAdapter.otkaziNarudzbinu(req.params.orderId);
      res.json({ success: true, data, source });
    } catch (err) {
      next(err);
    }
  }
);

// =================================================================
// Odrzavanje
// =================================================================

// POST /cache/clear - debug ruta, prazni sve kes kolekcije
router.post('/cache/clear', async (req, res, next) => {
  try {
    const rezultati = await Promise.all([
      FlightsCacheModel.deleteMany({}),
      AccommodationsCacheModel.deleteMany({}),
      AttractionsCacheModel.deleteMany({}),
      ExchangeRatesCacheModel.deleteMany({}),
      GeocodeCacheModel.deleteMany({})
    ]);

    const obrisano = rezultati.reduce((zbir, r) => zbir + r.deletedCount, 0);
    console.log(`[INTEGRATION_SERVICE] Cache cleared: ${obrisano} zapisa`);

    res.json({ success: true, message: 'Cache cleared', deleted: obrisano });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
