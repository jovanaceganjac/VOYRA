const express = require('express');
const User = require('../models/User');
const { verifyInternalKey } = require('../middleware/verifyInternalKey');

const router = express.Router();

/**
 * GET /api/users/internal/:id/token-version - INTERNO (API Gateway)
 *
 * Trenutna verzija tokena korisnika. Gateway je poredi sa
 * claim-om `tv` iz tokena, pa token izdat pre promene lozinke,
 * blokiranja ili promene uloge prestaje da vazi odmah.
 *
 * Stoji ISPRED `/:id`, inace bi "token-version" bilo protumaceno kao
 * identifikator korisnika.
 */
router.get('/:id/token-version', verifyInternalKey, async (req, res, next) => {
  try {
    if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Korisnik nije pronadjen',
        statusCode: 404
      });
    }

    const user = await User.findById(req.params.id).select('tokenVersion status uloga').lean();

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
      data: {
        tokenVersion: user.tokenVersion || 0,
        // Gateway odbija i nalog koji vise nije odobren, bez cekanja
        // da se verzija promeni
        status: user.status,
        uloga: user.uloga
      },
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/internal/:id - INTERNO (Notification Service)
 * Vraca samo ono sto treba za slanje notifikacije, ukljucujuci telefon.
 */
router.get('/:id', verifyInternalKey, async (req, res, next) => {
  try {
    if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Korisnik nije pronadjen',
        statusCode: 404
      });
    }

    const user = await User.findById(req.params.id);

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
      data: {
        _id: user._id,
        ime: user.ime,
        prezime: user.prezime,
        email: user.email,
        korisnickoIme: user.korisnickoIme,
        phone: user.javniTelefon()
      },
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
