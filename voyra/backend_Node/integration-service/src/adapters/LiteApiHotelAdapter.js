const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const AccommodationAdapter = require('./AccommodationAdapter');
const { kursAdapter } = require('./FrankfurterExchangeAdapter');
const { geokoder } = require('./NominatimGeocodeAdapter');
const { bookingUrl } = require('../utils/bookingLink');
const { LITEAPI, liteApiKonfigurisan } = require('../config/externalApis');
const { AccommodationsCacheModel, TTL } = require('../models/CacheModels');

/** Poluprecnik Zemlje u kilometrima - za udaljenost od centra grada. */
const R_ZEMLJE = 6371;

/**
 * Ocena gostiju na skalu 1-5.
 *
 * LiteAPI ocenjuje na skali 0-10, a bodovanje u Planneru racuna kaznu
 * kao `(5 - ocena) / 5`. Bez svodjenja bi hotel sa ocenom 8.6 dobio
 * NEGATIVNU kaznu, tj. nezasluzenu prednost nad svima ostalima.
 * Vrednosti do 5 se ostavljaju kakve jesu (mock podaci su vec na 1-5).
 */
const uSkaluDoPet = (ocena) => {
  const broj = Number(ocena);

  if (!Number.isFinite(broj) || broj <= 0) return null;
  if (broj <= 5) return Math.round(broj * 10) / 10;

  return Math.round((broj / 2) * 10) / 10;
};

/**
 * LiteAPI `hotelType` je slobodan tekst i zna da bude "Not Available",
 * pa se tip prepoznaje po kljucnoj reci. Spec §4.4 poznaje samo tri tipa.
 */
const prepoznajTip = (tekst) => {
  const t = String(tekst || '').toLowerCase();

  if (t.includes('hostel')) return 'hostel';
  if (t.includes('apart') || t.includes('condo') || t.includes('residence')) return 'apartman';

  return 'hotel';
};

/**
 * Adapter za smestaj preko LiteAPI-ja (spec §5).
 *
 * Booking.com Demand API trazi partnerski ugovor, a Amadeus je ugasio
 * besplatni portal - LiteAPI ima otvoren sandbox (kljuc pocinje sa
 * `sand_`). Aplikacija smestaj NE rezervise: svaka ponuda nosi
 * `bookingUrl` ka Booking.com pretrazi (spec §4.4).
 *
 * Pretraga ide u dva poziva:
 *   1. /data/hotels  - katalog hotela u gradu (koordinate, tip, zvezdice)
 *   2. /hotels/rates - cene za trazene datume i broj gostiju
 */
class LiteApiHotelAdapter extends BaseAdapter {
  constructor() {
    super(AccommodationsCacheModel, TTL.accommodations);
    this.baseUrl = LITEAPI.baseUrl;
    this.mockAdapter = new AccommodationAdapter();
  }

  _greska(poruka, code, statusCode) {
    const e = new Error(poruka);
    e.code = code;
    e.statusCode = statusCode;
    return e;
  }

  _zaglavlja() {
    return {
      'X-API-Key': LITEAPI.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  _porukaGreske(err) {
    return (
      err.response?.data?.error?.description ||
      err.response?.data?.message ||
      err.message
    );
  }

  /** Haversine razdaljina u kilometrima. */
  _razdaljinaKm(lat1, lon1, lat2, lon2) {
    if (![lat1, lon1, lat2, lon2].every((v) => Number.isFinite(v))) return undefined;

    const rad = (x) => (x * Math.PI) / 180;

    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;

    return Math.round(2 * R_ZEMLJE * Math.asin(Math.sqrt(a)) * 100) / 100;
  }

  /** KORAK 1: katalog hotela u gradu. */
  async _katalog(city, countryCode) {
    const odgovor = await axios.get(`${this.baseUrl}${LITEAPI.hotelsPath}`, {
      headers: this._zaglavlja(),
      params: {
        countryCode,
        cityName: city,
        limit: LITEAPI.kandidata
      },
      timeout: LITEAPI.timeout
    });

    const hoteli = odgovor.data?.data || [];
    const poId = new Map();

    for (const h of hoteli) {
      if (!h.id) continue;

      poId.set(String(h.id), {
        name: h.name,
        address: h.address || '',
        city: h.city || city,
        lat: Number(h.latitude ?? h.location?.latitude),
        lon: Number(h.longitude ?? h.location?.longitude),
        rating: uSkaluDoPet(h.rating),
        stars: Number(h.stars ?? h.starRating) || null,
        type: prepoznajTip(h.hotelType),
        image: h.main_photo || null
      });
    }

    return poId;
  }

  /** KORAK 2: cene za datume. Vraca najnizu ponudu po hotelu. */
  async _cene(hotelIds, checkIn, checkOut, guests) {
    const odgovor = await axios.post(
      `${this.baseUrl}${LITEAPI.ratesPath}`,
      {
        hotelIds,
        occupancies: [{ adults: Math.max(1, parseInt(guests, 10) || 1) }],
        currency: 'EUR',
        guestNationality: process.env.LITEAPI_GUEST_NATIONALITY || 'RS',
        checkin: String(checkIn).slice(0, 10),
        checkout: String(checkOut).slice(0, 10)
      },
      { headers: this._zaglavlja(), timeout: LITEAPI.timeout }
    );

    const najniza = new Map();

    for (const stavka of odgovor.data?.data || []) {
      const hotelId = String(stavka.hotelId);

      for (const soba of stavka.roomTypes || []) {
        for (const cena of soba.rates || []) {
          const ukupno = (cena.retailRate?.total || [])[0];
          const iznos = Number(ukupno?.amount);

          if (!Number.isFinite(iznos)) continue;

          const kandidat = {
            offerId: soba.offerId || null,
            amount: iznos,
            currency: ukupno.currency || 'EUR',
            rateName: cena.name || null,
            refundable: cena.cancellationPolicies?.refundableTag === 'RFN'
          };

          const trenutna = najniza.get(hotelId);
          if (!trenutna || kandidat.amount < trenutna.amount) najniza.set(hotelId, kandidat);
        }
      }
    }

    return najniza;
  }

  /** LiteAPI + katalog -> interni model smestaja. */
  async _spoji(hotelId, katalog, cena, centar, { city, checkIn, checkOut, guests }) {
    const h = katalog.get(hotelId);
    if (!h) return null;

    const noci = AccommodationAdapter.brojNoci(checkIn, checkOut);
    const ukupnoEur = await kursAdapter.uEur(cena.amount, cena.currency);
    const poNoci = noci > 0 ? Math.round((cena.amount / noci) * 100) / 100 : cena.amount;

    return {
      id: hotelId,
      offerId: cena.offerId,
      name: h.name,
      city: h.city || city,
      address: h.address,
      type: h.type,
      stars: h.stars,
      // null, a ne 0: hotel bez ocene nije hotel sa najgorom ocenom
      rating: h.rating,

      lat: h.lat,
      lon: h.lon,
      distanceToCenter: centar
        ? this._razdaljinaKm(centar.lat, centar.lon, h.lat, h.lon)
        : undefined,

      pricePerNight: poNoci,
      price: poNoci,
      currency: cena.currency,
      priceEUR: noci > 0 ? Math.round((ukupnoEur / noci) * 100) / 100 : ukupnoEur,
      totalPrice: Math.round(cena.amount * 100) / 100,

      nights: noci,
      checkInDate: String(checkIn).slice(0, 10),
      checkOutDate: String(checkOut).slice(0, 10),

      images: h.image ? [h.image] : [],
      amenities: [],
      cancellation: cena.refundable ? 'Free cancellation' : 'Non-refundable',

      bookingUrl: bookingUrl({
        city: h.city || city,
        checkIn,
        checkOut,
        guests,
        hotelName: h.name
      })
    };
  }

  async _fetchFromLiteApi(query) {
    const { city, countryCode, checkIn, checkOut, guests = 1 } = query;

    // Planner salje oznaku drzave uz naziv grada; geokoder je koristi da
    // ne pogodi pogresan grad istog imena, a LiteAPI je trazi u pretrazi
    const centar = await geokoder.grad(city, countryCode);

    if (!centar?.countryCode) {
      throw this._greska(
        `Nije poznata drzava grada ${city} - LiteAPI je trazi u pretrazi`,
        'CITY_NOT_FOUND',
        404
      );
    }

    const katalog = await this._katalog(city, countryCode || centar.countryCode);

    if (katalog.size === 0) {
      console.warn(`[LITEAPI] Nema hotela u katalogu za ${city}`);
      return [];
    }

    const cene = await this._cene([...katalog.keys()], checkIn, checkOut, guests);

    const smestaji = [];

    for (const [hotelId, cena] of cene) {
      const s = await this._spoji(hotelId, katalog, cena, centar, query);
      if (s) smestaji.push(s);
    }

    console.log(`[LITEAPI] Dobijeno ${smestaji.length} smestaja za ${city}`);

    return smestaji
      .sort((a, b) => a.pricePerNight - b.pricePerNight)
      .slice(0, LITEAPI.maxRezultata);
  }

  async fetch(query) {
    const { city, checkIn, checkOut, guests = 1 } = query;

    if (!city || !checkIn || !checkOut) {
      throw this._greska(
        'Missing required parameters: city, checkIn, checkOut',
        'VALIDATION_ERROR',
        400
      );
    }

    const queryKey = `accommodations-${city}-${checkIn}-${checkOut}-${guests}`;
    let source = 'cache';


    const rezultat = await this.withCache(queryKey, async () => {
      if (!liteApiKonfigurisan()) {
        console.warn('[LITEAPI] Kljuc nije podesen - koristim mock podatke');
        source = 'mock';
        return this.mockAdapter.ucitajIFiltriraj(query);
      }

      try {
        source = 'liteapi';
        return await this._fetchFromLiteApi(query);
      } catch (err) {
        console.error('[LITEAPI] Error:', this._porukaGreske(err));
        console.warn('[LITEAPI] Prelazim na mock podatke (fallback)');
        source = 'mock-fallback';
        return this.mockAdapter.ucitajIFiltriraj(query);
      }
    });

    return { ...rezultat, source };
  }
}

module.exports = LiteApiHotelAdapter;

// Izvezeno za jedinicne testove - obe funkcije su ciste.
module.exports.uSkaluDoPet = uSkaluDoPet;
module.exports.prepoznajTip = prepoznajTip;
