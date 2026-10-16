const mongoose = require('mongoose');

/** Zapisi se cuvaju 90 dana; popularnost gleda poslednjih 30. */
const TTL_DANA = parseInt(process.env.SEARCH_STATS_TTL_DAYS, 10) || 90;

/**
 * STATISTIKA PRETRAGA PO GRADU (spec §9 `search_stats`, §4.1).
 *
 * Jedan zapis po gradu i danu. Dan je granularnost koja je dovoljna za
 * „popularno u poslednjih 30 dana", a drzi kolekciju malom: 20.000
 * gradova puta 90 dana je gornja granica, a stvarno se pise samo za
 * gradove koje je neko zaista trazio.
 *
 * `trazioci` cuva otiske korisnika/sesija koji su TOG dana trazili TAJ
 * grad, da osvezavanje stranice ne bi naduvalo broj (vidi TripService).
 */
const SearchStatSchema = new mongoose.Schema(
  {
    gradId: { type: String, required: true, index: true },

    /** 'YYYY-MM-DD' po UTC-u - isti dan za sve korisnike. */
    datum: { type: String, required: true },

    brojPretraga: { type: Number, default: 0 },
    brojSacuvanih: { type: Number, default: 0 },

    /**
     * Otisci onih koji su vec brojani tog dana (userId ili hash sesije).
     * Lista je ogranicena: posle 5.000 razlicitih trazilaca dnevno po
     * gradu prestaje da se dopunjuje, jer bi zapis postao prevelik - a
     * do tada je grad ionako odavno u vrhu liste.
     */
    trazioci: { type: [String], default: [] },
    cuvaoci: { type: [String], default: [] },

    /** Za TTL indeks - `datum` je string, pa ne moze da nosi istek. */
    zabelezeno: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

// Jedan zapis po gradu i danu (spec §9)
SearchStatSchema.index({ gradId: 1, datum: 1 }, { unique: true });

// Upit za popularne ide po datumu i skoru
SearchStatSchema.index({ datum: -1 });

SearchStatSchema.index({ zabelezeno: 1 }, { expireAfterSeconds: TTL_DANA * 24 * 60 * 60 });

module.exports = mongoose.model('SearchStat', SearchStatSchema, 'search_stats');
module.exports.TTL_DANA = TTL_DANA;
