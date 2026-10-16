const express = require('express');
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');
const { proxyConfig, proxyError } = require('../utils/proxy');

const router = express.Router();
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL || 'http://localhost:4005';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4007';

/**
 * Sve admin rute su zasticene i na gateway-u (validan JWT) i na
 * Admin Service-u (JWT + uloga === 'admin'). Gateway ne proverava
 * ulogu - to je odluka Admin Service-a.
 */

// GET /api/admin/users
router.get('/users', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(`${ADMIN_SERVICE_URL}/api/admin/users`, proxyConfig(req));
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'ADMIN_SERVICE_ERROR', 'Greska pri preuzimanju korisnika');
  }
});

// PATCH /api/admin/users/:userId/status
router.patch('/users/:userId/status', verifyToken, async (req, res) => {
  try {
    const response = await axios.patch(
      `${ADMIN_SERVICE_URL}/api/admin/users/${req.params.userId}/status`,
      req.body,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'ADMIN_SERVICE_ERROR', 'Greska pri promeni statusa');
  }
});

// PATCH /api/admin/users/:userId/role
router.patch('/users/:userId/role', verifyToken, async (req, res) => {
  try {
    const response = await axios.patch(
      `${ADMIN_SERVICE_URL}/api/admin/users/${req.params.userId}/role`,
      req.body,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'ADMIN_SERVICE_ERROR', 'Greska pri promeni uloge');
  }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', verifyToken, async (req, res) => {
  try {
    const response = await axios.delete(
      `${ADMIN_SERVICE_URL}/api/admin/users/${req.params.userId}`,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'ADMIN_SERVICE_ERROR', 'Greska pri brisanju korisnika');
  }
});

// GET /api/admin/stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(`${ADMIN_SERVICE_URL}/api/admin/stats`, proxyConfig(req));
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'ADMIN_SERVICE_ERROR', 'Greska pri preuzimanju statistike');
  }
});

// GET /api/admin/logs/statistics - PRE /logs, da ne bude protumaceno kao filter
router.get('/logs/statistics', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(
      `${ADMIN_SERVICE_URL}/api/admin/logs/statistics`,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'ADMIN_SERVICE_ERROR', 'Greska pri preuzimanju statistike logova');
  }
});

// GET /api/admin/logs
router.get('/logs', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(`${ADMIN_SERVICE_URL}/api/admin/logs`, proxyConfig(req));
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'ADMIN_SERVICE_ERROR', 'Greska pri preuzimanju logova');
  }
});

/**
 * Sadrzaj koji uredjuje administrator (spec §3.3): destinacije,
 * atrakcije i kategorije interesovanja.
 *
 * Putanje se navode POJEDINACNO, a ne kao otvoreni proxy: gateway tako
 * ostaje spisak onoga sto sistem zaista izlaze, pa nova interna ruta ne
 * postane javna slucajno.
 */
const prosledi = (metod, putanja, opis) => {
  router[metod](putanja, verifyToken, async (req, res) => {
    try {
      const cilj = `${ADMIN_SERVICE_URL}/api/admin${req.path}`;
      const config = proxyConfig(req);

      const response =
        metod === 'get' || metod === 'delete'
          ? await axios[metod](cilj, config)
          : await axios[metod](cilj, req.body, config);

      res.status(response.status).json(response.data);
    } catch (err) {
      proxyError(res, err, 'ADMIN_SERVICE_ERROR', opis);
    }
  });
};

// Kategorije interesovanja
prosledi('get', '/categories', 'Greska pri preuzimanju kategorija');
prosledi('post', '/categories', 'Greska pri kreiranju kategorije');
prosledi('get', '/categories/:kljuc', 'Greska pri preuzimanju kategorije');
prosledi('patch', '/categories/:kljuc', 'Greska pri izmeni kategorije');
prosledi('delete', '/categories/:kljuc', 'Greska pri gasenju kategorije');

// Atrakcije administratora
prosledi('get', '/attractions', 'Greska pri preuzimanju atrakcija');
prosledi('post', '/attractions', 'Greska pri kreiranju atrakcije');
prosledi('get', '/attractions/:id', 'Greska pri preuzimanju atrakcije');
prosledi('patch', '/attractions/:id', 'Greska pri izmeni atrakcije');
prosledi('delete', '/attractions/:id', 'Greska pri gasenju atrakcije');

// Istaknute destinacije - `/order` PRE `/:id`
prosledi('get', '/destinations', 'Greska pri preuzimanju destinacija');
prosledi('post', '/destinations', 'Greska pri kreiranju destinacije');
prosledi('patch', '/destinations/order', 'Greska pri promeni redosleda');
prosledi('patch', '/destinations/:id', 'Greska pri izmeni destinacije');
prosledi('delete', '/destinations/:id', 'Greska pri brisanju destinacije');

// GET /api/admin/notifications - sve notifikacije u sistemu (Notification Service)
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(
      `${NOTIFICATION_SERVICE_URL}/api/admin/notifications`,
      proxyConfig(req)
    );
    res.json(response.data);
  } catch (err) {
    proxyError(res, err, 'NOTIFICATION_SERVICE_ERROR', 'Greska pri preuzimanju notifikacija');
  }
});

module.exports = router;
