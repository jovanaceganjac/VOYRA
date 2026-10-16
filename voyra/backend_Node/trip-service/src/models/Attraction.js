const mongoose = require('mongoose');

const VREME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

/**
 * ATRAKCIJE ADMINISTRATORA (spec §9 `attractions`, §4.5).
 *
 * Spoljni izvor (OpenTripMap) ne zna sve: mala mesta ga nemaju, a i tamo
 * gde ga ima, administrator moze da doda ono sto izvor propusta. Ove
 * atrakcije se u Fazi 3 SPAJAJU sa eksternim i nose `source: 'admin'`.
 *
 * `izvor` je uvek `admin` - eksterne atrakcije se ne cuvaju ovde, one
 * zive u kesu Integration Service-a (spec §9 `api_cache`).
 */
const AttractionSchema = new mongoose.Schema(
  {
    izvor: { type: String, enum: ['admin'], default: 'admin' },

    naziv: { type: String, required: true, trim: true, maxlength: 140, index: true },
    opis: { type: String, default: '', trim: true, maxlength: 1000 },

    /** `_id` grada iz kolekcije `cities` - string, geonameId. */
    gradId: { type: String, required: true, index: true },
    gradNaziv: { type: String, default: null },

    lat: { type: Number, required: true, min: -90, max: 90 },
    lon: { type: Number, required: true, min: -180, max: 180 },

    /** Kljucevi iz `interest_categories`. */
    kategorije: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Navedite bar jednu kategoriju'
      }
    },

    trajanjeMin: { type: Number, required: true, min: 15, max: 600 },

    /** `null` znaci da radno vreme nije poznato - tada vazi procena po kategoriji. */
    radnoVreme: {
      type: {
        open: { type: String, match: [VREME, 'Format je HH:MM'] },
        close: { type: String, match: [VREME, 'Format je HH:MM'] }
      },
      default: null
    },

    /** `null` je "nepoznato", 0 je "besplatno" - to nije isto. */
    cenaUlaznice: { type: Number, default: null, min: 0 },

    slika: {
      type: {
        url: String,
        sourceUrl: String,
        credit: String
      },
      default: null
    },

    /** Meko brisanje - sacuvani planovi je i dalje prikazuju. */
    aktivna: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

AttractionSchema.index({ gradId: 1, aktivna: 1 });

module.exports = mongoose.model('Attraction', AttractionSchema, 'attractions');
module.exports.VREME = VREME;
