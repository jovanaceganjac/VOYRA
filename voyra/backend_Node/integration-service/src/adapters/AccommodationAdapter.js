const BaseAdapter = require('./BaseAdapter');
const { loadMockData } = require('../utils/mockData');
const { demoSmestaj } = require('../utils/demoGenerator');
const { bookingUrl } = require('../utils/bookingLink');
const { AccommodationsCacheModel, TTL } = require('../models/CacheModels');

const MAX_REZULTATA = 5;

/** Tipovi koje specifikacija §4.4 poznaje. */
const TIPOVI = ['hotel', 'apartman', 'hostel'];

/**
 * Mock adapter za smestaj.
 *
 * Vraca isti oblik kao LiteApiHotelAdapter, ukljucujuci `bookingUrl`
 * ka Booking.com pretrazi - aplikacija smestaj ne rezervise (spec §4.4).
 */
class AccommodationAdapter extends BaseAdapter {
  constructor() {
    super(AccommodationsCacheModel, TTL.accommodations);
  }

  /** Broj noci izmedju dva ISO datuma (2026-10-15 -> 2026-10-20 = 5). */
  static brojNoci(checkIn, checkOut) {
    const od = new Date(checkIn);
    const do_ = new Date(checkOut);

    if (Number.isNaN(od.getTime()) || Number.isNaN(do_.getTime())) return 0;

    const noci = Math.ceil((do_ - od) / (1000 * 60 * 60 * 24));
    return noci > 0 ? noci : 0;
  }

  /** Nepoznat tip se svodi na `hotel` - lista je zatvorena po spec §4.4. */
  static tip(vrednost) {
    const t = String(vrednost || '').toLowerCase();
    return TIPOVI.includes(t) ? t : 'hotel';
  }

  /** Mock zapis -> interni model smestaja. */
  normalize(s, { checkIn, checkOut, guests = 1 } = {}) {
    const noci = AccommodationAdapter.brojNoci(checkIn, checkOut);
    const poNoci = s.cenaPoNoci;

    return {
      id: `ACC${String(s.id).padStart(3, '0')}`,
      name: s.naziv,
      city: s.city || s.grad,
      address: s.opis || '',
      type: AccommodationAdapter.tip(s.tip),
      stars: s.zvezdice ?? null,
      rating: s.ocena ?? null,

      lat: s.lat,
      lon: s.lon,
      distanceToCenter: s.distancaOdCentra,

      pricePerNight: poNoci,
      // Zadrzano zbog ranije sacuvanih putovanja i bodovanja u Planneru
      price: poNoci,
      currency: 'EUR',
      priceEUR: poNoci,
      totalPrice: Math.round(poNoci * noci * 100) / 100,

      nights: noci,
      checkInDate: checkIn || null,
      checkOutDate: checkOut || null,

      images: [],
      amenities: (s.amenities || []).slice(0, 5),
      cancellation: 'Free cancellation',

      // Spec §4.4: rezervacija se radi na Booking.com-u, ne u aplikaciji
      bookingUrl: bookingUrl({
        city: s.city || s.grad,
        checkIn,
        checkOut,
        guests,
        hotelName: s.naziv
      })
    };
  }

  /**
   * Ucitavanje + filtriranje bez kesa.
   * Izdvojeno da bi LiteApiHotelAdapter mogao da ga pozove kao fallback,
   * a da pritom ne upisuje drugi zapis u isti kes.
   */
  ucitajIFiltriraj(query) {
    const { city } = query;
    const sviSmestaji = loadMockData('accommodations.json');
    const trazeniGrad = String(city).toLowerCase();

    const rucni = sviSmestaji
      .filter(
        (s) =>
          s.grad?.toLowerCase() === trazeniGrad ||
          s.city?.toLowerCase() === trazeniGrad
      )
      .map((s) => this.normalize(s, query))
      // cena po noci rastuce
      .sort((a, b) => a.pricePerNight - b.pricePerNight)
      .slice(0, MAX_REZULTATA);

    if (rucni.length > 0) return rucni;

    /*
     * Gradovi koje rucni mock ne pokriva (svi osim Atine) dobijaju
     * deterministican demo smestaj. Naziv je "Demo smestaj
     * - {grad}", da se ne pomesa sa stvarnim hotelima.
     */
    return demoSmestaj({
      city,
      lat: Number(query.lat),
      lon: Number(query.lon),
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guests: query.guests || 1
    }).map((s) => ({
      ...s,
      bookingUrl: bookingUrl({
        city,
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        guests: query.guests || 1,
        hotelName: s.name
      })
    }));
  }

  async fetch(query) {
    const { city, checkIn, checkOut, guests = 1 } = query;
    const queryKey = `accommodations-${city}-${checkIn}-${checkOut}-${guests}`;

    return this.withCache(queryKey, async () => this.ucitajIFiltriraj(query));
  }
}

module.exports = AccommodationAdapter;
module.exports.TIPOVI = TIPOVI;
