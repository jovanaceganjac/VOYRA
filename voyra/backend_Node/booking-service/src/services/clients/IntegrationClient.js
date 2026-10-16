const axios = require('axios');

/**
 * Klijent ka Integration Service-u za rezervaciju leta.
 *
 * Booking Service NEMA nijedan kljuc spoljnog API-ja (spec §5): ponovnu
 * proveru ponude, kreiranje i otkazivanje narudzbine radi Integration
 * Service, a ovde se samo prosledjuje zahtev sa internim kljucem.
 */
class IntegrationClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.INTEGRATION_SERVICE_URL || 'http://localhost:4003';
    this.timeout = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 20000;
  }

  _zaglavlja(requestId) {
    return {
      'X-Internal-Key': process.env.INTERNAL_API_KEY,
      ...(requestId ? { 'X-Request-ID': requestId } : {})
    };
  }

  /**
   * Gresku Integration Service-a prosledjuje dalje sa njenim statusom,
   * da bi korisnik dobio 410 za isteklu ponudu i 422 za previse putnika,
   * a ne uopsteno 500.
   */
  _greska(err, podrazumevanaPoruka) {
    const telo = err.response?.data;

    const e = new Error(telo?.message || podrazumevanaPoruka || err.message);
    e.code = telo?.error || 'INTEGRATION_ERROR';
    e.statusCode = err.response?.status && err.response.status < 500 ? err.response.status : 502;

    return e;
  }

  /** Ponovna provera ponude pred rezervaciju (spec §4.8 t.2). */
  async ponuda(offerId, requestId) {
    try {
      const r = await axios.get(
        `${this.baseUrl}/internal/flights/offers/${encodeURIComponent(offerId)}`,
        { headers: this._zaglavlja(requestId), timeout: this.timeout }
      );

      return { ponuda: r.data.data, source: r.data.source };
    } catch (err) {
      throw this._greska(err, 'Ponuda nije mogla da se proveri');
    }
  }

  /** Kreiranje rezervacije kod avio-kompanije. */
  async kreirajNarudzbinu({ offerId, passengers, amount, currency }, requestId) {
    try {
      const r = await axios.post(
        `${this.baseUrl}/internal/flights/orders`,
        { offerId, passengers, amount, currency },
        { headers: this._zaglavlja(requestId), timeout: this.timeout }
      );

      return { narudzbina: r.data.data, source: r.data.source };
    } catch (err) {
      throw this._greska(err, 'Rezervacija nije mogla da se kreira');
    }
  }

  /** Otkazivanje rezervacije. */
  async otkaziNarudzbinu(orderId, requestId) {
    try {
      const r = await axios.post(
        `${this.baseUrl}/internal/flights/orders/${encodeURIComponent(orderId)}/cancel`,
        {},
        { headers: this._zaglavlja(requestId), timeout: this.timeout }
      );

      return { otkazivanje: r.data.data, source: r.data.source };
    } catch (err) {
      throw this._greska(err, 'Rezervacija nije mogla da se otkaze');
    }
  }
}

module.exports = IntegrationClient;
