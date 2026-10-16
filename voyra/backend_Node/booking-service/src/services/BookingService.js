const Booking = require('../models/Booking');
const { validirajPutnike } = require('../utils/putniciValidator');
const IntegrationClient = require('./clients/IntegrationClient');
const TripClient = require('./clients/TripClient');
const NotificationClient = require('./clients/NotificationClient');
const ConfirmationService = require('./ConfirmationService');

/** Vecina avio-kompanija ogranicava rezervaciju na 9 putnika (spec §4.8). */
const MAX_PUTNIKA = 9;

/** Razlika u ceni ispod koje se ne trazi nova potvrda (zaokruzivanje). */
const TOLERANCIJA_CENE = 0.01;

/**
 * Rezervacija leta po specifikaciji §4.8.
 *
 *   provera ponude -> (potvrda nove cene) -> kreiranje -> REZERVISANO
 *
 * Nema simulacije placanja: tok je potpun, ali bez stvarne kupovine i
 * naplate - u test rezimu se placa sa balansa kod avio-kompanije.
 * Smestaj se ne rezervise (spec §4.4), pa ga ovde nema.
 */
class BookingService {
  constructor() {
    this.integration = new IntegrationClient();
    this.trips = new TripClient();
    this.notifications = new NotificationClient();
    this.confirmations = new ConfirmationService();
  }

  _greska(poruka, code, statusCode, dodatno = {}) {
    const e = new Error(poruka);
    e.code = code;
    e.statusCode = statusCode;
    Object.assign(e, dodatno);
    return e;
  }

  /**
   * Koji let se rezervise (spec §4.8).
   *
   * Redosled izvora je bitan: lista `flights` je RANGIRANA, a korisnik u
   * carobnjaku moze da izabere bilo koju ponudu. Uzimanje `flights[0]`
   * znacilo bi da se rezervise prvi let sa liste, a ne onaj koji je
   * korisnik izabrao.
   *
   *   1. `itinerary.selectedFlight` - izricit izbor korisnika
   *   2. ponuda sa `recommended: true`
   *   3. `flights[0]`, uz `explicit: false` i upozorenje
   *
   * @returns {{ ponuda, explicit, warning }|null}
   */
  _ponudaIzPlana(trip, offerId) {
    const plan = trip?.itinerary || {};
    const letovi = plan.flights || [];

    if (offerId) {
      const svi = [plan.selectedFlight, ...letovi].filter(Boolean);
      const nadjena = svi.find((f) => String(f.offerId || f.id) === String(offerId));

      return nadjena ? { ponuda: nadjena, explicit: true, warning: null } : null;
    }

    if (plan.selectedFlight) {
      return { ponuda: plan.selectedFlight, explicit: true, warning: null };
    }

    // Putovanja sacuvana ranije nemaju `selectedFlight` - tada se
    // uzima preporucena ponuda, ali se to JASNO prijavljuje, da korisnik
    // vidi koji ce let biti rezervisan pre nego sto potvrdi
    const preporucena = letovi.find((f) => f.recommended);

    if (preporucena) {
      return { ponuda: preporucena, explicit: false, warning: 'FLIGHT_NOT_EXPLICIT' };
    }

    if (letovi.length > 0) {
      return { ponuda: letovi[0], explicit: false, warning: 'FLIGHT_NOT_EXPLICIT' };
    }

    return null;
  }

  /** Sazetak leta koji se prikazuje pre potvrde (spec §4.8 t.1). */
  _sazetakLeta(ponuda) {
    if (!ponuda) return null;

    return {
      offerId: ponuda.offerId || ponuda.id || null,
      airline: ponuda.airline || null,
      airlineIata: ponuda.airlineIata || null,
      number: ponuda.number || null,
      from: ponuda.from || null,
      to: ponuda.to || null,
      departure: ponuda.departure || ponuda.outbound?.departure || null,
      arrival: ponuda.arrival || ponuda.outbound?.arrival || null,
      outbound: ponuda.outbound || null,
      inbound: ponuda.inbound || null,
      stops: ponuda.stops ?? null,
      duration: ponuda.duration ?? null,
      price: this._cena(ponuda),
      currency: ponuda.currency || 'EUR'
    };
  }

  /** Da li je ponuda istekla po vremenu koje je sam izvor prijavio. */
  _jeIstekla(ponuda) {
    if (!ponuda?.expiresAt) return false;

    const istice = new Date(ponuda.expiresAt);
    return !Number.isNaN(istice.getTime()) && istice <= new Date();
  }

  _cena(ponuda) {
    return Number(ponuda?.priceEUR ?? ponuda?.price ?? 0);
  }

  /**
   * Da li se cena promenila dovoljno da se traži nova potvrda.
   *
   * Tolerancija od jednog centa postoji zato što cena putuje kroz
   * zaokruživanje (izvor je daje kao nisku, mi je čuvamo kao broj), pa bi
   * bez nje razlika od 0,004 EUR tražila da korisnik ponovo potvrđuje
   * istu cenu.
   *
   * Izdvojeno iz `validate` i `create` — isto pravilo je
   * stajalo na dva mesta i nije se moglo proveriti bez pokrenutih servisa.
   */
  _cenaPromenjena(stara, nova) {
    return Math.abs(Number(nova) - Number(stara)) > TOLERANCIJA_CENE;
  }

  // =================================================================
  // KORAK 1: provera ponude (spec §4.8 t.2)
  // =================================================================

  async validate({ tripId, offerId }, user, token, requestId) {
    if (!tripId) {
      throw this._greska('Obavezan je tripId', 'VALIDATION_ERROR', 400);
    }

    const trip = await this.trips.putovanje(tripId, token);

    if (!trip) {
      throw this._greska('Putovanje nije pronadjeno', 'NOT_FOUND', 404);
    }

    if (trip.status === 'REZERVISANO') {
      throw this._greska('Let za ovo putovanje je vec rezervisan', 'ALREADY_BOOKED', 409);
    }

    if (trip.status === 'OTKAZANO' || trip.status === 'ZAVRSENO') {
      throw this._greska(
        `Putovanje je u stanju ${trip.status} - rezervacija nije moguca`,
        'INVALID_STATE',
        409
      );
    }

    const izbor = this._ponudaIzPlana(trip, offerId);

    if (!izbor) {
      throw this._greska(
        'Putovanje nema izabran let - potrebno je ponovo generisati plan',
        'NO_FLIGHT_IN_TRIP',
        409
      );
    }

    const { ponuda: izPlana, explicit, warning } = izbor;
    const traziSe = izPlana.offerId || izPlana.id;

    // Cena se uvek uzima iz svezeg odgovora izvora, nikad iz plana:
    // plan je snimak od pre neko vreme, a ponuda u medjuvremenu moze
    // da poskupi ili da istekne
    let ponuda;
    let source = null;

    try {
      const odgovor = await this.integration.ponuda(traziSe, requestId);
      ponuda = odgovor.ponuda;
      source = odgovor.source;
    } catch (err) {
      // Ponuda koje vise nema kod izvora je isto sto i istekla: klijent
      // iz oba slucaja ide na osvezavanje
      if (err.statusCode === 404 || err.statusCode === 410) {
        throw this._greska(
          'Ponuda je istekla - osveži ponudu ili izaberi drugi let',
          'OFFER_EXPIRED',
          410,
          { flight: this._sazetakLeta(izPlana), explicit }
        );
      }

      throw err;
    }

    if (this._jeIstekla(ponuda)) {
      throw this._greska(
        'Ponuda je istekla - osveži ponudu ili izaberi drugi let',
        'OFFER_EXPIRED',
        410,
        { flight: this._sazetakLeta(izPlana), explicit }
      );
    }

    const staraCena = this._cena(izPlana);
    const novaCena = this._cena(ponuda);
    const promenjena = this._cenaPromenjena(staraCena, novaCena);

    return {
      valid: true,
      offerId: ponuda.offerId || traziSe,
      expiresAt: ponuda.expiresAt || null,
      priceChanged: promenjena,
      oldPrice: staraCena,
      newPrice: novaCena,
      currency: ponuda.currency || 'EUR',
      passengersAllowed: MAX_PUTNIKA,
      passengersRequired: Number(trip.passengers) || 1,
      // Koji let ce biti rezervisan - frontend ga prikazuje pre potvrde
      flight: { ...this._sazetakLeta(ponuda), price: novaCena },
      explicit,
      warnings: warning ? [warning] : [],
      source
    };
  }

  // =================================================================
  // KORAK 2: kreiranje rezervacije (spec §4.8 t.3 i t.4)
  // =================================================================

  async create({ tripId, offerId, passengers = [], acceptedPrice }, user, token, requestId) {
    // Provera pre poziva izvora - poruka je ista kao kada je odbije
    // avio-kompanija, pa korisnik dobija isto uputstvo u oba slucaja
    if (passengers.length > MAX_PUTNIKA) {
      throw this._greska(
        `Let treba rezervisati u vise delova (najvise ${MAX_PUTNIKA} putnika po rezervaciji)`,
        'TOO_MANY_PASSENGERS',
        422
      );
    }

    const trip = await this.trips.putovanje(tripId, token);

    if (!trip) {
      throw this._greska('Putovanje nije pronadjeno', 'NOT_FOUND', 404);
    }

    if (trip.status === 'REZERVISANO') {
      throw this._greska('Let za ovo putovanje je vec rezervisan', 'ALREADY_BOOKED', 409);
    }

    // Sve greske o putnicima se vracaju ODJEDNOM, da korisnik ne popravlja
    // jednu po jednu (spec §4.8 t.3)
    const greskePutnika = validirajPutnike(passengers, {
      brojPutnika: Number(trip.passengers) || undefined,
      datumPovratka: trip.checkOut
    });

    if (greskePutnika.length > 0) {
      throw this._greska('Podaci o putnicima nisu ispravni', 'VALIDATION_ERROR', 400, {
        errors: greskePutnika
      });
    }

    const izbor = this._ponudaIzPlana(trip, offerId);

    if (!izbor) {
      throw this._greska(
        'Putovanje nema izabran let - potrebno je ponovo generisati plan',
        'NO_FLIGHT_IN_TRIP',
        409
      );
    }

    const izPlana = izbor.ponuda;
    const traziSe = izPlana.offerId || izPlana.id;

    // Rezervacija u toku ili vec zavrsena za isto putovanje (§1.5)
    const aktivna = await Booking.findOne({
      tripId,
      status: { $in: ['PENDING', 'CONFIRMED'] }
    });

    if (aktivna) {
      throw this._greska(
        aktivna.status === 'CONFIRMED'
          ? 'Let za ovo putovanje je vec rezervisan'
          : 'Rezervacija za ovo putovanje je vec u toku',
        aktivna.status === 'CONFIRMED' ? 'ALREADY_BOOKED' : 'BOOKING_IN_PROGRESS',
        409
      );
    }
    const { ponuda } = await this.integration.ponuda(traziSe, requestId);

    if (this._jeIstekla(ponuda)) {
      throw this._greska(
        'Ponuda je istekla - generisi plan ponovo ili izaberi drugi let',
        'OFFER_EXPIRED',
        410
      );
    }

    const novaCena = this._cena(ponuda);

    // Korisnik placa cenu koju je video i potvrdio; svaka druga se odbija
    if (acceptedPrice === undefined || this._cenaPromenjena(acceptedPrice, novaCena)) {
      throw this._greska(
        `Cena je promenjena - potvrdi novu cenu (${novaCena} ${ponuda.currency || 'EUR'})`,
        'PRICE_CHANGED',
        409
      );
    }

    let booking;

    try {
      booking = await Booking.create({
        userId: user.id,
        tripId,
        passengers: passengers.map((p) => this._putnik(p)),
        flights: [
          {
            offerId: traziSe,
            from: ponuda.from,
            to: ponuda.to,
            departure: ponuda.departure,
            arrival: ponuda.arrival,
            airline: ponuda.airline,
            airlineIata: ponuda.airlineIata,
            outbound: ponuda.outbound,
            inbound: ponuda.inbound,
            price: novaCena,
            currency: ponuda.currency || 'EUR',
            status: 'PENDING'
          }
        ],
        status: 'PENDING',
        totalPrice: novaCena,
        currency: ponuda.currency || 'EUR',
        confirmations: { email_address: user.email }
      });
    } catch (err) {
      /*
       * Jedinstven indeks na `aktivnaZaPutovanje` (§1.5) je poslednja
       * odbrana od dvostruke rezervacije: kada dva zahteva stignu u istoj
       * sekundi, provera iznad oba propusti, a baza drugi odbije.
       */
      if (err.code === 11000) {
        throw this._greska(
          'Rezervacija za ovo putovanje je vec u toku',
          'BOOKING_IN_PROGRESS',
          409
        );
      }

      throw err;
    }

    try {
      const { narudzbina } = await this.integration.kreirajNarudzbinu(
        {
          offerId: traziSe,
          passengers: this._putniciZaIzvor(passengers, ponuda),
          amount: novaCena,
          currency: ponuda.currency || 'EUR'
        },
        requestId
      );

      booking.flights[0].orderId = narudzbina.orderId;
      booking.flights[0].bookingReference = narudzbina.bookingReference;
      booking.flights[0].status = 'CONFIRMED';
      booking.status = 'CONFIRMED';

      await booking.save();
    } catch (err) {
      booking.status = 'FAILED';
      booking.failureReason = err.message;
      booking.flights[0].status = 'FAILED';
      await booking.save();

      throw err;
    }

    // Status putovanja (spec §4.8 t.4). Neuspeh se prijavljuje kao
    // upozorenje - rezervacija kod avio-kompanije vec postoji
    const status = await this.trips.promeniStatus(
      tripId,
      'REZERVISANO',
      {
        bookingId: booking.bookingId,
        bookingReference: booking.flights[0].bookingReference,
        bookingDate: new Date()
      },
      requestId
    );

    const upozorenja = status.ok
      ? []
      : ['Rezervacija je uspela, ali status putovanja nije azuriran'];

    await this._posaljiPotvrdu(booking);

    // `tripStatus` ide u odgovoru, da frontend ne mora posebno da
    // osvezava putovanje samo zbog statusa
    return { booking, warnings: upozorenja, tripStatus: status.ok ? 'REZERVISANO' : trip.status };
  }

  /** Podaci o putniku u obliku koji se cuva. */
  _putnik(p) {
    return {
      passengerId: p.passengerId || p.id || null,
      title: p.title,
      givenName: p.givenName || p.given_name,
      familyName: p.familyName || p.family_name,
      bornOn: p.bornOn || p.born_on,
      gender: p.gender,
      email: p.email,
      phoneNumber: p.phoneNumber || p.phone_number
    };
  }

  /**
   * Putnici u obliku koji trazi izvor. ID-jeve dodeljuje ponuda, a ne
   * klijent - bez njih avio-kompanija odbija narudzbinu.
   */
  _putniciZaIzvor(passengers, ponuda) {
    const idjevi = ponuda.passengerIds || [];

    /*
     * BEZ podrazumevanih vrednosti za titulu i pol.
     *
     * Ranije su se tiho popunjavali sa `mr` i `m`, pa bi rezervacija
     * nosila netacne podatke o putniku - a to je podatak na karti.
     * Validacija ih trazi, pa ovde nema sta da se dopunjava.
     */
    return passengers.map((p, i) => ({
      id: p.passengerId || p.id || idjevi[i] || null,
      title: String(p.title || '').toLowerCase(),
      given_name: p.givenName || p.given_name,
      family_name: p.familyName || p.family_name,
      born_on: p.bornOn || p.born_on,
      gender: String(p.gender || '').toLowerCase(),
      email: p.email,
      phone_number: p.phoneNumber || p.phone_number
    }));
  }

  // =================================================================
  // KORAK 3: otkazivanje (spec §4.9)
  // =================================================================

  async cancel(booking, razlog = 'Korisnik je otkazao rezervaciju', requestId = null) {
    if (booking.status === 'CANCELLED') {
      return { booking, alreadyCancelled: true, warnings: [] };
    }

    if (booking.status === 'PENDING' || booking.status === 'FAILED') {
      booking.status = 'CANCELLED';
      booking.cancelledAt = new Date();
      await booking.save();

      return { booking, alreadyCancelled: false, warnings: [] };
    }

    for (const let_ of booking.flights) {
      if (let_.status !== 'CONFIRMED' || !let_.orderId) {
        let_.status = 'CANCELLED';
        continue;
      }

      // Greska se namerno propagira: putovanje ne sme da bude OTKAZANO
      // dok je let jos uvek rezervisan
      const { otkazivanje } = await this.integration.otkaziNarudzbinu(let_.orderId, requestId);

      if (!otkazivanje?.cancelled) {
        throw this._greska(
          'Avio-kompanija nije potvrdila otkazivanje',
          'CANCEL_NOT_CONFIRMED',
          502
        );
      }

      let_.status = 'CANCELLED';
    }

    booking.status = 'CANCELLED';
    booking.cancelledAt = new Date();
    await booking.save();

    const status = await this.trips.promeniStatus(
      booking.tripId,
      'OTKAZANO',
      { cancelledAt: booking.cancelledAt },
      requestId
    );

    const upozorenja = status.ok || !booking.tripId
      ? []
      : ['Let je otkazan, ali status putovanja nije azuriran'];

    await this._obavesti('BOOKING_CANCELLED', booking, {
      bookingId: booking.bookingId,
      reason: razlog
    });

    return { booking, alreadyCancelled: false, warnings: upozorenja };
  }

  // =================================================================
  // Potvrda i obavestenja
  // =================================================================

  /** PDF i email; nikad ne obara vec uspesnu rezervaciju. */
  async _posaljiPotvrdu(booking) {
    try {
      const pdf = await this.confirmations.generatePdf(booking);
      booking.confirmations.flight_pdf_url = pdf.url;

      const r = await this._obavesti(
        'BOOKING_CONFIRMED',
        booking,
        {
          bookingId: booking.bookingId,
          pnr: booking.flights.map((f) => f.bookingReference).filter(Boolean).join(', ') || '-',
          passengersCount: booking.passengers.length,
          total: `${booking.totalPrice} ${booking.currency}`
        },
        pdf.putanja
      );

      booking.confirmations.email_sent = r.sent;
      await booking.save();
    } catch (err) {
      console.error('[BOOKING_SERVICE] Generisanje potvrde neuspesno:', err.message);
    }
  }

  async _obavesti(tip, booking, templateData, putanjaPdf = null) {
    let attachment;

    if (putanjaPdf) {
      try {
        const fs = require('fs');
        attachment = {
          filename: `${booking.bookingId}.pdf`,
          content: fs.readFileSync(putanjaPdf).toString('base64'),
          contentType: 'application/pdf'
        };
      } catch (err) {
        console.warn('[BOOKING_SERVICE] PDF prilog nije procitan:', err.message);
      }
    }

    return this.notifications.send(tip, {
      userId: booking.userId,
      recipient: { email: booking.confirmations?.email_address },
      templateData,
      attachment,
      metadata: { bookingId: booking.bookingId, source: 'booking-service' }
    });
  }

  // =================================================================
  // Citanje
  // =================================================================

  async getBooking(bookingId, userId) {
    const booking = await Booking.findOne({ bookingId });

    if (!booking) {
      throw this._greska('Rezervacija nije pronadjena', 'NOT_FOUND', 404);
    }

    if (booking.userId !== userId) {
      throw this._greska('Nemate pristup ovoj rezervaciji', 'FORBIDDEN', 403);
    }

    return booking;
  }

  async getUserBookings(userId, filter = {}) {
    const upit = { userId };

    if (filter.status) upit.status = filter.status;
    // Stranica putovanja trazi rezervacije jednog putovanja (§1.6)
    if (filter.tripId) upit.tripId = String(filter.tripId);

    return Booking.find(upit).sort({ createdAt: -1 }).limit(100);
  }
}

module.exports = BookingService;
module.exports.MAX_PUTNIKA = MAX_PUTNIKA;
