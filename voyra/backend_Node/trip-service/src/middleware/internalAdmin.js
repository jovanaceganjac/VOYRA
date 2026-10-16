const jwt = require('jsonwebtoken');

/**
 * Stiti interne admin rute (/api/trips/all).
 *
 * Zahteva DVE stvari:
 *   1. X-Admin-Request: true  - marker da je poziv interni (Admin Service)
 *   2. Authorization: Bearer <token> sa uloga === 'admin'
 *
 * Sam header NIJE dokaz identiteta - bilo ko ko dohvati port 4001 mogao
 * bi da ga posalje i procita sva putovanja. Zato se uz njega uvek trazi
 * i validan admin token, koji Admin Service prosledjuje.
 */
const verifyInternalAdmin = (req, res, next) => {
  if (req.headers['x-admin-request'] !== 'true') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Ruta je dostupna samo kroz Admin Service',
      statusCode: 403
    });
  }

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Interni admin poziv mora da nosi admin token',
      statusCode: 401
    });
  }

  try {
    const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);

    if (decoded.uloga !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Samo administratori mogu da pristupe ovom resursu',
        statusCode: 403
      });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Nevazeci ili istekao token',
      statusCode: 401
    });
  }
};

module.exports = { verifyInternalAdmin };
