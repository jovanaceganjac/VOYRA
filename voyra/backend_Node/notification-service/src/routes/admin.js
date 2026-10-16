const express = require('express');
const { verifyAdmin } = require('../middleware/auth');
const NotificationService = require('../services/NotificationService');

const router = express.Router();
const service = new NotificationService();

// GET /api/admin/notifications - sve notifikacije u sistemu
router.get('/notifications', verifyAdmin, async (req, res, next) => {
  try {
    const { userId, status, type, from, to, page, limit } = req.query;

    const r = await service.listNotifications({ userId, status, type, from, to, page, limit });

    res.json({ success: true, ...r, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notifications/stats - statistika cele instalacije
router.get('/notifications/stats', verifyAdmin, async (req, res, next) => {
  try {
    const stats = await service.getStats(null);
    res.json({ success: true, ...stats, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
