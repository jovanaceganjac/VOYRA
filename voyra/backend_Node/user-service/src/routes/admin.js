const express = require('express');
const User = require('../models/User');
const { verifyInternalAdmin } = require('../middleware/internalAdmin');
const {
  STATUSI,
  tipObavestenja,
  ponistavaTokene,
  proveriPromenuStatusa
} = require('../config/statusi');

const router = express.Router();

const ULOGE = ['korisnik', 'admin'];

const neispravanId = (id) => !/^[0-9a-fA-F]{24}$/.test(String(id));

const nijePronadjen = (res) =>
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'Korisnik nije pronadjen',
    statusCode: 404
  });

// GET /api/users/all?status=&uloga=  - INTERNO (Admin Service)
router.get('/all', verifyInternalAdmin, async (req, res, next) => {
  try {
    const { status, uloga } = req.query;

    const upit = {};
    if (status) upit.status = status;
    if (uloga) upit.uloga = uloga;

    const users = await User.find(upit).sort({ createdAt: -1 });

    res.json({ success: true, data: users, count: users.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/status - INTERNO
router.patch('/:id/status', verifyInternalAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;

    // Neispravan status se odbija pre pretrage naloga - ne trazi bazu
    if (!STATUSI.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Neispravan status. Dozvoljeni: ${STATUSI.join(', ')}`,
        statusCode: 400
      });
    }

    if (neispravanId(req.params.id)) return nijePronadjen(res);

    const postojeci = await User.findById(req.params.id);
    if (!postojeci) return nijePronadjen(res);

    /*
     * Pravila su u `config/statusi.js`, kao cista funkcija:
     * dozvoljene putanje (spec §4.10), zabrana da administrator sam sebe
     * zakljuca, i zastita poslednjeg aktivnog administratora.
     */
    const samSebi = String(req.params.id) === String(req.admin.id);
    const trebaBrojatiAdmine = postojeci.uloga === 'admin' && status !== 'odobren';

    const odluka = proveriPromenuStatusa({
      izStatusa: postojeci.status,
      uStatus: status,
      uloga: postojeci.uloga,
      samSebi,
      aktivnihAdmina: trebaBrojatiAdmine
        ? await User.countDocuments({ uloga: 'admin', status: 'odobren' })
        : Number.MAX_SAFE_INTEGER
    });

    if (!odluka.ok) {
      return res.status(odluka.statusCode).json({
        success: false,
        error: odluka.error,
        message: odluka.message,
        statusCode: odluka.statusCode
      });
    }

    const stariStatus = postojeci.status;

    const ponistiTokene = ponistavaTokene(status);

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        status,
        updatedAt: new Date(),
        ...(ponistiTokene ? { $inc: { tokenVersion: 1 } } : {})
      },
      { new: true, runValidators: true }
    );

    console.log(`[USER_SERVICE] Admin ${req.admin.korisnickoIme} -> ${user.korisnickoIme} status: ${stariStatus} -> ${status}`);

    res.json({
      success: true,
      data: user,
      // Admin Service iz ovoga bira koje obavestenje salje (§3.3)
      promena: { iz: stariStatus, u: status, obavestenje: tipObavestenja(stariStatus, status) },
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/role - INTERNO
router.patch('/:id/role', verifyInternalAdmin, async (req, res, next) => {
  try {
    const { uloga } = req.body;

    if (!ULOGE.includes(uloga)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Neispravna uloga. Dozvoljene: ${ULOGE.join(', ')}`,
        statusCode: 400
      });
    }

    if (neispravanId(req.params.id)) return nijePronadjen(res);

    const postojeci = await User.findById(req.params.id);
    if (!postojeci) return nijePronadjen(res);

    // Oduzimanje uloge poslednjem adminu zakljucalo bi panel za sve
    if (postojeci.uloga === 'admin' && uloga !== 'admin') {
      const brojAdmina = await User.countDocuments({ uloga: 'admin' });

      if (brojAdmina <= 1) {
        return res.status(409).json({
          success: false,
          error: 'LAST_ADMIN',
          message: 'Ne mozete oduzeti ulogu poslednjem administratoru',
          statusCode: 409
        });
      }
    }

    /*
     * Token nosi ulogu, pa posle promene mora da se izda nov - inace bi
     * korisnik unapredjen u administratora i dalje imao staru ulogu u
     * tokenu, a oduzeta prava bi vazila tek po isteku.
     * Korisnik se zato ponovo prijavljuje.
     */
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { uloga, updatedAt: new Date(), $inc: { tokenVersion: 1 } },
      { new: true, runValidators: true }
    );

    console.log(`[USER_SERVICE] Admin ${req.admin.korisnickoIme} -> ${user.korisnickoIme} uloga: ${uloga}`);

    res.json({ success: true, data: user, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id - INTERNO
router.delete('/:id', verifyInternalAdmin, async (req, res, next) => {
  try {
    if (neispravanId(req.params.id)) return nijePronadjen(res);

    // Poslednji admin ne sme da nestane - niko vise ne bi mogao u panel
    const meta = await User.findById(req.params.id);
    if (!meta) return nijePronadjen(res);

    if (meta.uloga === 'admin') {
      const brojAdmina = await User.countDocuments({ uloga: 'admin' });
      if (brojAdmina <= 1) {
        return res.status(409).json({
          success: false,
          error: 'LAST_ADMIN',
          message: 'Ne mozete obrisati poslednjeg administratora',
          statusCode: 409
        });
      }
    }

    const user = await User.findByIdAndDelete(req.params.id);

    console.log(`[USER_SERVICE] Admin ${req.admin.korisnickoIme} obrisao korisnika ${user.korisnickoIme}`);

    res.json({ success: true, data: user, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
