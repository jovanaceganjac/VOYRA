const axios = require('axios');

/**
 * Klijent koji ostali servisi koriste da posalju notifikaciju.
 *
 * Slanje notifikacije NIKAD ne sme da obori akciju zbog koje se salje -
 * ako rezervacija uspe a email ne, rezervacija i dalje vazi. Zato ovde
 * nema bacanja gresaka, samo log.
 */
class NotificationClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4007';
    this.timeout = parseInt(process.env.NOTIFICATION_TIMEOUT_MS, 10) || 5000;
  }

  /**
   * @param {string} type - BOOKING_CONFIRMED, PAYMENT_FAILED...
   * @param {object} payload - { userId, recipient, templateData, attachment, metadata }
   */
  async send(type, payload) {
    try {
      const r = await axios.post(
        `${this.baseUrl}/api/notifications/send`,
        { type, ...payload },
        {
          headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY },
          timeout: this.timeout
        }
      );

      return { sent: true, notificationId: r.data.data?._id };
    } catch (err) {
      console.error(
        `[NOTIFICATION_CLIENT] Slanje ${type} neuspesno:`,
        err.response?.data?.message || err.message
      );

      return { sent: false, reason: err.message };
    }
  }
}

module.exports = NotificationClient;
