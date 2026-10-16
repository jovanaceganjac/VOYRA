const express = require('express');
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');
const { proxyConfig, proxyError } = require('../utils/proxy');

const router = express.Router();
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4007';

/**
 * Notifikacije korisnika. Ruta /send nije izlozena kroz gateway -
 * to je poziv servis-servis, ne nesto sto klijent sme da pokrene.
 */
const prosledi = (metod, putanja, saTelom = false) =>
  router[metod](putanja, verifyToken, async (req, res) => {
    const cilj = `${NOTIFICATION_SERVICE_URL}/api/notifications${req.path}`;

    try {
      const response = saTelom
        ? await axios[metod](cilj, req.body, proxyConfig(req))
        : await axios[metod](cilj, proxyConfig(req));

      res.status(response.status).json(response.data);
    } catch (err) {
      proxyError(res, err, 'NOTIFICATION_SERVICE_ERROR', 'Greska pri radu sa notifikacijama');
    }
  });

prosledi('get', '/stats');
prosledi('get', '/');
prosledi('post', '/:id/retry', true);
prosledi('patch', '/:id/cancel', true);
prosledi('get', '/:id');

module.exports = router;
