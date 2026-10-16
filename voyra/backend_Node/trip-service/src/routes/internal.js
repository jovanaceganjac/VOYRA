const express = require('express');
const { verifyInternalKey } = require('../middleware/internalKey');
const TripService = require('../services/TripService');
const DestinacijeService = require('../services/DestinacijeService');
const { STATUSI } = require('../models/Trip');

const router = express.Router();
const tripService = new TripService();
const destinacije = new DestinacijeService();

/**
 * PATCH /internal/trips/:id/status
 *
 * Status putovanja menja Booking Service kada rezervise ili otkaze let
 * (spec §4.9). Ruta je interna jer korisnik ne sme sam da proglasi
 * putovanje rezervisanim - to zavisi od stvarne rezervacije kod
 * avio-kompanije, koju zna samo Booking Service.
 */
router.patch('/trips/:id/status', verifyInternalKey, async (req, res, next) => {
  const { status, bookingInfo } = req.body || {};

  if (!STATUSI.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: `Neispravan status. Dozvoljeni: ${STATUSI.join(', ')}`,
      statusCode: 400
    });
  }

  try {
    const { trip, promenjen } = await tripService.promeniStatus(req.params.id, status, {
      bookingInfo
    });

    res.json({ success: true, data: trip, promenjen, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /internal/search-stats   telo: { gradId, vrsta, userId, sessionId }
 *
 * Belezi pretragu ili sacuvan plan po gradu odredista (spec §4.1).
 * Orchestrator zove "posalji i zaboravi", pa ruta nikad ne baca gresku
 * dalje - statistika ne sme da obori planiranje.
 */
router.post('/search-stats', verifyInternalKey, async (req, res) => {
  const { gradId, vrsta, userId, sessionId } = req.body || {};

  try {
    const r = await destinacije.zabelezi({ gradId, vrsta, userId, sessionId });

    res.json({ success: true, ...r, statusCode: 200 });
  } catch (err) {
    console.error('[TRIP_SERVICE] Statistika pretrage nije zabelezena:', err.message);
    res.json({ success: false, zabelezeno: false, statusCode: 200 });
  }
});

module.exports = router;
