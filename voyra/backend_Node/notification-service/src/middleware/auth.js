const jwt = require('jsonwebtoken');

const odbij = (res, code, message, statusCode) =>
  res.status(statusCode).json({ success: false, error: code, message, statusCode });

/** Prijavljen korisnik. */
const verifyToken = (req, res, next) => {
  const h = req.headers['authorization'];

  if (!h || !h.startsWith('Bearer ')) {
    return odbij(res, 'UNAUTHORIZED', 'Nema JWT tokena u Authorization header-u', 401);
  }

  try {
    req.user = jwt.verify(h.substring(7), process.env.JWT_SECRET);
    next();
  } catch (err) {
    return odbij(res, 'INVALID_TOKEN', 'Nevazeci ili istekao token', 401);
  }
};

/** Prijavljen korisnik sa ulogom admin. */
const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.uloga !== 'admin') {
      return odbij(res, 'FORBIDDEN', 'Samo administratori mogu da pristupe ovom resursu', 403);
    }
    next();
  });
};

/**
 * Poziv servis-servis (POST /send).
 *
 * Specifikacija ovu rutu opisuje kao javnu ("samo interni pozivi"), ali
 * bez ikakve provere bilo ko sa pristupom portu 4007 mogao bi da salje
 * email-ove u ime sistema. Zato se trazi zajednicki kljuc iz .env-a;
 * alternativno prolazi i validan korisnicki token.
 */
const verifyInternal = (req, res, next) => {
  const kljuc = req.headers['x-internal-key'];

  if (kljuc && kljuc === process.env.INTERNAL_API_KEY) {
    req.internalCall = true;
    return next();
  }

  const h = req.headers['authorization'];

  if (h && h.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(h.substring(7), process.env.JWT_SECRET);
      return next();
    } catch (err) {
      return odbij(res, 'INVALID_TOKEN', 'Nevazeci ili istekao token', 401);
    }
  }

  return odbij(
    res,
    'UNAUTHORIZED',
    'Interni poziv zahteva X-Internal-Key ili validan JWT token',
    401
  );
};

module.exports = { verifyToken, verifyAdmin, verifyInternal };
