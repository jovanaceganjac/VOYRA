const express = require('express');
const User = require('../models/User');
const { registerSchema, loginSchema, validate } = require('../middleware/validation');
const { verifyJWT } = require('../middleware/auth');
const { generateToken } = require('../utils/jwt');
const PokusajiPrijave = require('../services/PokusajiPrijave');
const { validiraj } = require('../utils/phoneValidator');

const router = express.Router();
const pokusaji = new PokusajiPrijave();

// Poruka za svaki status koji ne sme da se prijavi
const PORUKE_STATUSA = {
  blokiran: 'Nalog je blokiran',
  odbijen: 'Registracija je odbijena',
  na_cekanju: 'Cekanje na odobrenje admina'
};

/**
 * POST /register - JAVNO
 * Registruje korisnika sa uloga='korisnik' i status='na_cekanju'.
 * Nalog ne moze da se koristi dok ga admin ne odobri (Task 07).
 */
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { ime, prezime, email, korisnickoIme, lozinka, phone } = req.body;

    // Broj se proverava pre upisa, da se nalog ne kreira pa odbije
    let telefon;
    if (phone) {
      const { valid, number, error } = validiraj(phone);

      if (!valid) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error,
          statusCode: 400
        });
      }

      const zauzet = await User.findOne({ 'phone.number': number });

      if (zauzet) {
        return res.status(400).json({
          success: false,
          error: 'DUPLICATE_PHONE',
          message: 'Broj telefona je vec u upotrebi',
          statusCode: 400
        });
      }

      telefon = { number, smsOptIn: true };
    }

    const postojeci = await User.findOne({ $or: [{ email }, { korisnickoIme }] });

    if (postojeci) {
      const duplikatEmail = postojeci.email === email.toLowerCase();
      return res.status(400).json({
        success: false,
        error: duplikatEmail ? 'DUPLICATE_EMAIL' : 'DUPLICATE_USERNAME',
        message: duplikatEmail
          ? 'Korisnik sa ovim email-om vec postoji'
          : 'Korisnicko ime je vec zauzeto',
        statusCode: 400
      });
    }

    // Hesiranje radi pre('save') hook u modelu (bcrypt, BCRYPT_ROUNDS=10)
    const user = await User.create({
      ime, prezime, email, korisnickoIme, lozinka,
      ...(telefon ? { phone: telefon } : {})
    });

    res.status(201).json({
      success: true,
      message: 'Korisnik je registrovan',
      userId: user._id,
      phone: user.javniTelefon()
    });
  } catch (err) {
    // Trka izmedju provere i upisa - unique indeks je poslednja odbrana
    if (err.code === 11000) {
      const polje = Object.keys(err.keyPattern || {})[0];
      return res.status(400).json({
        success: false,
        error: polje === 'email' ? 'DUPLICATE_EMAIL' : 'DUPLICATE_USERNAME',
        message: polje === 'email'
          ? 'Korisnik sa ovim email-om vec postoji'
          : 'Korisnicko ime je vec zauzeto',
        statusCode: 400
      });
    }
    next(err);
  }
});

/**
 * POST /login - JAVNO
 * Prijava po korisnickoIme. Token (24h) dobija samo status 'odobren'.
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { korisnickoIme, lozinka } = req.body;
    const ip = req.ip;

    /*
     * Zastita od pogadjanja lozinke. Proverava se PRE
     * poredjenja lozinke, da zakljucan par ne bi trosio bcrypt na svaki
     * pokusaj - to je i sama po sebi zastita od opterecenja.
     */
    const pre = await pokusaji.stanje(korisnickoIme, ip);

    if (pre.zakljucan) {
      res.set('Retry-After', String(pre.preostaloSek));
      return res.status(429).json(pokusaji.odgovor429(pre.preostaloSek));
    }

    // lozinka ima select:false u semi - mora se eksplicitno zatraziti
    const user = await User.findOne({ korisnickoIme }).select('+lozinka');

    // Ista poruka za nepostojeceg korisnika i pogresnu lozinku,
    // da se ne otkriva koja korisnicka imena postoje
    if (!user || !(await user.uporediLozinku(lozinka))) {
      const posle = await pokusaji.zabelezi(korisnickoIme, ip);

      if (posle.zakljucan) {
        res.set('Retry-After', String(posle.preostaloSek));
        return res.status(429).json(pokusaji.odgovor429(posle.preostaloSek));
      }

      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Korisnicko ime ili lozinka nisu tacni',
        // Isti broj i za nepostojeceg korisnika - ne otkriva se nista
        attemptsLeft: posle.preostaloPokusaja,
        statusCode: 401
      });
    }

    if (user.status !== 'odobren') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: PORUKE_STATUSA[user.status],
        statusCode: 403
      });
    }

    // Uspesna prijava brise brojac promasaja za taj par
    await pokusaji.ocisti(korisnickoIme, ip);

    const token = generateToken(
      user._id,
      user.korisnickoIme,
      user.email,
      user.uloga,
      user.tokenVersion
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        ime: user.ime,
        prezime: user.prezime,
        korisnickoIme: user.korisnickoIme,
        uloga: user.uloga,
        status: user.status
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /profile - ZASTICENO (Authorization: Bearer <token>)
 */
router.get('/profile', verifyJWT, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Korisnik nije pronadjen',
        statusCode: 404
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        ime: user.ime,
        prezime: user.prezime,
        email: user.email,
        korisnickoIme: user.korisnickoIme,
        uloga: user.uloga,
        status: user.status,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
