const mongoose = require('mongoose');

// TTL po tipu podatka - koliko brzo podatak zastareva u stvarnosti.
// MongoDB brise istekle dokumente automatski preko TTL indeksa na createdAt.
// Vrednosti su iz specifikacije §11: letovi 15 min, smestaj 30 min,
// atrakcije 7 dana. Kurs se menja jednom dnevno (ECB), pa 24 h.
const TTL = {
  flights: parseInt(process.env.CACHE_TTL_FLIGHTS, 10) || 900,             // 15 min
  accommodations: parseInt(process.env.CACHE_TTL_ACCOMMODATIONS, 10) || 1800, // 30 min
  attractions: parseInt(process.env.CACHE_TTL_ATTRACTIONS, 10) || 604800,  // 7 dana
  rates: parseInt(process.env.CACHE_TTL_RATES, 10) || 86400,               // 24 sata
  // Koordinate grada se ne menjaju - drzi se dugo, da se Nominatim
  // ne opterecuje istim upitom (njihova pravila koriscenja to i traze)
  geocode: parseInt(process.env.CACHE_TTL_GEOCODE, 10) || 2592000,         // 30 dana
  // Opis i slika atrakcije se gotovo ne menjaju, a traze po jedan poziv
  // za svaku atrakciju - zato najduzi TTL (spec §11)
  attractionDetails: parseInt(process.env.CACHE_TTL_ATTRACTION_DETAILS, 10) || 2592000
};

/**
 * Sve kes kolekcije imaju isti oblik: kljuc upita + podatak + vreme upisa.
 * Razlikuju se samo po TTL-u i tipu polja data (niz ili objekat).
 */
const napraviKesSemu = (expireAfterSeconds, dataType) =>
  new mongoose.Schema({
    queryKey: { type: String, required: true, unique: true },
    data: dataType,
    createdAt: {
      type: Date,
      default: Date.now,
      index: { expireAfterSeconds }
    }
  });

const flightsCacheSchema = napraviKesSemu(TTL.flights, [mongoose.Schema.Types.Mixed]);
const accommodationsCacheSchema = napraviKesSemu(TTL.accommodations, [mongoose.Schema.Types.Mixed]);
const attractionsCacheSchema = napraviKesSemu(TTL.attractions, [mongoose.Schema.Types.Mixed]);
const exchangeRatesCacheSchema = napraviKesSemu(TTL.rates, mongoose.Schema.Types.Mixed);
const geocodeCacheSchema = napraviKesSemu(TTL.geocode, mongoose.Schema.Types.Mixed);
const attractionDetailsCacheSchema = napraviKesSemu(
  TTL.attractionDetails,
  mongoose.Schema.Types.Mixed
);

module.exports = {
  TTL,
  FlightsCacheModel: mongoose.model('FlightsCache', flightsCacheSchema, 'flights_cache'),
  AccommodationsCacheModel: mongoose.model('AccommodationsCache', accommodationsCacheSchema, 'accommodations_cache'),
  AttractionsCacheModel: mongoose.model('AttractionsCache', attractionsCacheSchema, 'attractions_cache'),
  ExchangeRatesCacheModel: mongoose.model('ExchangeRatesCache', exchangeRatesCacheSchema, 'exchange_rates_cache'),
  GeocodeCacheModel: mongoose.model('GeocodeCache', geocodeCacheSchema, 'geocode_cache'),
  AttractionDetailsCacheModel: mongoose.model(
    'AttractionDetailsCache',
    attractionDetailsCacheSchema,
    'attraction_details_cache'
  )
};
