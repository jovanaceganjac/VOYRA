const PlanSession = require('../models/PlanSession');

const PERIODI = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };

/**
 * Statistika planiranja - iskljucivo iz PlanSession kolekcije.
 * Orchestrator ne izmislja metrike eksternih API-ja.
 */
class StatsService {
  async get(period = '24h') {
    const sati = PERIODI[period] || PERIODI['24h'];
    const od = new Date(Date.now() - sati * 3600 * 1000);
    const upit = { createdAt: { $gte: od } };

    const [ukupno, gosti, sacuvani, neuspeli, prosek, izvori, rute] = await Promise.all([
      PlanSession.countDocuments(upit),
      PlanSession.countDocuments({ ...upit, userId: null }),
      PlanSession.countDocuments({ ...upit, savedTripId: { $ne: null } }),
      PlanSession.countDocuments({ ...upit, status: 'FAILED' }),
      PlanSession.aggregate([
        { $match: { ...upit, status: 'READY' } },
        { $group: { _id: null, prosek: { $avg: '$durationMs' } } }
      ]),
      PlanSession.aggregate([
        { $match: { ...upit, 'sources.flights': { $ne: null } } },
        { $group: { _id: '$sources.flights', count: { $sum: 1 } } }
      ]),
      PlanSession.aggregate([
        { $match: upit },
        { $group: { _id: '$route', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    return {
      period,
      totalPlans: ukupno,
      guestPlans: gosti,
      savedTrips: sacuvani,
      failedPlans: neuspeli,
      averagePlanTimeMs: Math.round(prosek[0]?.prosek || 0),
      sourceBreakdown: izvori.reduce((acc, x) => ({ ...acc, [x._id]: x.count }), {}),
      topRoutes: rute.map((r) => ({ route: r._id, count: r.count }))
    };
  }
}

module.exports = StatsService;
