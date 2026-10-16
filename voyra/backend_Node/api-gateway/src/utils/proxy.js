/**
 * Pomocne funkcije za proxy pozive ka mikroservisima.
 * Gateway je stateless - samo prosledjuje zahtev i normalizuje gresku.
 */

const TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS) || 10000;

/**
 * Gradi axios konfiguraciju: prosledjuje Bearer token i query parametre
 * originalnog zahteva ka ciljnom servisu.
 */
const proxyConfig = (req, timeoutMs) => {
  const config = { timeout: timeoutMs || TIMEOUT_MS, params: req.query };

  // req.token postavlja verifyToken na zasticenim rutama.
  // Na javnim rutama (npr. /trips/plan) middleware ne trci, ali zahtev
  // i dalje moze da nosi token - servis iza mora da zna ko je pozvao,
  // da bi prijavljenom korisniku sacuvao plan.
  const token = req.token || (req.headers.authorization || '').replace(/^Bearer /, '');

  if (token) {
    config.headers = { Authorization: `Bearer ${token}` };
  }

  return config;
};

/**
 * Prosledjuje gresku servisa klijentu.
 *
 * Telo se prosledjuje CELO. Ranije su zadrzavana samo cetiri polja, pa
 * su se gubili `errors` (lista gresaka validacije), `attemptsLeft`
 * (preostali pokusaji SMS koda) i `retryAfter` - frontend je dobijao
 * poruku bez podataka koji su mu potrebni da je prikaze korisno.
 * Isto vazi i za zaglavlje `Retry-After` kod 429.
 */
const proxyError = (res, err, errorCode, fallbackMessage) => {
  console.error(`[API_GATEWAY] ${errorCode}:`, err.message);

  if (!err.response) {
    return res.status(503).json({
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Ciljni servis trenutno nije dostupan',
      statusCode: 503
    });
  }

  const statusCode = err.response.status;
  const telo = err.response.data;

  // Servis moze da odgovori i tekstom ili praznim telom
  if (!telo || typeof telo !== 'object') {
    return res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: typeof telo === 'string' && telo.trim() ? telo : fallbackMessage,
      statusCode
    });
  }

  const retryAfter = err.response.headers?.['retry-after'];
  if (retryAfter) res.set('Retry-After', retryAfter);

  return res.status(statusCode).json({
    success: false,
    // Servis zna tacniji kod (VALIDATION_ERROR, FORBIDDEN, DUPLICATE_EMAIL...);
    // errorCode je fallback ako ga odgovor nema.
    ...telo,
    error: telo.error || errorCode,
    message: telo.message || fallbackMessage,
    statusCode
  });
};

module.exports = { proxyConfig, proxyError };
