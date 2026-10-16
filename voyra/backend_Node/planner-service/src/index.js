const express = require('express');
const cors = require('cors');
require('dotenv').config();

const plannerRouter = require('./routes/planner');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.PLANNER_SERVICE_PORT || process.env.PLANNER_PORT || 4004;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'PLANNER_SERVICE' });

// Logger middleware
app.use((req, res, next) => {
  // X-Request-ID prati jedan zahtev kroz logove svih servisa
  req.requestId = req.headers['x-request-id'] || null;
  if (req.requestId) res.set('X-Request-ID', req.requestId);

  const oznaka = req.requestId ? ` (${req.requestId})` : '';
  console.log(`[PLANNER_SERVICE] ${req.method.toUpperCase()} ${req.path}${oznaka}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'planner-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Welcome ruta
app.get('/', (req, res) => {
  res.json({
    message: 'Voyra Planner Service - algoritam planiranja (stateless)',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      plan: 'POST /api/planner/plan  (let -> smestaj -> atrakcije po danima)'
    }
  });
});

// Rute: /api/planner/* je putanja koju koristi Trip Service.
// Isti ruter je montiran i na korenu radi direktnog testiranja servisa.
app.use('/api/planner', plannerRouter);
app.use('/', plannerRouter);

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
  // Faze same postavljaju statusCode za slucajeve koje pozivalac mora da
  // razlikuje: istekao izbor (410), neispravne preferencije (400)...
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'PLANNER_ERROR',
      message: err.message,
      statusCode: err.statusCode,
      ...(err.errors ? { errors: err.errors } : {}),
      // Sta je isteklo (let ili smestaj) - klijent vodi na tacan korak
      ...(err.selection ? { selection: err.selection } : {})
    });
  }

  console.error('[PLANNER_SERVICE] Error:', err);
  res.status(500).json({
    success: false,
    error: 'SERVER_ERROR',
    message: err.message,
    statusCode: 500
  });
});

/* Server se pokrece samo kada je fajl pokrenut direktno (vidi izvoz nize). */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[PLANNER_SERVICE] Server running on port ${PORT}`);
    console.log(`[PLANNER_SERVICE] Health check: http://localhost:${PORT}/health`);
    console.log(`[PLANNER_SERVICE] Algoritam: rangiranje -> selekcija -> klasterovanje (k-means) -> optimizacija (2-opt)`);
  });
}

/*
 * Aplikacija se izvozi da bi provera pokrivenosti OpenAPI seme
 * (`npm run proba:openapi`) mogla da procita registrovane rute iz
 * Express rutera. Server se pokrece samo kada se fajl pokrene direktno.
 */
module.exports = app;
