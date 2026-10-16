const { verifyToken } = require('../utils/jwt');

const unauthorized = (res, message) =>
  res.status(401).json({
    success: false,
    error: 'UNAUTHORIZED',
    message,
    statusCode: 401
  });

/**
 * Stiti rute koje zahtevaju prijavljenog korisnika.
 * Ocekuje header: Authorization: Bearer <token>
 */
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return unauthorized(res, 'Nema JWT tokena u Authorization header-u');
  }

  const [shema, token] = authHeader.split(' ');

  if (shema !== 'Bearer' || !token) {
    return unauthorized(res, 'Token nije pronadjen (ocekivan format: Bearer <token>)');
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return unauthorized(res, 'Nevazeci ili istekao token');
  }

  req.user = decoded;
  next();
};

module.exports = { verifyJWT };
