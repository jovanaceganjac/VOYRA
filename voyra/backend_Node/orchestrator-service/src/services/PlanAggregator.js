const crypto = require('crypto');

/**
 * Sklapa jedinstven odgovor /v1/plan.
 *
 * Struktura `itinerary` se NE prepakuje - frontend dobija tacno ono
 * sto Planner vraca, da postoji jedan izvor istine za format.
 */
class PlanAggregator {
  /** Nepogodiv ID sesije: PSN_ + 16 hex. */
  static noviSessionId() {
    return `PSN_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Procena troska iz samog plana - koristi se kada Booking Service
   * nije dostupan ili plan jos nije sacuvan (validate trazi tripId).
   */
  static procenaIzPlana(itinerary, budget) {
    const b = itinerary?.totalBudget || {};

    const flights = b.flights || 0;
    const accommodations = b.accommodations || 0;
    const attractions = b.attractions || 0;
    const total = b.total ?? flights + accommodations + attractions;

    return {
      flights,
      accommodations,
      attractions,
      total: Math.round(total * 100) / 100,
      currency: 'EUR',
      withinBudget: budget === undefined ? null : total <= budget,
      isBookable: false,
      issues: []
    };
  }

  /** Procena dopunjena rezultatom Booking Service-a. */
  static procenaSaValidacijom(itinerary, budget, validacija) {
    const osnovna = PlanAggregator.procenaIzPlana(itinerary, budget);

    return {
      ...osnovna,
      total: validacija.estimatedTotal ?? osnovna.total,
      isBookable: validacija.valid === true,
      issues: validacija.errors || []
    };
  }

  /**
   * @returns {object} telo odgovora /v1/plan
   */
  static sastavi({
    sessionId,
    zahtev,
    itinerary,
    bookingEstimate,
    izvori,
    savedTripId,
    warnings,
    timings,
    ttlSati
  }) {
    const sada = new Date();

    return {
      planSessionId: sessionId,
      status: 'READY',
      savedTripId: savedTripId || null,
      source: izvori,
      request: zahtev,
      itinerary,
      bookingEstimate,
      warnings,
      timings,
      createdAt: sada.toISOString(),
      expiresAt: new Date(sada.getTime() + ttlSati * 3600 * 1000).toISOString()
    };
  }
}

module.exports = PlanAggregator;
