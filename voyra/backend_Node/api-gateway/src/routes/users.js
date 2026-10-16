const express = require('express');
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');
const { proxyConfig, proxyError } = require('../utils/proxy');

const router = express.Router();
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:4001';

// POST /api/users/register - JAVNO (bez JWT)
router.post('/register', async (req, res) => {
  try {
    const response = await axios.post(
      `${USER_SERVICE_URL}/api/users/register`,
      req.body,
      proxyConfig(req)
    );
    res.status(response.status || 201).json(response.data);
  } catch (err) {
    proxyError(res, err, 'USER_SERVICE_ERROR', 'Greska pri registraciji');
  }
});

// POST /api/users/login - JAVNO (bez JWT)
router.post('/login', async (req, res) => {
  try {
    const response = await axios.post(
      `${USER_SERVICE_URL}/api/users/login`,
      req.body,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'USER_SERVICE_ERROR', 'Greska pri prijavi');
  }
});

// GET /api/users/profile - ZASTICENO (sa JWT)
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(
      `${USER_SERVICE_URL}/api/users/profile`,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'USER_SERVICE_ERROR', 'Greska pri preuzimanju profila');
  }
});

// --- Profil i telefon (sve zasticeno) ---

const prosledi = (metod, putanja, saTelom = false) =>
  router[metod](putanja, verifyToken, async (req, res) => {
    const cilj = `${USER_SERVICE_URL}/api/users${req.path}`;

    try {
      const response = saTelom
        ? await axios[metod](cilj, req.body, proxyConfig(req))
        : await axios[metod](cilj, proxyConfig(req));

      res.status(response.status).json(response.data);
    } catch (err) {
      proxyError(res, err, 'USER_SERVICE_ERROR', 'Greska pri radu sa profilom');
    }
  });

prosledi('get', '/me');
prosledi('put', '/me', true);
// Promena lozinke (spec §4.10) - odgovor nosi nov token za ovu sesiju
prosledi('put', '/me/password', true);
prosledi('patch', '/me/sms-preference', true);

module.exports = router;
