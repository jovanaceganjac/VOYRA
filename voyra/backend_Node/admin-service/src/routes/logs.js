const express = require('express');
const { verifyAdmin } = require('../middleware/auth');
const AuditService = require('../services/AuditService');

const router = express.Router();
const auditService = new AuditService();

// GET /api/admin/logs/statistics - mora PRE /:nesto, inace bi ga pokupila druga ruta
router.get('/statistics', verifyAdmin, async (req, res, next) => {
  try {
    const stats = await auditService.getStatistics();
    res.json({ success: true, data: stats, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/logs?action=&userId=&adminId=&status=&dateFrom=&dateTo=&limit=
router.get('/', verifyAdmin, async (req, res, next) => {
  try {
    const { action, userId, adminId, status, dateFrom, dateTo, limit = 100 } = req.query;

    const logs = await auditService.getLogs(
      { action, userId, adminId, status, dateFrom, dateTo },
      parseInt(limit, 10) || 100
    );

    res.json({ success: true, data: logs, count: logs.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
