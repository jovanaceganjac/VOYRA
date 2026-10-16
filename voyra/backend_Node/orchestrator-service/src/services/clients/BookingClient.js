const HttpClient = require('./httpClient');
const { REGISTRY } = require('../../config/serviceRegistry');

/**
 * Klijent ka Booking Service-u (nije kritican).
 *
 * VAZNO: stvarna ruta POST /api/bookings/validate proverava ponude
 * u VEC SACUVANOM putovanju (trazi tripId i cita ga iz Trip Service-a).
 * Nesacuvan plan zato ne moze da se proveri - tada se procena racuna
 * lokalno iz itinerary-ja (vidi OrchestrationService).
 */
class BookingClient {
  constructor() {
    this.http = new HttpClient('booking', REGISTRY.booking);
  }

  async validate({ tripId, flightOfferIds, propertyIds }, token, requestId) {
    const { data, durationMs } = await this.http.zahtev({
      metod: 'post',
      putanja: '/api/bookings/validate',
      telo: { tripId, flightOfferIds, propertyIds },
      token,
      requestId
    });

    return { rezultat: data, durationMs };
  }
}

module.exports = BookingClient;
