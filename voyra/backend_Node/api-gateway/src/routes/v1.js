const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { proxyError } = require('../utils/proxy');

const router = express.Router();
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_SERVICE_URL || 'http://localhost:4008';

/**
 * Timeout MORA biti veci od planner timeout-a (35 s) - inace gateway
 * prekine vezu pre nego sto orchestrator stigne da odgovori.
 */
const V1_TIMEOUT_MS = Number(process.env.V1_TIMEOUT_MS) || 45000;

/**
 * /v1/* se prosledjuje kakav jeste: JWT je opcion (gost sme da planira),
 * pa gateway ne proverava token - to radi orchestrator.
 */
const prosledi = async (req, res, metod) => {
  const requestId = req.headers['x-request-id'] || `req_${crypto.randomBytes(6).toString('hex')}`;

  const zaglavlja = { 'X-Request-ID': requestId };

  if (req.headers.authorization) zaglavlja.Authorization = req.headers.authorization;
  if (req.headers['x-save-trip']) zaglavlja['X-Save-Trip'] = req.headers['x-save-trip'];
  if (req.headers['x-trip-id']) zaglavlja['X-Trip-ID'] = req.headers['x-trip-id'];
  // Otisak gostujuce sesije za statistiku popularnih destinacija (§4.1)
  if (req.headers['x-session-id']) zaglavlja['X-Session-Id'] = req.headers['x-session-id'];

  try {
    const response = await axios({
      method: metod,
      url: `${ORCHESTRATOR_URL}/v1${req.path}`,
      data: metod === 'get' ? undefined : req.body,
      params: req.query,
      headers: zaglavlja,
      timeout: V1_TIMEOUT_MS
    });

    res.set('X-Request-ID', requestId);
    res.status(response.status).json(response.data);
  } catch (err) {
    res.set('X-Request-ID', requestId);

    // /v1 ima bogatiji oblik greske (npr. lista `errors` iz validacije) -
    // telo se prosledjuje netaknuto umesto da se prepakuje.
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }

    proxyError(res, err, 'ORCHESTRATOR_ERROR', 'Greska pri planiranju putovanja');
  }
};

// Koraci carobnjaka (spec §4.2): parametri -> let -> smestaj -> plan
router.get('/preferences/schema', (req, res) => prosledi(req, res, 'get'));
router.get('/flights', (req, res) => prosledi(req, res, 'get'));
router.get('/accommodations', (req, res) => prosledi(req, res, 'get'));
router.get('/attractions', (req, res) => prosledi(req, res, 'get'));

router.post('/plan', (req, res) => prosledi(req, res, 'post'));
router.post('/plan/:sessionId/save', (req, res) => prosledi(req, res, 'post'));
router.get('/plan/:sessionId', (req, res) => prosledi(req, res, 'get'));
// Izmena plana (spec §4.6) - orchestrator proverava prijavu i vlasnistvo
router.get('/trips/:id', (req, res) => prosledi(req, res, 'get'));
router.post('/trips/:id/days/preview', (req, res) => prosledi(req, res, 'post'));
router.put('/trips/:id/days', (req, res) => prosledi(req, res, 'put'));
router.post('/trips/:id/days/:day/optimize', (req, res) => prosledi(req, res, 'post'));
router.post('/trips/:id/regenerate', (req, res) => prosledi(req, res, 'post'));

// Rezervacija leta (spec §4.8): osvezavanje istekle ponude i zamena leta
router.post('/trips/:id/flight/refresh', (req, res) => prosledi(req, res, 'post'));
router.put('/trips/:id/flight', (req, res) => prosledi(req, res, 'put'));

// Destinacije za pocetnu stranu (spec §4.1) - javno
router.get('/destinations/featured', (req, res) => prosledi(req, res, 'get'));
router.get('/destinations/popular', (req, res) => prosledi(req, res, 'get'));

// Gradovi (spec §4.2) - javno
router.get('/cities', (req, res) => prosledi(req, res, 'get'));
// Ispred `/cities/:id`, inace bi "by-iata" bilo procitano kao identifikator
router.get('/cities/by-iata/:kod', (req, res) => prosledi(req, res, 'get'));
router.get('/cities/:id', (req, res) => prosledi(req, res, 'get'));

router.get('/health', (req, res) => prosledi(req, res, 'get'));
router.get('/stats', (req, res) => prosledi(req, res, 'get'));

module.exports = router;
