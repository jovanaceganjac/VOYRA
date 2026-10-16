const express = require('express');
const { verifyToken } = require('../middleware/auth');
const BookingService = require('../services/BookingService');
const ConfirmationService = require('../services/ConfirmationService');

const router = express.Router();
const bookingService = new BookingService();
const confirmationService = new ConfirmationService();

// Sve booking rute zahtevaju prijavljenog korisnika
router.use(verifyToken);

/**
 * KORAK 1 - POST /api/bookings/validate (spec §4.8 t.2)
 *
 * Ponovo proverava ponudu pred rezervaciju. Istekla ponuda vraca 410,
 * a promenjena cena 200 sa `priceChanged: true` - korisnik tada mora
 * da potvrdi novu cenu.
 */
router.post('/validate', async (req, res, next) => {
  try {
    const rezultat = await bookingService.validate(
      { tripId: req.body?.tripId, offerId: req.body?.offerId },
      req.user,
      req.token,
      req.requestId
    );

    res.json({ success: true, ...rezultat, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

/**
 * KORAK 2 - POST /api/bookings (spec §4.8 t.3 i t.4)
 *
 * Telo: { tripId, offerId?, passengers[], acceptedPrice }
 * `acceptedPrice` mora da odgovara trenutnoj ceni, inace 409.
 */
router.post('/', async (req, res, next) => {
  try {
    const { booking, warnings, tripStatus } = await bookingService.create(
      req.body,
      req.user,
      req.token,
      req.requestId
    );

    res.status(201).json({
      success: true,
      bookingId: booking.bookingId,
      status: booking.status,
      bookingReference: booking.flights[0]?.bookingReference || null,
      totalPrice: booking.totalPrice,
      currency: booking.currency,
      confirmationPdf: booking.confirmations?.flight_pdf_url || null,
      emailSent: booking.confirmations?.email_sent || false,
      // Status putovanja posle rezervacije (spec §4.8 t.4)
      tripStatus,
      bookingDate: booking.createdAt,
      warnings,
      statusCode: 201
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings - rezervacije korisnika; `?tripId=` za jedno putovanje
router.get('/', async (req, res, next) => {
  try {
    const bookings = await bookingService.getUserBookings(req.user.id, {
      status: req.query.status,
      tripId: req.query.tripId
    });

    res.json({ success: true, data: bookings, count: bookings.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/:id
router.get('/:id', async (req, res, next) => {
  try {
    const booking = await bookingService.getBooking(req.params.id, req.user.id);
    res.json({ success: true, data: booking, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/:id/confirmation - PDF potvrda (samo let)
router.get('/:id/confirmation', async (req, res, next) => {
  try {
    const booking = await bookingService.getBooking(req.params.id, req.user.id);

    let putanja = confirmationService.putanjaPdf(booking.bookingId);

    // Ako PDF jos ne postoji (npr. servis restartovan), generisi ga sada
    if (!putanja) {
      if (booking.status !== 'CONFIRMED') {
        return res.status(409).json({
          success: false,
          error: 'INVALID_STATE',
          message: 'Potvrda postoji tek za potvrdjenu rezervaciju',
          statusCode: 409
        });
      }

      const pdf = await confirmationService.generatePdf(booking);
      putanja = pdf.putanja;
    }

    res.download(putanja, `${booking.bookingId}.pdf`);
  } catch (err) {
    next(err);
  }
});

/**
 * KORAK 3 - PATCH /api/bookings/:id/cancel (spec §4.9)
 *
 * Otkazuje rezervaciju kod avio-kompanije i prevodi putovanje u
 * OTKAZANO. Ako avio-kompanija ne potvrdi otkazivanje, status ostaje
 * nepromenjen i vraca se greska.
 */
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const booking = await bookingService.getBooking(req.params.id, req.user.id);
    const r = await bookingService.cancel(booking, req.body?.reason, req.requestId);

    res.json({
      success: true,
      bookingId: r.booking.bookingId,
      status: r.booking.status,
      warnings: r.warnings,
      message: r.alreadyCancelled ? 'Already cancelled' : undefined,
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
