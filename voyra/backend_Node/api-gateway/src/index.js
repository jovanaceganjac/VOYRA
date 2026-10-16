const express = require('express');
const cors = require('cors');
require('dotenv').config();

const usersRouter = require('./routes/users');
const tripsRouter = require('./routes/trips');
const adminRouter = require('./routes/admin');
const bookingsRouter = require('./routes/bookings');
const notificationsRouter = require('./routes/notifications');
const v1Router = require('./routes/v1');
const { opozivTokena } = require('./middleware/opozivTokena');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.GATEWAY_PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'API_GATEWAY' });

// Logger middleware
app.use((req, res, next) => {
  console.log(`[API_GATEWAY] ${req.method.toUpperCase()} ${req.path}`);
  next();
});

/*
 * Opoziv tokena - PRE svih ruta, da vazi i za javne rute
 * na kojima je token opcion. `/health` je iznad, pa ostaje dostupan i
 * kada User Service ne odgovara: monitoring ne sme da zavisi od njega.
 */
// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'api-gateway',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Welcome ruta
app.get('/', (req, res) => {
  res.json({
    message: 'Voyra API Gateway - ulazna tacka sistema',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      register: 'POST /api/users/register  (javno)',
      login: 'POST /api/users/login  (javno)',
      profile: 'GET /api/users/profile  (JWT)',
      plan: 'POST /api/trips/plan  (javno)',
      saveTrip: 'POST /api/trips  (JWT)',
      trips: 'GET /api/trips  (JWT)',
      trip: 'GET /api/trips/:id  (JWT)',
      admin: '/api/admin/*  (JWT + admin)',
      bookings: '/api/bookings/*  (JWT)',
      notifications: '/api/notifications/*  (JWT)',
      v1: '/v1/plan, /v1/trips, /v1/health, /v1/stats  (jedinstveni API)'
    }
  });
});

// Proxy rute ka mikroservisima
app.use(opozivTokena);

app.use('/api/users', usersRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/notifications', notificationsRouter);

// Jedinstveni /v1 API (orchestrator) - JWT opcion, proverava ga orchestrator
app.use('/v1', v1Router);

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
  console.error('[API_GATEWAY] Error:', err);
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
    console.log(`[API_GATEWAY] Server running on port ${PORT}`);
    console.log(`[API_GATEWAY] Health check: http://localhost:${PORT}/health`);
  });
}

/*
 * Aplikacija se izvozi da bi provera pokrivenosti OpenAPI seme
 * (`npm run proba:openapi`) mogla da procita registrovane rute iz
 * Express rutera. Server se pokrece samo kada se fajl pokrene direktno.
 */
module.exports = app;
