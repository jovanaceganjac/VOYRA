const jwt = require('jsonwebtoken');

/**
 * Stiti interne admin rute (/api/users/all, PATCH status/role, DELETE).
 *
 * Zahteva DVE stvari:
 *   1. X-Admin-Request: true  - marker da je poziv interni (Admin Service)
 *   2. Authorization: Bearer <token> sa uloga === 'admin'
 *
 * Sam header NIJE dokaz identiteta - bilo ko ko dohvati port 4001 mogao
 * bi da ga posalje i obrise sve korisnike. Zato se uz njega uvek trazi
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

/**
 * Poziv servis-servis sa zajednickim kljucem iz .env-a.
 *
 * Koristi ga Notification Service da dohvati email/telefon primaoca -
 * on nema korisnicki token, a ne sme ni da dobije admin prava.
 */
const verifyInternalService = (req, res, next) => {
  const kljuc = req.headers['x-internal-key'];

  if (!kljuc || kljuc !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Neispravan ili nedostajuci X-Internal-Key',
      statusCode: 401
    });
  }

  next();
};

module.exports = { verifyInternalAdmin, verifyInternalService };
