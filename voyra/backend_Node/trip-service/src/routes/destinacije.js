const express = require('express');

const { verifyInternalKey } = require('../middleware/internalKey');
const DestinacijeService = require('../services/DestinacijeService');

const router = express.Router();
const servis = new DestinacijeService();

/**
 * DESTINACIJE I STATISTIKA PRETRAGA (spec §4.1, §9).
 *
 * Sve iza `X-Internal-Key`: cita ih orchestrator (i prosledjuje javno,
 * preko `/v1/destinations/...`), a menja Admin Service.
 */

/** GET /internal/destinations?sve=true */
router.get('/', verifyInternalKey, async (req, res, next) => {
  try {
    const sve = String(req.query.sve || '').toLowerCase() === 'true';
    const data = await servis.lista(sve);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** GET /internal/destinations/popular?limit=8 - stoji PRE `/:id`. */
router.get('/popular', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.popularne(req.query.limit);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** POST /internal/destinations */
router.post('/', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.kreiraj(req.body || {});

    res.status(201).json({ success: true, data, statusCode: 201 });
  } catch (err) {
    next(err);
  }
});

/** PATCH /internal/destinations/order  telo: { ids: [...] } - PRE `/:id`. */
router.patch('/order', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.poredjaj(req.body?.ids || []);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** PATCH /internal/destinations/:id */
router.patch('/:id', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.izmeni(req.params.id, req.body || {});

    res.json({ success: true, data, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** DELETE /internal/destinations/:id */
router.delete('/:id', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.obrisi(req.params.id);

    res.json({ success: true, data, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
