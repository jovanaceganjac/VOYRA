const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const NotificationService = require('./services/NotificationService');
const NotificationQueue = require('./services/NotificationQueue');
const notificationsRouter = require('./routes/notifications');
const adminRouter = require('./routes/admin');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || process.env.NOTIFICATION_PORT || 4007;

// Prilozi (PDF u base64) umeju da budu veliki
app.use(cors())

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'NOTIFICATION_SERVICE' });;
app.use(express.json({ limit: '10mb' }));
app.set('trust proxy', true);

app.use((req, res, next) => {
  console.log(`[NOTIFICATION_SERVICE] ${req.method.toUpperCase()} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'notification-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Voyra Notification Service - email i SMS notifikacije',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      send: 'POST /api/notifications/send  (X-Internal-Key ili JWT)',
      list: 'GET /api/notifications  (JWT, paginirano)',
      stats: 'GET /api/notifications/stats  (JWT)',
      get: 'GET /api/notifications/:id  (JWT)',
      retry: 'POST /api/notifications/:id/retry  (JWT)',
      cancel: 'PATCH /api/notifications/:id/cancel  (JWT)',
      adminAll: 'GET /api/admin/notifications  (JWT + admin)'
    }
  });
});

app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `${req.method} ${req.path} nije pronadjen`,
    statusCode: 404
  });
});

app.use((err, req, res, next) => {
  console.error('[NOTIFICATION_SERVICE] Error:', err.message);

  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'NOTIFICATION_ERROR',
      message: err.message,
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

/* Server se pokrece samo kada je fajl pokrenut direktno (vidi izvoz nize). */
if (require.main === module) {
  (async () => {
    const connected = await connectDB();

    if (!connected) {
      console.error('[NOTIFICATION_SERVICE] Konekcija na MongoDB neuspesna. Gasim servis.');
      process.exit(1);
    }

    const service = new NotificationService();
    await service.seedTemplates();

    const queue = new NotificationQueue(service);
    queue.start();

    const server = app.listen(PORT, () => {
      console.log(`[NOTIFICATION_SERVICE] Server running on port ${PORT}`);
      console.log(`[NOTIFICATION_SERVICE] Health check: http://localhost:${PORT}/health`);
    });

    // Worker mora da stane pre gasenja, da ne ostavi zakljucan zapis
    const ugasi = () => {
      queue.stop();
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
