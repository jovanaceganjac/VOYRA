const express = require('express');
const { verifyToken, optionalToken } = require('../middleware/auth');
const { verifyInternalAdmin } = require('../middleware/internalAdmin');
const TripService = require('../services/TripService');
const Trip = require('../models/Trip');

const router = express.Router();
const tripService = new TripService();

/**
 * GET /api/trips/all - INTERNO (Admin Service)
 * Sva putovanja svih korisnika. Stoji PRE /:id, inace bi "all" bio
 * protumacen kao ID putovanja.
 */
router.get('/all', verifyInternalAdmin, async (req, res, next) => {
  try {
    const { status, userId } = req.query;

    const upit = {};
    if (status) upit.status = status;
    if (userId) upit.userId = userId;

    const trips = await Trip.find(upit).sort({ createdAt: -1 }).limit(500);

    res.json({ success: true, data: trips, count: trips.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trips/plan - JAVNO
 * Gost dobija plan bez cuvanja; prijavljenom korisniku se cuva kao draft.
 */
router.post('/plan', optionalToken, async (req, res, next) => {
  try {
    const { from, to, date, checkIn, checkOut, passengers, guests, budget, title, description } = req.body;

    const obavezni = { from, to, date, checkIn, checkOut, budget };
    const nedostaju = Object.keys(obavezni).filter((k) => !obavezni[k]);

    if (nedostaju.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Missing: ${nedostaju.join(', ')}`,
        statusCode: 400
      });
    }

    const userId = req.user?.id || null;

    const rezultat = await tripService.planTrip(
      { from, to, date, checkIn, checkOut, passengers, guests, budget, title, description },
      userId
    );

    res.json({
      success: true,
      data: rezultat.trip,
      saved: rezultat.saved,
      source: rezultat.source,
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trips - ZASTICENO
 * Cuva vec generisan plan (npr. gost se u medjuvremenu prijavio).
 */
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const { title, from, to, description, itinerary, date, checkIn, checkOut, passengers, guests, budget, preferences, fromCity, toCity } = req.body;

    if (!itinerary || !itinerary.flights) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Missing itinerary data',
        statusCode: 400
      });
    }

    const dani = itinerary.itinerary || [];
    const prviDan = dani[0]?.date;
    const poslednjiDan = dani[dani.length - 1]?.date;

    const trip = await Trip.create({
      userId: req.user.id,
      title: title || `${from} -> ${to}`,
      description,
      from,
      to,
      date: date || prviDan,
      checkIn: checkIn || prviDan,
      checkOut: checkOut || poslednjiDan,
      passengers: passengers || 1,
      guests: guests || 1,
      budget: budget ?? itinerary.totalBudget?.total ?? 0,
      fromCity: fromCity ?? null,
      toCity: toCity ?? null,
      preferences,
      itinerary,
      status: 'NACRT'
    });

    res.status(201).json({ success: true, data: trip, statusCode: 201 });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips - ZASTICENO (sva putovanja korisnika)
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    const trips = await tripService.getUserTrips(req.user.id, { status, from, to });

    res.json({ success: true, data: trips, count: trips.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id - ZASTICENO
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const trip = await tripService.getTrip(req.params.id, req.user.id);
    res.json({ success: true, data: trip, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// PUT /api/trips/:id - ZASTICENO
router.put('/:id', verifyToken, async (req, res, next) => {
  try {
    // `version` je uslov, a ne podatak koji se cuva
    const trip = await tripService.saveTrip(req.params.id, req.user.id, req.body, {
      version: req.body?.version || null
    });

    res.json({ success: true, data: trip, statusCode: 200 });
  } catch (err) {
    // Telo konflikta nosi i trenutnu verziju, da klijent moze da ponudi
    // "ucitaj novu verziju" bez dodatnog zahteva
    if (err.code === 'VERSION_CONFLICT') {
      return res.status(409).json({
        success: false,
        error: 'VERSION_CONFLICT',
        message: err.message,
        statusCode: 409,
        currentVersion: err.currentVersion
      });
    }

    next(err);
  }
});

/**
 * PATCH /api/trips/:id/cancel - ZASTICENO (spec §4.9)
 *
 * Otkazuje putovanje. Ako postoji rezervacija leta, prvo se otkazuje
 * ona - putovanje ne sme da bude OTKAZANO dok je let jos rezervisan.
 * Smestaj korisnik otkazuje sam na Booking.com-u.
 */
router.patch('/:id/cancel', verifyToken, async (req, res, next) => {
  try {
    const rezultat = await tripService.otkaziPutovanje(req.params.id, req.user.id, req.token);
    res.json({ success: true, ...rezultat, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/trips/:id - ZASTICENO
router.delete('/:id', verifyToken, async (req, res, next) => {
  try {
    const trip = await tripService.deleteTrip(req.params.id, req.user.id);
    res.json({ success: true, data: { deletedId: trip._id }, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
