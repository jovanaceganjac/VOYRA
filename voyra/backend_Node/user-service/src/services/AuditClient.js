const ADMIN_URL = process.env.ADMIN_SERVICE_URL || 'http://localhost:4005';
const TIMEOUT = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 5000;

/**
 * Poziv ka drugom servisu, bez nove zavisnosti.
 *
 * User Service nema `axios` u zavisnostima (koristi ga samo Twilio grana
 * SMSClient-a, i to uslovno), pa se ovde koristi ugradjeni `fetch`
 * iz Node-a 18+.
 */
const posaljiJson = async (url, telo, timeoutMs) => {
  const prekid = AbortSignal.timeout(timeoutMs);

  const odgovor = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(telo),
    signal: prekid
  });

  if (!odgovor.ok) {
    throw new Error(`${odgovor.status} ${odgovor.statusText}`);
  }

  return odgovor.json().catch(() => ({}));
};

/**
 * Revizioni zapis za radnje koje korisnik radi sam.
 *
 * Zapisi zive u Admin Service-u, pa User Service samo javlja sta se
 * dogodilo. Poziv je "posalji i zaboravi": nedostupan Admin Service ne
 * sme da obori promenu lozinke koja je vec upisana.
 *
 * O LOZINKAMA SE NE BELEZI NISTA - ni stara, ni nova, ni njihova duzina,
 * ni hes. U zapisu stoji samo da je promena izvrsena, ko ju je izvrsio i
 * odakle.
 */

class AuditClient {
  async zabelezi(akcija, { userId, req }) {
    try {
      await posaljiJson(
        `${ADMIN_URL}/api/admin/internal/audit`,
        {
          action: akcija,
          userId,
          target: userId,
          ipAddress: req?.ip,
          userAgent: req?.headers?.['user-agent'],
          status: 'SUCCESS'
        },
        TIMEOUT
      );

      return true;
    } catch (err) {
      console.error(`[USER_SERVICE] Revizioni zapis ${akcija} nije upisan:`, err.message);
      return false;
    }
  }
}

module.exports = AuditClient;
