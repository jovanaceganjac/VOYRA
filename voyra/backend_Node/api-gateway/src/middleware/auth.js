const jwt = require('jsonwebtoken');

/**
 * Verifikuje JWT token iz Authorization header-a.
 * Ocekivani format: "Authorization: Bearer <token>"
 * Na uspeh dekodirani payload {userId, uloga, email} stavlja na req.user.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Nema JWT tokena u Authorization header-u',
      statusCode: 401
    });
  }

  const [shema, token] = authHeader.split(' ');

  if (shema !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Token nije pronadjen u header-u (ocekivan format: Bearer <token>)',
      statusCode: 401
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Nevazeci ili istekao token',
      statusCode: 401
    });
  }
};

module.exports = { verifyToken };
