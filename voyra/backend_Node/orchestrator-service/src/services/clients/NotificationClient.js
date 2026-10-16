const HttpClient = require('./httpClient');
const { REGISTRY } = require('../../config/serviceRegistry');

/**
 * Klijent ka Notification Service-u (fire-and-forget).
 * Neuspeh se samo loguje - notifikacija ne sme da obori plan.
 */
class NotificationClient {
  constructor() {
    this.http = new HttpClient('notification', REGISTRY.notification);
  }

  async tripSaved({ userId, trip, zahtev }, requestId) {
    try {
      await this.http.zahtev({
        metod: 'post',
        putanja: '/api/notifications/send',
        telo: {
          type: 'TRIP_SAVED',
          userId,
          templateData: {
            title: trip.title,
            destination: zahtev.to,
            startDate: zahtev.checkIn,
            days: trip.itinerary?.totalDays ?? '-',
            link: `/trips/${trip._id}`
          },
          metadata: { tripId: String(trip._id), source: 'orchestrator-service' }
        },
        internalKey: process.env.INTERNAL_API_KEY,
        requestId
      });

      return { sent: true };
    } catch (err) {
      console.warn('[ORCHESTRATOR] TRIP_SAVED notifikacija neuspesna:', err.message);
      return { sent: false, reason: err.message };
    }
  }
}

module.exports = NotificationClient;
