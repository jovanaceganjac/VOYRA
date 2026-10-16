const mongoose = require('mongoose');

/** Statusi putovanja po specifikaciji §4.9. */
const STATUSI = ['NACRT', 'REZERVISANO', 'OTKAZANO', 'ZAVRSENO'];

/**
 * Dozvoljeni prelazi. Otkazano i zavrseno putovanje su konacna stanja -
 * bez ovoga bi se otkazano putovanje moglo vratiti u REZERVISANO iako
 * let vise nije rezervisan.
 */
const PRELAZI = {
  NACRT: ['REZERVISANO', 'OTKAZANO'],
  REZERVISANO: ['OTKAZANO', 'ZAVRSENO'],
  OTKAZANO: [],
  ZAVRSENO: []
};

const jeDozvoljenPrelaz = (iz, u) => (PRELAZI[iz] || []).includes(u);

const TripSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    from: {
      type: String,
      required: true
    },

    to: {
      type: String,
      required: true
    },

    date: {
      type: Date,
      required: true
    },

    checkIn: {
      type: Date,
      required: true
    },

    checkOut: {
      type: Date,
      required: true
    },

    passengers: {
      type: Number,
      default: 1,
      min: 1
    },

    guests: {
      type: Number,
      default: 1,
      min: 1
    },

    budget: {
      type: Number,
      required: true,
      min: 0
    },

    /**
     * Preferencije putovanja (spec §4.2 i §9).
     * Cuvaju se uz putovanje, pa se plan moze ponovo generisati sa istim
     * izborom, a korisnik vidi po cemu je plan pravljen.
     */
    preferences: {
      transportPriority: String,
      accommodationTypes: [String],
      minAccommodationRating: Number,
      interests: [String],
      pace: String,
      dayStart: String,
      dayEnd: String
    },

    /**
     * GRADOVI (spec §4.2).
     *
     * `from` i `to` (IATA kodovi) ostaju zbog ranije sacuvanih putovanja,
     * a ovde stoji pun opis grada - ukljucujuci aerodrom preko kog se
     * putuje i njegovu udaljenost, sto plan koristi za transfer.
     */
    fromCity: { type: mongoose.Schema.Types.Mixed, default: null },
    toCity: { type: mongoose.Schema.Types.Mixed, default: null },

    /**
     * Rezultat Planner Service-a, sacuvan U CELOSTI.
     *
     * Namerno `Mixed`, a ne tipizirana podsema: ranije su bila navedena
     * samo polja `flights`, `accommodations`, `itinerary`, `totalDays`,
     * `totalBudget` i `meta`, pa je Mongoose tiho odbacivao sve ostalo -
     * `selectedFlight`, `selectedAccommodation`, `removedAttractions`,
     * `warnings`, `preferences`. Zbog toga sacuvano putovanje nije znalo
     * koji je let izabran, a "Generisi ponovo" (§4.6) upravo to trazi.
     *
     * Uz `Mixed` svaka izmena mora da pozove `markModified('itinerary')`.
     */
    itinerary: mongoose.Schema.Types.Mixed,

    // Specifikacija §4.9. Prelazi su ograniceni (vidi PRELAZI ispod):
    //   NACRT -> REZERVISANO | OTKAZANO
    //   REZERVISANO -> OTKAZANO | ZAVRSENO
    status: {
      type: String,
      enum: STATUSI,
      default: 'NACRT',
      index: true
    },

    bookingInfo: {
      // Kod rezervacije koji je vratila avio-kompanija (PNR)
      bookingReference: String,
      // Interni identifikator rezervacije u Booking Service-u
      bookingId: String,
      accommodationBookingUrl: String,
      bookingDate: Date,
      cancelledAt: Date
    }
  },
  // timestamps sam vodi createdAt i updatedAt
  { timestamps: true }
);

// Najcesci upit: sva putovanja korisnika, najnovija prva
TripSchema.index({ userId: 1, createdAt: -1 });
TripSchema.index({ userId: 1, status: 1 });

const Trip = mongoose.model('Trip', TripSchema);

module.exports = Trip;
module.exports.STATUSI = STATUSI;
module.exports.PRELAZI = PRELAZI;
module.exports.jeDozvoljenPrelaz = jeDozvoljenPrelaz;
