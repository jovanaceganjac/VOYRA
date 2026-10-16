const jwt = require('jsonwebtoken');

/**
 * Sve booking rute zahtevaju prijavljenog korisnika.
 * Payload koji izdaje User Service: { id, korisnickoIme, email, uloga }
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Nema JWT tokena u Authorization header-u',
      statusCode: 401
    });
  }

  try {
    req.user = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
    req.token = authHeader.substring(7);
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

module.exports = { verifyToken };
