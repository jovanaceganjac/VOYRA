const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const usersRouter = require('./routes/users');
const internalRouter = require('./routes/internal');
const { montirajDocs } = require('../../shared/docs');

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 4001;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAPI dokumentacija (spec §8) - iskljucuje se sa DOCS_ENABLED=false
montirajDocs(app, { korenServisa: __dirname, naziv: 'USER_SERVICE' });

// Logger middleware
app.use((req, res, next) => {
  console.log(`[USER_SERVICE] ${req.method.toUpperCase()} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'user-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Welcome ruta
app.get('/', (req, res) => {
  res.json({
    message: 'Voyra User Service - registracija, prijava, JWT',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      register: 'POST /api/users/register  (javno)',
      login: 'POST /api/users/login  (javno)',
      profile: 'GET /api/users/profile  (JWT)',
      me: 'GET/PUT /api/users/me  (JWT)',
      smsPreference: 'PATCH /api/users/me/sms-preference  (JWT)'
    }
  });
});

// Rute: /api/users/* je putanja koju koristi API Gateway.
// Isti ruter je montiran i na korenu radi direktnog testiranja servisa.
// Interne admin rute idu PRE authRouter-a: /all bi inace pao na 404,
// a montirane su samo pod /api/users (ne i na korenu) da DELETE /:id
// ne bi hvatao proizvoljne putanje.
// Redosled je vazan: /internal/:id i /me/* pre admin ruta sa /:id
app.use('/api/users/internal', internalRouter);
app.use('/api/users', usersRouter);
app.use('/api/users', adminRouter);
app.use('/api/users', authRouter);
app.use('/', authRouter);

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
  console.error('[USER_SERVICE] Error:', err.message);

  // Greske sa poznatim statusom (RATE_LIMIT 429, CODE_EXPIRED 410...)
  if (err.statusCode) {
    const telo = {
      success: false,
      error: err.code || 'ERROR',
      message: err.message,
      statusCode: err.statusCode
    };

    if (err.retryAfter) {
      res.set('Retry-After', String(err.retryAfter));
      telo.retryAfter = err.retryAfter;
    }
    if (err.attemptsLeft !== undefined) telo.attemptsLeft = err.attemptsLeft;

    return res.status(err.statusCode).json(telo);
  }

  // Mongoose validacija seme (npr. neispravan enum status)
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: Object.values(err.errors).map((e) => e.message),
      statusCode: 400
    });
  }

  // Neispravan ObjectId u URL-u
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
      console.error('[USER_SERVICE] Konekcija na MongoDB neuspesna. Gasim servis.');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`[USER_SERVICE] Server running on port ${PORT}`);
      console.log(`[USER_SERVICE] Health check: http://localhost:${PORT}/health`);
    });
  })();
}

/*
 * Aplikacija se izvozi da bi provera pokrivenosti OpenAPI seme
 * (`npm run proba:openapi`) mogla da procita registrovane rute iz
 * Express rutera. Server se pokrece samo kada se fajl pokrene direktno.
 */
module.exports = app;
