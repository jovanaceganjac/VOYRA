/** Prevodi greske sa poznatim statusom u HTTP odgovor. */
const errorHandler = (err, req, res, next) => {
  console.error(`[ORCHESTRATOR] Error (${req.requestId || '-'}):`, err.message);

  if (err.statusCode) {
    /*
     * Dodatna polja iz tela greske servisa se PROSLEDJUJU.
     *
     * Trip Service uz `409 VERSION_CONFLICT` salje `currentVersion`, a
     * User Service uz `429` salje `retryAfter` - bez ovoga bi klijent
     * dobio samo poruku i ne bi mogao da ponudi "ucitaj novu verziju".
     * Isto pravilo gateway vec primenjuje na /v1.
     */
    const { success, error, message, statusCode, ...dodatno } = err.upstream || {};

    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'ORCHESTRATOR_ERROR',
      message: err.message,
      ...dodatno,
      ...(err.errors ? { errors: err.errors } : {}),
      statusCode: err.statusCode
    });
  }

  res.status(500).json({
    success: false,
    error: 'SERVER_ERROR',
    message: err.message,
    statusCode: 500
  });
};

module.exports = { errorHandler };
