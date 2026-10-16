const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const bookingsRouter = require('./routes/bookings');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.BOOKING_SERVICE_PORT || process.env.BOOKING_PORT || 4006;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'BOOKING_SERVICE' });
app.set('trust proxy', true);

// Logger middleware
app.use((req, res, next) => {
  console.log(`[BOOKING_SERVICE] ${req.method.toUpperCase()} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'booking-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Welcome ruta
app.get('/', (req, res) => {
  res.json({
    message: 'Voyra Booking Service - rezervacija letova i smestaja',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      validate: 'POST /api/bookings/validate  (JWT)',
      create: 'POST /api/bookings  (JWT)',
      list: 'GET /api/bookings  (JWT)',
      get: 'GET /api/bookings/:id  (JWT)',
      pay: 'POST /api/bookings/:id/pay  (JWT)',
      confirm: 'POST /api/bookings/:id/confirm  (JWT)',
      cancel: 'PATCH /api/bookings/:id/cancel  (JWT)',
      confirmation: 'GET /api/bookings/:id/confirmation  (JWT, PDF)'
    }
  });
});

app.use('/api/bookings', bookingsRouter);

// 404 middleware
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `${req.method} ${req.path} nije pronadjen`,
    statusCode: 404
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[BOOKING_SERVICE] Error:', err.message);

  // Greske sa poznatim statusom (404, 403, 409, 410, PAYMENT_FAILED...)
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'BOOKING_ERROR',
      message: err.message,
      // Lista gresaka o putnicima (§4.8 t.3) i sazetak leta uz 410 idu
      // uz odgovor - bez njih klijent ne moze da pokaze sta da se popravi
      ...(err.errors ? { errors: err.errors } : {}),
      ...(err.flight ? { flight: err.flight, explicit: err.explicit ?? null } : {}),
      statusCode: err.statusCode
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: Object.values(err.errors).map((e) => e.message),
      statusCode: 400
    });
  }

  res.status(500).json({
    success: false,
    error: 'SERVER_ERROR',
    message: err.message,
    statusCode: 500
  });
});

// Start servera - tek nakon uspesne konekcije na bazu
/* Server se pokrece samo kada je fajl pokrenut direktno (vidi izvoz nize). */
if (require.main === module) {
  (async () => {
    const connected = await connectDB();

    if (!connected) {
      console.error('[BOOKING_SERVICE] Konekcija na MongoDB neuspesna. Gasim servis.');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`[BOOKING_SERVICE] Server running on port ${PORT}`);
      console.log(`[BOOKING_SERVICE] Health check: http://localhost:${PORT}/health`);
    });
  })();
}

/*
 * Aplikacija se izvozi da bi provera pokrivenosti OpenAPI seme
 * (`npm run proba:openapi`) mogla da procita registrovane rute iz
 * Express rutera. Server se pokrece samo kada se fajl pokrene direktno.
 */
module.exports = app;
