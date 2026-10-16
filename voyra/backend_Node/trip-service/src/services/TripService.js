const axios = require('axios');
const Trip = require('../models/Trip');
const { jeDozvoljenPrelaz } = require('../models/Trip');

// 2-opt i k-means umeju da potraju, pa je timeout veci nego kod ostalih poziva
const PLANNER_TIMEOUT_MS = parseInt(process.env.PLANNER_TIMEOUT_MS, 10) || 30000;

/**
 * Poslovna logika Trip Service-a.
 *
 * Trip Service ne planira sam - poziva Planner Service i cuva rezultat.
 * Svaki upit nad putovanjem filtrira i po userId, pa korisnik ne moze
 * da dohvati ili izmeni tudje putovanje.
 */
class TripService {
  constructor() {
    this.plannerServiceUrl = process.env.PLANNER_SERVICE_URL || 'http://localhost:4004';
    this.bookingServiceUrl = process.env.BOOKING_SERVICE_URL || 'http://localhost:4006';
  }

  /** Greska sa kodom, da ruta zna koji HTTP status da vrati. */
  _greska(poruka, code, statusCode) {
    const e = new Error(poruka);
    e.code = code;
    e.statusCode = statusCode;
    return e;
  }

  /**
   * Generise plan preko Planner Service-a.
   * Prijavljenom korisniku se plan cuva kao NACRT; gostu se samo vraca
   * (nema vlasnika, pa nema ni sta da se sacuva).
   */
  async planTrip(query, userId) {
    const { from, to, date, checkIn, checkOut, passengers, guests, budget, title, description, preferences, fromCity, toCity } = query;

    let itinerary;

    try {
      const odgovor = await axios.post(
        `${this.plannerServiceUrl}/api/planner/plan`,
        {
          from,
          to,
          date,
          checkIn,
          checkOut,
          passengers: passengers || 1,
          guests: guests || 1,
          budget,
          preferences
        },
        { timeout: PLANNER_TIMEOUT_MS }
      );

      itinerary = odgovor.data.data;
    } catch (err) {
      // Planner je odbio zahtev (npr. neispravni datumi) - prosledi njegov razlog
      if (err.response) {
        console.error('[TRIP_SERVICE] Planner odbio zahtev:', err.response.data?.message);
        throw this._greska(
          err.response.data?.message || 'Planner Service je odbio zahtev',
          err.response.data?.error || 'PLANNER_ERROR',
          err.response.status
        );
      }

      console.error('[TRIP_SERVICE] Planner nedostupan:', err.message);
      throw this._greska('Planner Service trenutno nije dostupan', 'SERVICE_UNAVAILABLE', 503);
    }

    // Gost: plan se vraca, ali se ne cuva (nema vlasnika)
    if (!userId) {
      console.log('[TRIP_SERVICE] Gost - plan generisan bez cuvanja');
      return { trip: itinerary, saved: false, source: this._izvor(itinerary) };
    }

    const trip = await Trip.create({
      userId,
      title: title || `${from} -> ${to}`,
      description,
      from,
      to,
      date,
      checkIn,
      checkOut,
      passengers: passengers || 1,
      guests: guests || 1,
      budget,
      fromCity: fromCity || null,
      toCity: toCity || null,
      preferences: itinerary?.preferences || preferences,
      itinerary,
      status: 'NACRT'
    });

    console.log(`[TRIP_SERVICE] Plan sacuvan kao draft: ${trip._id} (korisnik ${userId})`);

    return { trip, saved: true, source: this._izvor(itinerary) };
  }

  /** Da li plan sadrzi stvarne podatke ili je vracen prazan. */
  _izvor(itinerary) {
    return itinerary?.meta?.attractionsFound > 0 ? 'real' : 'fallback';
  }

  /**
   * Cuva izmene putovanja.
   *
   * Status se NE menja ovde: po spec §4.9 u REZERVISANO ga prevodi
   * rezervacija leta, a u OTKAZANO otkazivanje. Izmena naziva ne sme
   * da vrati rezervisano putovanje u nacrt.
   *
   * `version` je USLOVNO cuvanje: ako je putovanje u
   * medjuvremenu izmenjeno - drugi tab, drugi uredjaj - cuvanje se
   * odbija sa 409 umesto da tiho pregazi tudji rad. Kao verzija se
   * koristi `updatedAt`, jer ga Mongoose vec odrzava na svakom upisu;
   * `__v` se povecava samo kod izmena nizova, pa nije pouzdan.
   */
  async saveTrip(tripId, userId, updates, { version = null } = {}) {
    const trip = await this._nadji(tripId, userId);

    if (version && new Date(version).getTime() !== new Date(trip.updatedAt).getTime()) {
      const e = this._greska(
        'Putovanje je u međuvremenu izmenjeno',
        'VERSION_CONFLICT',
        409
      );

      e.currentVersion = new Date(trip.updatedAt).toISOString();
      throw e;
    }

    // Vlasnik, status i verzija se ne menjaju kroz telo zahteva
    const { userId: _u, _id, status: _s, createdAt, version: _v, ...dozvoljeno } = updates;

    Object.assign(trip, dozvoljeno);

    // Bez ovoga Mongoose ne primeti izmenu unutar ugnjezdenog niza dana
    if (dozvoljeno.itinerary) trip.markModified('itinerary');

    await trip.save();

    return trip;
  }

  /**
   * Promena statusa uz proveru dozvoljenog prelaza (spec §4.9).
   * Koriste je interna ruta (Booking Service) i pozadinski posao.
   */
  async promeniStatus(tripId, noviStatus, { userId = null, bookingInfo = null } = {}) {
    this._proveriId(tripId);

    const upit = userId ? { _id: tripId, userId } : { _id: tripId };
    const trip = await Trip.findOne(upit);

    if (!trip) {
      throw this._greska('Putovanje nije pronadjeno', 'NOT_FOUND', 404);
    }

    // Isti status nije greska - poziv je vec obavljen ranije
    if (trip.status === noviStatus) {
      return { trip, promenjen: false };
    }

    if (!jeDozvoljenPrelaz(trip.status, noviStatus)) {
      throw this._greska(
        `Prelaz ${trip.status} -> ${noviStatus} nije dozvoljen`,
        'INVALID_TRANSITION',
        409
      );
    }

    trip.status = noviStatus;

    if (bookingInfo) {
      trip.bookingInfo = { ...(trip.bookingInfo?.toObject?.() || trip.bookingInfo), ...bookingInfo };
    }

    await trip.save();

    console.log(`[TRIP_SERVICE] Putovanje ${tripId}: status -> ${noviStatus}`);

    return { trip, promenjen: true };
  }

  /** Sva putovanja korisnika, najnovija prva. */
  async getUserTrips(userId, filter = {}) {
    const upit = { userId };

    if (filter.status) upit.status = filter.status;
    if (filter.from) upit.from = filter.from;
    if (filter.to) upit.to = filter.to;

    return Trip.find(upit).sort({ createdAt: -1 }).limit(50);
  }

  async getTrip(tripId, userId) {
    return this._nadji(tripId, userId);
  }

  async deleteTrip(tripId, userId) {
    this._proveriId(tripId);

    const trip = await Trip.findOneAndDelete({ _id: tripId, userId });

    if (!trip) {
      throw this._greska('Putovanje nije pronadjeno', 'NOT_FOUND', 404);
    }

    return trip;
  }

  /**
   * Otkazivanje putovanja (spec §4.9).
   *
   * Ako let jeste rezervisan, prvo se otkazuje rezervacija. Kada to ne
   * uspe, status putovanja OSTAJE nepromenjen i greska se prosledjuje -
   * putovanje ne sme da pise OTKAZANO dok je let i dalje rezervisan.
   * Smestaj korisnik otkazuje sam na Booking.com-u.
   */
  async otkaziPutovanje(tripId, userId, token) {
    const trip = await this._nadji(tripId, userId);

    if (trip.status === 'OTKAZANO') {
      return { data: trip, vecOtkazano: true, rezervacija: null };
    }

    if (trip.status === 'ZAVRSENO') {
      throw this._greska(
        'Zavrseno putovanje ne moze da se otkaze',
        'INVALID_TRANSITION',
        409
      );
    }

    let rezervacija = null;

    if (trip.bookingInfo?.bookingId) {
      try {
        const odgovor = await axios.patch(
          `${this.bookingServiceUrl}/api/bookings/${trip.bookingInfo.bookingId}/cancel`,
          { reason: 'Korisnik je otkazao putovanje' },
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 15000
          }
        );

        rezervacija = {
          bookingId: odgovor.data?.bookingId || trip.bookingInfo.bookingId,
          status: odgovor.data?.status || null
        };
      } catch (err) {
        console.error('[TRIP_SERVICE] Otkazivanje leta neuspesno:', err.message);

        throw this._greska(
          err.response?.data?.message ||
            'Let nije mogao da se otkaze - putovanje je ostalo rezervisano',
          'FLIGHT_CANCEL_FAILED',
          err.response?.status && err.response.status < 500 ? err.response.status : 502
        );
      }
    }

    // Booking Service je mozda vec prebacio status kroz internu rutu
    const sveza = await Trip.findById(tripId);

    if (sveza.status !== 'OTKAZANO') {
      await this.promeniStatus(tripId, 'OTKAZANO', {
        userId,
        bookingInfo: { cancelledAt: new Date() }
      });
    }

    return {
      data: await Trip.findById(tripId),
      vecOtkazano: false,
      rezervacija
    };
  }

  /** Neispravan ObjectId bi inace izazvao CastError i 500. */
  _proveriId(tripId) {
    if (!/^[0-9a-fA-F]{24}$/.test(String(tripId))) {
      throw this._greska('Neispravan format ID-a putovanja', 'INVALID_ID', 400);
    }
  }

  /**
   * Dohvata putovanje uz proveru vlasnistva.
   * Tudje putovanje daje isti 404 kao nepostojece - da se ne otkriva
   * koji ID-jevi postoje u bazi.
   */
  async _nadji(tripId, userId) {
    this._proveriId(tripId);

    const trip = await Trip.findOne({ _id: tripId, userId });

    if (!trip) {
      throw this._greska('Putovanje nije pronadjeno', 'NOT_FOUND', 404);
    }

    return trip;
  }
}

module.exports = TripService;
