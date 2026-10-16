const AuditLog = require('../models/AuditLog');

/**
 * Upisivanje i citanje audit logova.
 *
 * Logovanje NIKAD ne sme da obori akciju koja se loguje - zato se
 * greska pri upisu samo ispisuje, a ne prosledjuje dalje.
 */
class AuditService {
  /**
   * @param {object} zapis - {action, userId, adminId, target, oldValue,
   *                          newValue, ipAddress, userAgent, status, errorMessage}
   */
  async log(zapis) {
    try {
      await AuditLog.create({ ...zapis, timestamp: new Date() });
    } catch (err) {
      console.error('[AUDIT_SERVICE] Greska pri logovanju:', err.message);
    }
  }

  /** Kraci poziv iz ruta: uspesna akcija. */
  async logSuccess(action, req, { userId, target, oldValue, newValue } = {}) {
    return this.log({
      action,
      userId,
      adminId: req.user?.id,
      target,
      oldValue,
      newValue,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS'
    });
  }

  /** Kraci poziv iz ruta: neuspesna akcija (ostaje u bazi sa razlogom). */
  async logFailure(action, req, errorMessage, { userId, target } = {}) {
    return this.log({
      action,
      userId,
      adminId: req.user?.id,
      target,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'FAILURE',
      errorMessage
    });
  }

  async getLogs(filter = {}, limit = 100) {
    const upit = {};

    if (filter.action) upit.action = filter.action;
    if (filter.userId) upit.userId = filter.userId;
    if (filter.adminId) upit.adminId = filter.adminId;
    if (filter.status) upit.status = filter.status;

    if (filter.dateFrom || filter.dateTo) {
      upit.timestamp = {};
      if (filter.dateFrom) upit.timestamp.$gte = new Date(filter.dateFrom);
      if (filter.dateTo) upit.timestamp.$lte = new Date(filter.dateTo);
    }

    return AuditLog.find(upit)
      .sort({ timestamp: -1 })
      .limit(Math.min(limit, 500));
  }

  /** Broj akcija po tipu u poslednjih 24h. */
  async getStatistics() {
    const pre24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return AuditLog.aggregate([
      { $match: { timestamp: { $gte: pre24h } } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          uspesnih: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } },
          neuspesnih: { $sum: { $cond: [{ $eq: ['$status', 'FAILURE'] }, 1, 0] } }
        }
      },
      { $sort: { count: -1 } }
    ]);
  }
}

module.exports = AuditService;
