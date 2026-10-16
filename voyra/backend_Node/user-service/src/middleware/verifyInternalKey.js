/**
 * Poziv servis-servis sa zajednickim kljucem iz .env-a.
 * Koristi ga Notification Service da dohvati email i telefon primaoca.
 */
const verifyInternalKey = (req, res, next) => {
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

module.exports = { verifyInternalKey };
