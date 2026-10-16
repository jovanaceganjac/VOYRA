const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const tripsRouter = require('./routes/trips');
const internalRouter = require('./routes/internal');
const citiesRouter = require('./routes/cities');
const kategorijeRouter = require('./routes/kategorije');
const atrakcijeRouter = require('./routes/atrakcije');
const destinacijeRouter = require('./routes/destinacije');
const { pokreniPosao } = require('./services/ZavrsenaPutovanja');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.TRIP_SERVICE_PORT || 4002;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'TRIP_SERVICE' });

// Logger middleware
app.use((req, res, next) => {
  console.log(`[TRIP_SERVICE] ${req.method.toUpperCase()} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'trip-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Welcome ruta
app.get('/', (req, res) => {
  res.json({
    message: 'Voyra Trip Service - cuvanje i upravljanje putovanjima',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      planTrip: 'POST /api/trips/plan  (javno)',
      saveTrip: 'POST /api/trips  (JWT)',
      getTrips: 'GET /api/trips  (JWT)',
      getTrip: 'GET /api/trips/:id  (JWT)',
      updateTrip: 'PUT /api/trips/:id  (JWT)',
      deleteTrip: 'DELETE /api/trips/:id  (JWT)'
    }
  });
});

// Rute
app.use('/api/trips', tripsRouter);
// Interne rute nisu pod /api - gateway ih ne prosledjuje spolja
// Referentni podaci o gradovima (spec §4.2) - javno
app.use('/api/cities', citiesRouter);

app.use('/internal', internalRouter);
// Sadrzaj koji uredjuje administrator (spec §3.3) - samo interno
app.use('/internal/categories', kategorijeRouter);
app.use('/internal/attractions', atrakcijeRouter);
app.use('/internal/destinations', destinacijeRouter);

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
  console.error('[TRIP_SERVICE] Error:', err.message);

  // Greske sa poznatim kodom (NOT_FOUND, INVALID_ID, SERVICE_UNAVAILABLE...)
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'ERROR',
      message: err.message,
      /*
       * Dodatna polja koja je servis prikacio uz gresku: lista `errors`
       * iz validacije, `udaljenostKm` kod atrakcije van dometa... Bez
       * njih bi klijent dobio samo recenicu, a ne i podatke iz kojih
       * moze da sastavi korisnu poruku.
       */
      ...(err.dodatno || {}),
      statusCode: err.statusCode
    });
  }

  // Mongoose validacija seme
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: Object.values(err.errors).map((e) => e.message),
      statusCode: 400
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ID',
      message: 'Neispravan format ID-a',
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
      console.error('[TRIP_SERVICE] Konekcija na MongoDB neuspesna. Gasim servis.');
      process.exit(1);
    }

    // Spec §4.9: putovanje posle datuma povratka prelazi u ZAVRSENO
    pokreniPosao();

    app.listen(PORT, () => {
      console.log(`[TRIP_SERVICE] Server running on port ${PORT}`);
      console.log(`[TRIP_SERVICE] Health check: http://localhost:${PORT}/health`);
    });
  })();
}

/*
 * Aplikacija se izvozi da bi provera pokrivenosti OpenAPI seme
 * (`npm run proba:openapi`) mogla da procita registrovane rute iz
 * Express rutera. Server se pokrece samo kada se fajl pokrene direktno.
 */
module.exports = app;
