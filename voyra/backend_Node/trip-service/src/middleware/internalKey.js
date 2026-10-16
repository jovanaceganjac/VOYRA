/**
 * Stiti interne rute Trip Service-a (`/internal/*`).
 *
 * Status putovanja u REZERVISANO i OTKAZANO prevodi Booking Service,
 * jer jedino on zna ishod rezervacije kod avio-kompanije. Poziva se sa
 * `X-Internal-Key`, koji je isti tajni kljuc na svim servisima i nikada
 * ne izlazi izvan backenda.
 */
const verifyInternalKey = (req, res, next) => {
  const ocekivan = process.env.INTERNAL_API_KEY;

  // Nepodesen kljuc ne sme da otvori rutu svima
  if (!ocekivan) {
    return res.status(503).json({
      success: false,
      error: 'INTERNAL_KEY_MISSING',
      message: 'INTERNAL_API_KEY nije podesen na serveru',
      statusCode: 503
    });
  }

  if (req.headers['x-internal-key'] !== ocekivan) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Ruta je dostupna samo internim servisima',
      statusCode: 401
    });
  }

  next();
};

module.exports = { verifyInternalKey };
