const mongoose = require('mongoose');

/**
 * Radno vreme u obliku HH:MM.
 *
 * Dozvoljeno je i "24:00": Planner ga vec prepoznaje kao kraj dana
 * (`vreme.js`), pa priroda stoji kao 00:00-24:00, tj. bez ogranicenja.
 * Prelazak preko ponoci ("20:00"-"02:00") je takodje dozvoljen.
 */
const VREME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

/**
 * KATEGORIJE INTERESOVANJA (spec §9 `interest_categories`).
 *
 * Ranije su ovo bile konstante u `planner-service/src/config/
 * preferencije.js`. Specifikacija §3.3 daje administratoru da ih
 * uredjuje, pa su prebacene u bazu - ali konstante ostaju kao REZERVA,
 * da planiranje radi i kada Trip Service nije dostupan.
 *
 * `kljuc` je nepromenljiv: sacuvana putovanja i preferencije korisnika
 * ga vec nose, pa bi preimenovanje razvezalo stare planove od kategorija.
 * Zato se i brisanje radi meko (`aktivna: false`).
 */
const InterestCategorySchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      match: [/^[a-z_]{3,30}$/, 'Kljuc sme da ima samo mala slova i donju crtu (3-30 znakova)']
    },

    naziv: { type: String, required: true, trim: true, maxlength: 60 },
    opis: { type: String, default: '', trim: true, maxlength: 300 },

    /**
     * `kinds` iz OpenTripMap taksonomije koji pripadaju ovoj kategoriji.
     * Iz njih se racuna i obrnuto mapiranje (kind -> interesovanja).
     */
    eksterneKategorije: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Navedite bar jednu spoljnu kategoriju'
      }
    },

    /**
     * Geoapify kategorije. Hijerarhijske su
     * (`tourism.sights` pokriva i `tourism.sights.castle`), pa se navodi
     * najvisi nivo koji pripada ovoj kategoriji. Prazna lista znaci da
     * se za Geoapify koriste podrazumevane kategorije adaptera.
     */
    geoapifyKategorije: { type: [String], default: [] },

    /** Procena trajanja posete, u minutima. */
    trajanjePoseteMin: { type: Number, required: true, min: 15, max: 600 },

    radnoVreme: {
      open: { type: String, required: true, match: [VREME, 'Format je HH:MM'] },
      close: { type: String, required: true, match: [VREME, 'Format je HH:MM'] }
    },

    redosled: { type: Number, default: 100 },

    /** Meko brisanje - neaktivna se ne nudi, ali stari planovi rade. */
    aktivna: { type: Boolean, default: true, index: true }
  },
  { timestamps: true, _id: false }
);

InterestCategorySchema.index({ aktivna: 1, redosled: 1 });

module.exports = mongoose.model('InterestCategory', InterestCategorySchema, 'interest_categories');
module.exports.VREME = VREME;
