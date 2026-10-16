const express = require('express');

const CityService = require('../services/CityService');

const router = express.Router();
const cities = new CityService();

/**
 * Referentni podaci o gradovima (spec §4.2, §7).
 *
 * Rute su JAVNE: pretraga gradova se poziva dok korisnik kuca, i pre
 * prijave (brza pretraga na početnoj). Ne otkrivaju ništa o korisnicima.
 */

/** GET /api/cities?q=beo&limit=10 */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 25);
    const data = await cities.pretrazi(req.query.q || '', limit);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** GET /api/cities/by-iata/BEG - stari zahtevi sa IATA kodom */
router.get('/by-iata/:kod', async (req, res, next) => {
  try {
    const grad = await cities.poIataKodu(req.params.kod);

    if (!grad) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Za IATA kod ${req.params.kod} nema grada u bazi`,
        statusCode: 404
      });
    }

    res.json({ success: true, data: grad, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/** GET /api/cities/:id */
router.get('/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await cities.jedan(req.params.id), statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
