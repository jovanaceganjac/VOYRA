const axios = require('axios');

const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4007';
const TIMEOUT = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 10000;

const PRIJAVA_URL = process.env.APP_LOGIN_URL || 'http://localhost:4200/prijava';

/**
 * Obavestenje korisniku o odluci administratora (spec §3.3, §4.10).
 *
 * Poziv je "posalji i zaboravi": nalog je vec promenjen, pa nedostupan
 * Notification Service ne sme da obori odgovor administratoru. Neuspeh
 * se belezi u log i vraca kao `false`, da ruta moze da ga prijavi.
 */
class NotificationClient {
  /**
   * @param {object} p - { tip, korisnik, razlog }
   * @returns {Promise<boolean>} da li je obavestenje primljeno u red
   */
  async odluka({ tip, korisnik, razlog = null }) {
    if (!tip || !korisnik?.email) return false;

    /*
     * Sablon uvek ispisuje red "Razlog:", pa prazan razlog dobija
     * citljiv tekst umesto praznine. Administrator razlog ne mora da
     * unese - specifikacija ga ne trazi obavezno.
     */
    const podaci = {
      firstName: korisnik.ime || korisnik.korisnickoIme || 'korisnice',
      username: korisnik.korisnickoIme || '',
      reason: razlog || 'nije naveden',
      link: PRIJAVA_URL
    };

    try {
      await axios.post(
        `${NOTIFICATION_URL}/api/notifications/send`,
        {
          type: tip,
          userId: String(korisnik._id || korisnik.id || ''),
          recipient: { email: korisnik.email, firstName: podaci.firstName },
          templateData: podaci
        },
        {
          headers: {
            'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
            'Content-Type': 'application/json'
          },
          timeout: TIMEOUT
        }
      );

      return true;
    } catch (err) {
      console.error(`[ADMIN_SERVICE] Obavestenje ${tip} nije poslato:`, err.message);
      return false;
    }
  }
}

module.exports = NotificationClient;
