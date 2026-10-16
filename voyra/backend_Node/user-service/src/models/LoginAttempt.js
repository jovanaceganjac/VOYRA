const mongoose = require('mongoose');

/** Koliko pogresnih pokusaja pre zakljucavanja. */
const MAX_POKUSAJA = parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5;

/** Prozor u kom se pokusaji broje, i koliko traje zakljucavanje. */
const PROZOR_MIN = parseInt(process.env.LOGIN_WINDOW_MINUTES, 10) || 15;

/**
 * NEUSPESNI POKUSAJI PRIJAVE.
 *
 * Broji se po paru (korisnicko ime, IP adresa):
 *   - samo po korisnickom imenu bi jedan napadac mogao da zakljuca tudji
 *     nalog gadjajuci ga pogresnim lozinkama (zabrana usluge);
 *   - samo po IP adresi bi zakljucalo sve iza istog NAT-a cim jedan
 *     korisnik pogresi lozinku nekoliko puta.
 *
 * Stanje ide u MongoDB, a ne u memoriju: servis sme da se restartuje, a
 * da napadac time ne dobije novih pet pokusaja. Cena je jedan upit po
 * prijavi, sto je zanemarljivo prema bcrypt poredjenju koje ionako sledi.
 *
 * TTL brise CEO dokument kada prozor istekne - zato dokument nosi samo
 * brojac i vreme, nista sto bi smelo da nadzivi prozor.
 */
const LoginAttemptSchema = new mongoose.Schema(
  {
    /** `korisnickoIme|ip`, mala slova. */
    kljuc: { type: String, required: true, unique: true },

    korisnickoIme: { type: String, required: true },
    ip: { type: String, required: true },

    pokusaji: { type: Number, default: 0 },

    /** Vreme prvog pokusaja u prozoru - od njega tece TTL. */
    prviPokusaj: { type: Date, default: Date.now },
    poslednjiPokusaj: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

/*
 * Zapis nestaje sam posle prozora, pa se brojac "resetuje" bez ijednog
 * dodatnog posla. Istek se racuna od PRVOG pokusaja: pet promasaja u
 * minutu zakljucava nalog tacno 15 minuta, a ne dok napadac kuca.
 */
LoginAttemptSchema.index({ prviPokusaj: 1 }, { expireAfterSeconds: PROZOR_MIN * 60 });

module.exports = mongoose.model('LoginAttempt', LoginAttemptSchema, 'login_attempts');
module.exports.MAX_POKUSAJA = MAX_POKUSAJA;
module.exports.PROZOR_MIN = PROZOR_MIN;
