const express = require('express');
const User = require('../models/User');
const { verifyJWT } = require('../middleware/auth');
const { validate, promenaLozinkeSchema } = require('../middleware/validation');
const { generateToken } = require('../utils/jwt');
const PhoneService = require('../services/PhoneService');
const PokusajiPrijave = require('../services/PokusajiPrijave');
const NotificationClient = require('../services/NotificationClient');
const AuditClient = require('../services/AuditClient');

const router = express.Router();
const phoneService = new PhoneService();
const pokusaji = new PokusajiPrijave();
const obavestenja = new NotificationClient();
const audit = new AuditClient();

// verifyJWT se dodaje PO RUTI, ne preko router.use():
// router.use() bi se izvrsio za svaki zahtev na /api/users - i za
// /login i /register iz drugog rutera - pa bi ih blokirao sa 401.

/** Ucitava korisnika iz tokena. */
const ucitaj = async (req) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    const e = new Error('Korisnik nije pronadjen');
    e.code = 'NOT_FOUND';
    e.statusCode = 404;
    throw e;
  }

  return user;
};

const odgovor = (user, dodatno = {}) => ({
  success: true,
  data: {
    _id: user._id,
    ime: user.ime,
    prezime: user.prezime,
    email: user.email,
    korisnickoIme: user.korisnickoIme,
    uloga: user.uloga,
    status: user.status,
    phone: user.javniTelefon()
  },
  ...dodatno,
  statusCode: 200
});

/**
 * PUT /api/users/me/password - promena lozinke (spec §4.10).
 *
 * Telo: { trenutnaLozinka, novaLozinka }.
 *
 * Uspesna promena ponistava SVE ranije tokene (tokenVersion + 1), pa se
 * odmah izdaje nov token za sesiju iz koje je promena stigla - inace bi
 * korisnik bio odjavljen bas tamo gde je upravo uneo novu lozinku.
 */
router.put('/me/password', verifyJWT, validate(promenaLozinkeSchema), async (req, res, next) => {
  try {
    const { trenutnaLozinka, novaLozinka } = req.body;

    /*
     * Pogresna TRENUTNA lozinka se broji isto kao promasena prijava:
     * bez toga bi ukraden (ili pozajmljen) uredjaj sa otvorenom sesijom
     * bio mesto za neometano pogadjanje lozinke. Kljuc je korisnik, ne
     * IP - sesija je vec vezana za njega.
     */
    const pre = await pokusaji.stanje(req.user.id, 'password');

    if (pre.zakljucan) {
      res.set('Retry-After', String(pre.preostaloSek));
      return res.status(429).json(pokusaji.odgovor429(pre.preostaloSek));
    }

    const user = await User.findById(req.user.id).select('+lozinka');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Korisnik nije pronadjen',
        statusCode: 404
      });
    }

    if (!(await user.uporediLozinku(trenutnaLozinka))) {
      const posle = await pokusaji.zabelezi(req.user.id, 'password');

      if (posle.zakljucan) {
        res.set('Retry-After', String(posle.preostaloSek));
        return res.status(429).json(pokusaji.odgovor429(posle.preostaloSek));
      }

      return res.status(400).json({
        success: false,
        error: 'WRONG_PASSWORD',
        message: 'Trenutna lozinka nije tacna',
        attemptsLeft: posle.preostaloPokusaja,
        statusCode: 400
      });
    }

    // Ista lozinka nije promena - i ne bi imalo smisla odjaviti uredjaje
    if (await user.uporediLozinku(novaLozinka)) {
      return res.status(400).json({
        success: false,
        error: 'SAME_PASSWORD',
        message: 'Nova lozinka mora da se razlikuje od trenutne',
        statusCode: 400
      });
    }

    // `pre('save')` hesira lozinku istim brojem rundi kao pri registraciji
    user.lozinka = novaLozinka;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await pokusaji.ocisti(req.user.id, 'password');

    // Nov token za OVU sesiju; svi ostali su upravo prestali da vaze
    const token = generateToken(
      user._id,
      user.korisnickoIme,
      user.email,
      user.uloga,
      user.tokenVersion
    );

    // Oboje "posalji i zaboravi" - lozinka je vec promenjena
    obavestenja.lozinkaPromenjena(user).catch(() => {});
    audit.zabelezi('CHANGE_PASSWORD', { userId: String(user._id), req }).catch(() => {});

    res.json({
      success: true,
      message: 'Lozinka je promenjena. Ostali uredjaji su odjavljeni.',
      token,
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me
router.get('/me', verifyJWT, async (req, res, next) => {
  try {
    res.json(odgovor(await ucitaj(req)));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/me - izmena profila.
 * Broj telefona se proverava samo po obliku - bez SMS koda za potvrdu.
 */
router.put('/me', verifyJWT, async (req, res, next) => {
  try {
    const user = await ucitaj(req);
    const { ime, prezime, phone } = req.body;

    if (ime) user.ime = ime;
    if (prezime) user.prezime = prezime;

    if (phone !== undefined && phone !== null && phone !== '') {
      await phoneService.postaviBroj(user, phone);
    } else {
      await user.save();
    }

    res.json(odgovor(user));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me/sms-preference
router.patch('/me/sms-preference', verifyJWT, async (req, res, next) => {
  try {
    const user = await ucitaj(req);
    await phoneService.postaviSmsPreferencu(user, req.body?.smsOptIn);

    res.json(odgovor(user));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
