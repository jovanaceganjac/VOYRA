const jwt = require('jsonwebtoken');

/**
 * Propusta samo prijavljene korisnike sa ulogom 'admin'.
 *
 * Token mora da nosi `uloga` u payload-u - User Service ga ubacuje
 * pri prijavi. Bez tokena 401, sa tokenom obicnog korisnika 403.
 */
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Nema JWT tokena u Authorization header-u',
      statusCode: 401
    });
  }

  const token = authHeader.substring(7);

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Nevazeci ili istekao token',
      statusCode: 401
    });
  }

  // Prijavljen jeste, ali nije admin
  if (decoded.uloga !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Samo administratori mogu da pristupe ovom resursu',
      statusCode: 403
    });
  }

  req.user = decoded;
  req.token = token;
  next();
};

module.exports = { verifyAdmin };
