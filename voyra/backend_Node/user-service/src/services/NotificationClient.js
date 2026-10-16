const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4007';
const TIMEOUT = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 10000;

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
 * Obavestenja koja salje sam User Service.
 *
 * Za sada samo `PASSWORD_CHANGED`. Poziv je "posalji i zaboravi":
 * lozinka je vec promenjena, pa nedostupan Notification Service ne sme
 * da obori odgovor korisniku koji je upravo promenio lozinku.
 */

class NotificationClient {
  async posalji(tip, korisnik, podaci = {}) {
    if (!korisnik?.email) return false;

    try {
      await posaljiJson(
        `${NOTIFICATION_URL}/api/notifications/send`,
        {
          type: tip,
          userId: String(korisnik._id || korisnik.id || ''),
          recipient: { email: korisnik.email, firstName: korisnik.ime },
          templateData: {
            firstName: korisnik.ime || korisnik.korisnickoIme || 'korisnice',
            ...podaci
          }
        },
        TIMEOUT
      );

      return true;
    } catch (err) {
      console.error(`[USER_SERVICE] Obavestenje ${tip} nije poslato:`, err.message);
      return false;
    }
  }

  /** Lozinka je promenjena - korisnik mora da sazna i ako to nije bio on. */
  lozinkaPromenjena(korisnik) {
    return this.posalji('PASSWORD_CHANGED', korisnik, {
      username: korisnik.korisnickoIme || ''
    });
  }
}

module.exports = NotificationClient;
