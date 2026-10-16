const express = require('express');
const { verifyAdmin } = require('../middleware/auth');
const AdminService = require('../services/AdminService');

const router = express.Router();
const adminService = new AdminService();

// GET /api/admin/stats - zdravlje i brojke sistema
router.get('/', verifyAdmin, async (req, res, next) => {
  try {
    const stats = await adminService.getSystemStats(req.token);
    res.json({ success: true, data: stats, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
