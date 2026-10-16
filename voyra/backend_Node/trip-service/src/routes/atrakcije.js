const express = require('express');

const { verifyInternalKey } = require('../middleware/internalKey');
const AtrakcijeService = require('../services/AtrakcijeService');

const router = express.Router();
const servis = new AtrakcijeService();

/**
 * ATRAKCIJE ADMINISTRATORA - interne rute (spec §3.3, §4.5, §9).
 *
 * Cita ih Planner (spajanje u Fazi 3), a menja Admin Service, koji pre
 * toga proverava JWT i ulogu.
 */

/** GET /internal/attractions?gradId=...&sve=true */
router.get('/', verifyInternalKey, async (req, res, next) => {
  const { gradId } = req.query;

  if (!gradId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'gradId je obavezan',
      statusCode: 400
    });
  }

  try {
    const sve = String(req.query.sve || '').toLowerCase() === 'true';
    const data = await servis.lista(gradId, sve);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /internal/attractions/planner?gradId=...
 *
 * Isti zapisi, ali u obliku koji Faza 3 ocekuje od izvora atrakcija -
 * Planner ih tako spaja sa eksternim bez prepakivanja.
 */
router.get('/planner', verifyInternalKey, async (req, res, next) => {
  const { gradId } = req.query;

  if (!gradId) return res.json({ success: true, data: [], count: 0, statusCode: 200 });

  try {
    const zapisi = await servis.zaGrad(gradId);
    const data = zapisi.map((a) => servis.zaPlanner(a));

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** GET /internal/attractions/:id */
router.get('/:id', verifyInternalKey, async (req, res, next) => {
  try {
    res.json({ success: true, data: await servis.jedna(req.params.id), statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** POST /internal/attractions */
router.post('/', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.kreiraj(req.body || {});

    res.status(201).json({ success: true, data, statusCode: 201 });
  } catch (err) {
    next(err);
  }
});

/** PATCH /internal/attractions/:id */
router.patch('/:id', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.izmeni(req.params.id, req.body || {});

    res.json({ success: true, data, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** DELETE /internal/attractions/:id - MEKO brisanje. */
router.delete('/:id', verifyInternalKey, async (req, res, next) => {
  try {
    const data = await servis.deaktiviraj(req.params.id);

    res.json({ success: true, data, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
