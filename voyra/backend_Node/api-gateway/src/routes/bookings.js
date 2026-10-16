const express = require('express');
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');
const { proxyConfig, proxyError } = require('../utils/proxy');

const router = express.Router();
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:4006';

const prosledi = (metod, putanja, saTelom = false) =>
  router[metod](putanja, verifyToken, async (req, res) => {
    const cilj = `${BOOKING_SERVICE_URL}/api/bookings${req.path}`;

    try {
      const response = saTelom
        ? await axios[metod](cilj, req.body, proxyConfig(req))
        : await axios[metod](cilj, proxyConfig(req));

      res.status(response.status).json(response.data);
    } catch (err) {
      proxyError(res, err, 'BOOKING_SERVICE_ERROR', 'Greska pri rezervaciji');
    }
  });

// Tok po spec §4.8: provera ponude -> kreiranje -> otkazivanje.
// Ruta za placanje vise ne postoji ("bez stvarne kupovine i naplate").
prosledi('post', '/validate', true);
prosledi('post', '/', true);
prosledi('get', '/');
prosledi('patch', '/:id/cancel', true);
prosledi('get', '/:id');

// PDF se prosledjuje kao binarni tok, ne kao JSON
router.get('/:id/confirmation', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(
      `${BOOKING_SERVICE_URL}/api/bookings/${req.params.id}/confirmation`,
      { ...proxyConfig(req), responseType: 'arraybuffer' }
    );

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${req.params.id}.pdf"`);
    res.send(response.data);
  } catch (err) {
    proxyError(res, err, 'BOOKING_SERVICE_ERROR', 'Greska pri preuzimanju potvrde');
  }
});

module.exports = router;
