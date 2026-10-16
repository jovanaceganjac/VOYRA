const jwt = require('jsonwebtoken');

/**
 * JWT se proverava LOKALNO istim tajnim kljucem - User Service se ne
 * poziva. Gost prolazi dalje bez req.user.
 */
const optionalToken = (req, res, next) => {
  const h = req.headers['authorization'];

  if (h && h.startsWith('Bearer ')) {
    const token = h.substring(7);

    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      req.token = token;
    } catch (err) {
      // Neispravan token = gost. Rute koje traze prijavu vracaju 401 kasnije.
      console.warn('[ORCHESTRATOR] Nevazeci token - nastavljam kao gost');
    }
  }

  next();
};

/** Za rute koje obavezno traze prijavljenog korisnika. */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Ova akcija zahteva prijavu',
      statusCode: 401
    });
  }
  next();
};

/** Za rute koje traze admina. */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Ova akcija zahteva prijavu',
      statusCode: 401
    });
  }

  if (req.user.uloga !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Samo administratori mogu da pristupe ovom resursu',
      statusCode: 403
    });
  }

  next();
};

module.exports = { optionalToken, requireAuth, requireAdmin };
