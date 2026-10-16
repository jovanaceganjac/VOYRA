const express = require('express');

const { verifyInternalKey } = require('../middleware/internalKey');
const KategorijeService = require('../services/KategorijeService');

const router = express.Router();
const servis = new KategorijeService();

/**
 * KATEGORIJE INTERESOVANJA - interne rute (spec §3.3, §9).
 *
 * Sve iza `X-Internal-Key`: cita ih Planner (sa kesom), a menja
 * Admin Service, koji pre toga proverava JWT i ulogu administratora.
 * Korisnik do njih dolazi posredno, kroz `/v1/preferences/schema`.
 */

/** GET /internal/categories?sve=true - `sve` ukljucuje i neaktivne. */
router.get('/', verifyInternalKey, async (req, res, next) => {
  try {
    const sve = String(req.query.sve || '').toLowerCase() === 'true';
    const data = await servis.lista(sve);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** GET /internal/categories/:kljuc */
router.get('/:kljuc', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.jedna(req.params.kljuc);
    const koristiPutovanja = await servis.koristiPutovanja(req.params.kljuc);

    res.json({ success: true, data: { ...data, koristiPutovanja }, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** POST /internal/categories */
router.post('/', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.kreiraj(req.body || {});

    res.status(201).json({ success: true, data, statusCode: 201 });
  } catch (err) {
    next(err);
  }
});

/** PATCH /internal/categories/:kljuc - `kljuc` se ne menja. */
router.patch('/:kljuc', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.izmeni(req.params.kljuc, req.body || {});

    res.json({ success: true, data, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** DELETE /internal/categories/:kljuc - MEKO brisanje. */
router.delete('/:kljuc', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.deaktiviraj(req.params.kljuc);

    res.json({ success: true, data, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
