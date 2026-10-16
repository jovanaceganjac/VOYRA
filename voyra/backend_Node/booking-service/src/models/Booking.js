const mongoose = require('mongoose');
const crypto = require('crypto');

const DRAFT_TTL_MIN = parseInt(process.env.DRAFT_TTL_MINUTES, 10) || 30;

/**
 * Statusi rezervacije:
 *   PENDING   - nacrt, rezervacija jos nije poslata avio-kompaniji
 *   CONFIRMED - avio-kompanija je vratila kod rezervacije
 *   FAILED    - pokusaj je odbijen
 *   CANCELLED - otkazana posle potvrde
 *   EXPIRED   - nacrt kojem je isteklo vreme
 *
 * Nema statusa za placanje: spec §4.8 trazi potpun tok "bez stvarne
 * kupovine i naplate", a Duffel u test rezimu placa sa balansa.
 */
const STATUSI = ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'];

/**
 * Podaci o putniku koje avio-kompanija trazi pri kreiranju rezervacije.
 * Cuvaju se jer se posle pojavljuju na potvrdi.
 */
const PutnikSchema = new mongoose.Schema(
  {
    // Duffel ID putnika iz ponude (pas_...)
    passengerId: String,
    title: String,
    givenName: { type: String, required: true },
    familyName: { type: String, required: true },
    bornOn: String,
    gender: String,
    email: String,
    phoneNumber: String
  },
  { _id: false }
);

/**
 * Jedan rezervisan let - povratna ponuda je i dalje jedna stavka,
 * sa odlaskom i povratkom unutar `outbound` i `inbound`.
 */
const LetSchema = new mongoose.Schema(
  {
    offerId: { type: String, required: true },
    // Duffel identifikator narudzbine (ord_...)
    orderId: String,
    // Kod rezervacije koji korisnik pokazuje na salteru (PNR)
    bookingReference: String,

    from: String,
    to: String,
    departure: Date,
    arrival: Date,
    airline: String,
    airlineIata: String,

    outbound: Object,
    inbound: Object,

    price: Number,
    currency: { type: String, default: 'EUR' },
    status: { type: String, enum: STATUSI, default: 'PENDING' }
  },
  { _id: false }
);

const BookingSchema = new mongoose.Schema(
  {
    // Citljiv identifikator koji se koristi u URL-u (BK8f6a2d)
    bookingId: {
      type: String,
      required: true,
      unique: true,
      default: () => `BK${crypto.randomBytes(3).toString('hex')}`
    },

    userId: { type: String, required: true, index: true },
    tripId: { type: String, index: true },

    /**
     * Kljuc koji cuva od DVOSTRUKE REZERVACIJE (spec §4.8).
     *
     * Provera "da li vec postoji rezervacija za ovo putovanje" u kodu ne
     * pomaze kada dva zahteva stignu u istoj sekundi: oba procitaju
     * prazno stanje i oba nastave. Zato je ovde jedinstven indeks:
     * polje drzi `tripId` dok je rezervacija PENDING ili CONFIRMED, a
     * prazni se kada padne, istekne ili bude otkazana - pa isto
     * putovanje sme ponovo da se rezervise.
     *
     * Baza je jedini nivo na kom je ovo stvarno garantovano.
     */
    aktivnaZaPutovanje: { type: String, default: null },

    flights: [LetSchema],
    passengers: [PutnikSchema],

    status: {
      type: String,
      enum: STATUSI,
      default: 'PENDING',
      index: true
    },

    totalPrice: { type: Number, required: true },
    currency: { type: String, default: 'EUR' },

    // Do kada nacrt vazi; posle toga se ne moze potvrditi
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + DRAFT_TTL_MIN * 60 * 1000)
    },

    confirmations: {
      flight_pdf_url: String,
      email_sent: { type: Boolean, default: false },
      email_address: String
    },

    // Razlog neuspeha / otkazivanja
    failureReason: String,
    cancelledAt: Date
  },
  { timestamps: true }
);

/**
 * TTL brise SAMO nepotvrdjene nacrte.
 *
 * Bez partialFilterExpression bi posle 30 minuta nestale i potvrdjene
 * rezervacije. Ovako istekao nacrt ostaje dovoljno dugo da aplikacija
 * na njega odgovori sa 410 GONE, a tek ga pozadinski TTL posao
 * kasnije pocisti.
 */
BookingSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 3600, // sat vremena posle isteka
    partialFilterExpression: { status: 'PENDING' }
  }
);

BookingSchema.index({ userId: 1, createdAt: -1 });

/**
 * Najvise JEDNA aktivna rezervacija po putovanju.
 *
 * Indeks je PARCIJALAN, a ne `sparse`. Razlika je bila greska koju je
 * pronasao E2E scenario otkazivanja: `sparse` preskace
 * samo dokumente u kojima polja NEMA, a otkazana rezervacija ga ima i
 * postavljeno je na `null`. Druga otkazana rezervacija u istoj bazi zato
 * pada na `E11000 ... dup key: { aktivnaZaPutovanje: null }`, pa
 * otkazivanje vraca `502 FLIGHT_CANCEL_FAILED`, a putovanje ostaje
 * REZERVISANO.
 *
 * Parcijalni filter indeksira samo zapise u kojima je polje NISKA, to jest
 * one koji zaista drze putovanje, pa ih otkazanih moze biti koliko god.
 */
BookingSchema.index(
  { aktivnaZaPutovanje: 1 },
  { unique: true, partialFilterExpression: { aktivnaZaPutovanje: { $type: 'string' } } }
);

/** Statusi u kojima rezervacija "drzi" putovanje. */
const AKTIVNI_STATUSI = ['PENDING', 'CONFIRMED'];

/**
 * `aktivnaZaPutovanje` se vodi iz statusa, da se ne razidju.
 * Radi i na `save()` i na `create()`, jer oba prolaze kroz `pre('save')`.
 */
BookingSchema.pre('save', function (next) {
  this.aktivnaZaPutovanje = AKTIVNI_STATUSI.includes(this.status) ? this.tripId || null : null;
  next();
});

/** Da li je nacrt istekao (samo nepotvrdjen nacrt moze da istekne). */
BookingSchema.methods.jeIstekao = function () {
  return this.status === 'PENDING' && this.expiresAt < new Date();
};

const Booking = mongoose.model('Booking', BookingSchema, 'bookings');

module.exports = Booking;
module.exports.STATUSI = STATUSI;
