const express = require('express');
const AuditService = require('../services/AuditService');

const router = express.Router();
const auditService = new AuditService();

/** Poziv servis-servis sa zajednickim kljucem iz .env-a. */
const verifyInternalKey = (req, res, next) => {
  if (req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Neispravan ili nedostajuci X-Internal-Key',
      statusCode: 401
    });
  }
  next();
};

/**
 * POST /api/admin/internal/audit - INTERNO
 * Upis audit zapisa iz drugog servisa (npr. orchestrator, PLAN_TRIP).
 */
router.post('/audit', verifyInternalKey, async (req, res, next) => {
  try {
    const { action, userId, target, status, metadata, errorMessage } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'action je obavezan',
        statusCode: 400
      });
    }

    await auditService.log({
      action,
      userId: userId || undefined,
      target,
      newValue: metadata,
      ipAddress: req.ip,
      status: status || 'SUCCESS',
      errorMessage
    });

    res.status(201).json({ success: true, statusCode: 201 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
