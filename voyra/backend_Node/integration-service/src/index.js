const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const { uskladiTtlIndekse } = require('./config/ttlIndeksi');
const integrationRouter = require('./routes/integration');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.INTEGRATION_SERVICE_PORT || 4003;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'INTEGRATION_SERVICE' });

// Logger middleware
app.use((req, res, next) => {
  // X-Request-ID prati jedan zahtev kroz logove svih servisa
  req.requestId = req.headers['x-request-id'] || null;
  if (req.requestId) res.set('X-Request-ID', req.requestId);

  const oznaka = req.requestId ? ` (${req.requestId})` : '';
  console.log(`[INTEGRATION_SERVICE] ${req.method.toUpperCase()} ${req.path}${oznaka}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'integration-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Welcome ruta
app.get('/', (req, res) => {
  res.json({
    message: 'Voyra Integration Service - adapteri ka spoljnim servisima, kes',
    version: '2.0.0',
    izvori: {
      letovi: 'Duffel',
      smestaj: 'LiteAPI',
      atrakcije: 'OpenTripMap',
      kurs: 'Frankfurter (ECB)',
      geokodiranje: 'Nominatim (OSM)'
    },
    endpoints: {
      health: 'GET /health',
      flights: 'GET /flights?from&to&checkIn&checkOut&passengers',
      accommodations: 'GET /accommodations?city&checkIn&checkOut&guests',
      attractions: 'GET /attractions?city',
      exchangeRates: 'GET /exchange-rates?from&to',
      geocode: 'GET /geocode?city',
      clearCache: 'POST /cache/clear',
      internal: [
        'GET /internal/flights/offers/:offerId',
        'POST /internal/flights/orders',
        'POST /internal/flights/orders/:orderId/cancel'
      ]
    }
  });
});

// Rute: /api/integration/* je putanja koju koristi API Gateway.
// Isti ruter je montiran i na korenu radi direktnog testiranja servisa.
// Sve rute su JAVNE - Integration Service nema JWT proveru.
app.use('/api/integration', integrationRouter);
app.use('/', integrationRouter);

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
  console.error('[INTEGRATION_SERVICE] Error:', err.message);

  // Adapteri sami postavljaju statusCode za slucajeve koje pozivalac
  // mora da razlikuje: istekla ponuda (410), previse putnika (422)...
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'ERROR',
      message: err.message,
      statusCode: err.statusCode
    });
  }

  // Mock fajl nedostaje ili je neispravan
  if (err.code === 'DATA_SOURCE_UNAVAILABLE') {
    return res.status(500).json({
      success: false,
      error: 'DATA_SOURCE_UNAVAILABLE',
      message: 'Data source unavailable',
      statusCode: 500
    });
  }

  // Adapter je odbio zahtev zbog nedostajucih parametara
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: err.message,
      statusCode: 400
    });
  }

  // Trazena valuta nije u tabeli kurseva
  if (err.code === 'UNSUPPORTED_CURRENCY') {
    return res.status(400).json({
      success: false,
      error: 'UNSUPPORTED_CURRENCY',
      message: err.message,
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
      console.error('[INTEGRATION_SERVICE] Konekcija na MongoDB neuspesna. Gasim servis.');
      process.exit(1);
    }

    // TTL vrednosti iz specifikacije vaze tek kada se postojeci indeksi
    // izmene - kreiranje modela ne dira indeks koji vec postoji
    await uskladiTtlIndekse();

    app.listen(PORT, () => {
      console.log(`[INTEGRATION_SERVICE] Server running on port ${PORT}`);
      console.log(`[INTEGRATION_SERVICE] Health check: http://localhost:${PORT}/health`);
    });
  })();
}

/*
 * Aplikacija se izvozi da bi provera pokrivenosti OpenAPI seme
 * (`npm run proba:openapi`) mogla da procita registrovane rute iz
 * Express rutera. Server se pokrece samo kada se fajl pokrene direktno.
 */
module.exports = app;
