const express = require('express');
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');
const { proxyConfig, proxyError } = require('../utils/proxy');

const router = express.Router();
const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || 'http://localhost:4002';

// Lanac trip -> planner -> integration -> spoljni API moze da potraje,
// pa /plan dobija duzi timeout od ostalih proxy poziva.
const PLAN_TIMEOUT_MS = Number(process.env.PLAN_TIMEOUT_MS) || 35000;

// POST /api/trips/plan - JAVNO (gosti mogu da generisu plan bez naloga)
router.post('/plan', async (req, res) => {
  try {
    const response = await axios.post(
      `${TRIP_SERVICE_URL}/api/trips/plan`,
      req.body,
      proxyConfig(req, PLAN_TIMEOUT_MS)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'TRIP_SERVICE_ERROR', 'Greska pri generisanju plana');
  }
});

// POST /api/trips - ZASTICENO (sacuvaj putovanje)
router.post('/', verifyToken, async (req, res) => {
  try {
    const response = await axios.post(
      `${TRIP_SERVICE_URL}/api/trips`,
      req.body,
      proxyConfig(req)
    );
    res.status(response.status || 201).json(response.data);
  } catch (err) {
    proxyError(res, err, 'TRIP_SERVICE_ERROR', 'Greska pri cuvanju putovanja');
  }
});

// GET /api/trips - ZASTICENO (sva putovanja prijavljenog korisnika)
router.get('/', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(
      `${TRIP_SERVICE_URL}/api/trips`,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'TRIP_SERVICE_ERROR', 'Greska pri preuzimanju putovanja');
  }
});

// GET /api/trips/:id - ZASTICENO (jedno putovanje)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(
      `${TRIP_SERVICE_URL}/api/trips/${req.params.id}`,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'TRIP_SERVICE_ERROR', 'Greska pri preuzimanju putovanja');
  }
});

// PUT /api/trips/:id - ZASTICENO (azuriranje putovanja)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const response = await axios.put(
      `${TRIP_SERVICE_URL}/api/trips/${req.params.id}`,
      req.body,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'TRIP_SERVICE_ERROR', 'Greska pri azuriranju putovanja');
  }
});

// DELETE /api/trips/:id - ZASTICENO (brisanje putovanja)
/**
 * PATCH /api/trips/:id/cancel - otkazivanje putovanja (spec §4.9).
 * Trip Service prvo otkazuje rezervaciju leta preko Booking Service-a.
 */
router.patch('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const response = await axios.patch(
      `${TRIP_SERVICE_URL}/api/trips/${req.params.id}/cancel`,
      req.body,
      proxyConfig(req, 30000)
    );

    res.status(response.status).json(response.data);
  } catch (err) {
    proxyError(res, err, 'TRIP_SERVICE_ERROR', 'Greska pri otkazivanju putovanja');
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const response = await axios.delete(
      `${TRIP_SERVICE_URL}/api/trips/${req.params.id}`,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'TRIP_SERVICE_ERROR', 'Greska pri brisanju putovanja');
  }
});

module.exports = router;
