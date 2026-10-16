const mongoose = require('mongoose');

/**
 * ISTAKNUTE DESTINACIJE (spec §9 `destinations`, §4.1).
 *
 * Bira ih i redja administrator; pocetna strana ih prikazuje kao kartice
 * koje vode pravo u carobnjak sa vec izabranim odredistem.
 *
 * Grad se NE prepisuje ovde (naziv, drzava, koordinate) nego se cuva
 * samo `gradId`: podaci o gradu zive u kolekciji `cities`, pa
 * bi kopija vremenom otisla u stranu.
 */
const DestinationSchema = new mongoose.Schema(
  {
    /** `_id` grada iz kolekcije `cities` - jedan grad, jedna destinacija. */
    gradId: { type: String, required: true, unique: true, index: true },

    /** Naslov kartice; prazno znaci "uzmi naziv grada". */
    naslov: { type: String, default: '', trim: true, maxlength: 80 },
    opis: { type: String, default: '', trim: true, maxlength: 400 },

    slika: {
      type: {
        url: String,
        sourceUrl: String,
        credit: String
      },
      default: null
    },

    redosled: { type: Number, default: 100, index: true },

    /** Sklanjanje sa pocetne bez brisanja zapisa. */
    istaknuta: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

DestinationSchema.index({ istaknuta: 1, redosled: 1 });

module.exports = mongoose.model('Destination', DestinationSchema, 'destinations');
