const jwt = require('jsonwebtoken');

const unauthorized = (res, message) =>
  res.status(401).json({
    success: false,
    error: 'UNAUTHORIZED',
    message,
    statusCode: 401
  });

/** Izvlaci token iz "Authorization: Bearer <token>". */
const izvuciToken = (req) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;

  const [shema, token] = authHeader.split(' ');
  return shema === 'Bearer' && token ? token : null;
};

/**
 * Stiti rute koje zahtevaju prijavljenog korisnika.
 * Payload koji izdaje User Service: { id, korisnickoIme, email }
 */
const verifyToken = (req, res, next) => {
  const token = izvuciToken(req);

  if (!token) {
    return unauthorized(res, 'Nema JWT tokena u Authorization header-u');
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    req.token = token;
    next();
  } catch (err) {
    return unauthorized(res, 'Nevazeci ili istekao token');
  }
};

/**
 * Za javne rute na kojima prijava menja ponasanje (npr. /plan):
 * ako validan token postoji, popunjava req.user; ako ne postoji ili
 * je neispravan, zahtev ide dalje kao gost.
 */
const optionalToken = (req, res, next) => {
  const token = izvuciToken(req);

  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      req.token = token;
    } catch (err) {
      console.warn('[TRIP_SERVICE] Nevazeci token na javnoj ruti - nastavljam kao gost');
    }
  }

  next();
};

module.exports = { verifyToken, optionalToken };
