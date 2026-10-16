const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const usersRouter = require('./routes/users');
const statsRouter = require('./routes/stats');
const logsRouter = require('./routes/logs');
const internalRouter = require('./routes/internal');
const sadrzajRouter = require('./routes/sadrzaj');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.ADMIN_SERVICE_PORT || process.env.ADMIN_PORT || 4005;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'ADMIN_SERVICE' });

// req.ip ce biti stvarna adresa klijenta, a ne gateway-a
app.set('trust proxy', true);

// Logger middleware
app.use((req, res, next) => {
  console.log(`[ADMIN_SERVICE] ${req.method.toUpperCase()} ${req.path}`);
  next();
});

// Health check - javno
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'admin-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Welcome ruta - javno
app.get('/', (req, res) => {
  res.json({
    message: 'Voyra Admin Service - upravljanje sistemom',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      users: 'GET /api/admin/users  (JWT + admin)',
      updateStatus: 'PATCH /api/admin/users/:userId/status  (JWT + admin)',
      updateRole: 'PATCH /api/admin/users/:userId/role  (JWT + admin)',
      deleteUser: 'DELETE /api/admin/users/:userId  (JWT + admin)',
      stats: 'GET /api/admin/stats  (JWT + admin)',
      logs: 'GET /api/admin/logs  (JWT + admin)',
      logsStats: 'GET /api/admin/logs/statistics  (JWT + admin)'
    }
  });
});

// Rute - sve zahtevaju JWT sa ulogom 'admin'
app.use('/api/admin/internal', internalRouter);
app.use('/api/admin/users', usersRouter);
app.use('/api/admin/stats', statsRouter);
app.use('/api/admin/logs', logsRouter);
// Destinacije, atrakcije i kategorije (spec §3.3)
app.use('/api/admin', sadrzajRouter);

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
  console.error('[ADMIN_SERVICE] Error:', err.message);

  // Greske sa poznatim statusom (prosledjene iz User/Trip Service-a)
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'ADMIN_ERROR',
      message: err.message,
      // Dodatna polja iz servisa iza (lista `errors`, `udaljenostKm`...)
      ...(err.upstream || {}),
      statusCode: err.statusCode
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
      console.error('[ADMIN_SERVICE] Konekcija na MongoDB neuspesna. Gasim servis.');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`[ADMIN_SERVICE] Server running on port ${PORT}`);
      console.log(`[ADMIN_SERVICE] Health check: http://localhost:${PORT}/health`);
    });
  })();
}

/*
 * Aplikacija se izvozi da bi provera pokrivenosti OpenAPI seme
 * (`npm run proba:openapi`) mogla da procita registrovane rute iz
 * Express rutera. Server se pokrece samo kada se fajl pokrene direktno.
 */
module.exports = app;
