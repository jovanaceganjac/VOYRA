const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const connectDB = require('./config/database');
const { proveriKonfiguraciju } = require('./config/serviceRegistry');
const { errorHandler } = require('./middleware/errorHandler');
const ServiceHealthMonitor = require('./services/ServiceHealthMonitor');
const v1Router = require('./routes/v1');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.ORCHESTRATOR_PORT || 4008;

app.use(cors())

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'ORCHESTRATOR_SERVICE' });;
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', true);

/**
 * X-Request-ID prati jedan zahtev kroz logove svih servisa.
 * Gateway ga salje; ako nije stigao, generise se ovde.
 */
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || `req_${crypto.randomBytes(6).toString('hex')}`;
  res.set('X-Request-ID', req.requestId);

  console.log(`[ORCHESTRATOR] ${req.method.toUpperCase()} ${req.path} (${req.requestId})`);
  next();
});

// Sopstveni health - odvojen od /v1/health koji prati ceo sistem
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'orchestrator-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Voyra Orchestrator Service - jedinstveni /v1 API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      plan: 'POST /v1/plan  (JWT opcion; X-Save-Trip / X-Trip-ID zahtevaju JWT)',
      session: 'GET /v1/plan/:sessionId',
      systemHealth: 'GET /v1/health  (javno, ?refresh=true)',
      stats: 'GET /v1/stats  (JWT + admin, ?period=24h|7d|30d)'
    }
  });
});

app.use('/v1', v1Router);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `${req.method} ${req.path} nije pronadjen`,
    statusCode: 404
  });
});

app.use(errorHandler);

/* Server se pokrece samo kada je fajl pokrenut direktno (vidi izvoz nize). */
if (require.main === module) {
  (async () => {
    // Bez obaveznih promenljivih servis se ne pokrece
    try {
      proveriKonfiguraciju();
    } catch (err) {
      console.error(`[ORCHESTRATOR] ${err.message}`);
      process.exit(1);
    }

    const connected = await connectDB();

    if (!connected) {
      console.error('[ORCHESTRATOR] Konekcija na MongoDB neuspesna. Gasim servis.');
      process.exit(1);
    }

    const healthMonitor = new ServiceHealthMonitor();
    app.locals.healthMonitor = healthMonitor;
    healthMonitor.start();

    const server = app.listen(PORT, () => {
      console.log(`[ORCHESTRATOR] Server running on port ${PORT}`);
      console.log(`[ORCHESTRATOR] Health check: http://localhost:${PORT}/health`);
    });

    const ugasi = () => {
      healthMonitor.stop();
      server.close(() => process.exit(0));
    };

    process.on('SIGTERM', ugasi);
    process.on('SIGINT', ugasi);
  })();
}

/*
 * Aplikacija se izvozi da bi provera pokrivenosti OpenAPI seme
 * (`npm run proba:openapi`) mogla da procita registrovane rute iz
 * Express rutera. Server se pokrece samo kada se fajl pokrene direktno.
 */
module.exports = app;
