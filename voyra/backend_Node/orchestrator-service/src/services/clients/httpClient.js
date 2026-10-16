const axios = require('axios');

/**
 * Zajednicki HTTP klijent za pozive ka mikroservisima.
 *
 * Retry se radi SAMO na mreznu gresku ili 5xx. Na 4xx nikad -
 * ponavljanje neispravnog zahteva daje istu gresku i troši vreme.
 */
class HttpClient {
  /**
   * @param {string} ime - naziv servisa (za logove)
   * @param {object} konfig - { url, timeout, retry }
   */
  constructor(ime, konfig) {
    this.ime = ime;
    this.url = konfig.url;
    this.timeout = konfig.timeout;
    this.retry = konfig.retry || 0;
  }

  _greska(poruka, code, statusCode, dodatno = {}) {
    const e = new Error(poruka);
    e.code = code;
    e.statusCode = statusCode;
    e.service = this.ime;
    Object.assign(e, dodatno);
    return e;
  }

  /** Da li se na ovu gresku sme pokusati ponovo. */
  _smePonovo(err) {
    if (!err.response) return true;              // mrezna greska / timeout
    return err.response.status >= 500;           // greska servera
  }

  /**
   * @returns {{ data, durationMs }} ili baca gresku sa statusCode
   */
  async zahtev({ metod = 'get', putanja, telo, headers = {}, requestId, token, internalKey }) {
    const pun = `${this.url}${putanja}`;

    const zaglavlja = { ...headers };
    if (requestId) zaglavlja['X-Request-ID'] = requestId;
    if (token) zaglavlja.Authorization = `Bearer ${token}`;
    if (internalKey) zaglavlja['X-Internal-Key'] = internalKey;

    let poslednja;

    for (let pokusaj = 0; pokusaj <= this.retry; pokusaj++) {
      const pocetak = Date.now();

      try {
        const odgovor = await axios({
          method: metod,
          url: pun,
          data: telo,
          headers: zaglavlja,
          timeout: this.timeout
        });

        return { data: odgovor.data, status: odgovor.status, durationMs: Date.now() - pocetak };
      } catch (err) {
        poslednja = err;

        if (pokusaj < this.retry && this._smePonovo(err)) {
          console.warn(`[ORCHESTRATOR] ${this.ime} ${putanja} neuspesno, ponavljam (${pokusaj + 1}/${this.retry})`);
          continue;
        }

        break;
      }
    }

    // Servis je odgovorio greskom - prosledi njegov status i poruku
    if (poslednja.response) {
      throw this._greska(
        poslednja.response.data?.message || `${this.ime} je vratio gresku`,
        poslednja.response.data?.error || `${this.ime.toUpperCase()}_ERROR`,
        poslednja.response.status,
        { upstream: poslednja.response.data }
      );
    }

    // Servis nije dostupan ili je isteklo vreme
    throw this._greska(
      `${this.ime} servis nije dostupan (${poslednja.code || poslednja.message})`,
      `${this.ime.toUpperCase()}_UNAVAILABLE`,
      503,
      { cause: poslednja.code || poslednja.message }
    );
  }

  /** Ping /health - koristi ServiceHealthMonitor. */
  async ping(timeoutMs) {
    const pocetak = Date.now();

    try {
      await axios.get(`${this.url}/health`, { timeout: timeoutMs || this.timeout });
      return { status: 'UP', responseTime: Date.now() - pocetak };
    } catch (err) {
      return {
        status: 'DOWN',
        responseTime: Date.now() - pocetak,
        error: err.code || err.message
      };
    }
  }
}

module.exports = HttpClient;
