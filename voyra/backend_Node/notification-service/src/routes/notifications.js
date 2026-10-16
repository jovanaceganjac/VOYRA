const express = require('express');
const { verifyToken, verifyInternal } = require('../middleware/auth');
const NotificationService = require('../services/NotificationService');

const router = express.Router();
const service = new NotificationService();

/** Kontekst pristupa: admin vidi sve, korisnik samo svoje. */
const kontekst = (req) => ({
  userId: req.user?.uloga === 'admin' ? undefined : req.user?.id,
  jeAdmin: req.user?.uloga === 'admin' || req.internalCall === true
});

// POST /api/notifications/send - interni poziv (X-Internal-Key ili JWT)
router.post('/send', verifyInternal, async (req, res, next) => {
  try {
    const { notification, duplicate } = await service.send(req.body);

    res.status(duplicate ? 200 : 201).json({
      success: true,
      data: {
        _id: notification._id,
        status: notification.status,
        channel: notification.channel,
        type: notification.type,
        recipient: { email: notification.recipient.email, phone: notification.recipient.phone },
        subject: notification.subject || null,
        scheduledFor: notification.scheduledFor,
        sentAt: notification.sentAt || null
      },
      duplicate,
      statusCode: duplicate ? 200 : 201
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/stats - PRE /:id, inace bi "stats" bilo protumaceno kao ID
router.get('/stats', verifyToken, async (req, res, next) => {
  try {
    const stats = await service.getStats(req.user.id);
    res.json({ success: true, ...stats, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications - moje notifikacije (paginirano)
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { status, type, from, to, page, limit } = req.query;

    const r = await service.listNotifications({
      userId: req.user.id,
      status,
      type,
      from,
      to,
      page,
      limit
    });

    res.json({ success: true, ...r, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/:id - detalji + logovi
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const { notification, logs } = await service.getNotification(req.params.id, kontekst(req));

    // Duzina se cita PRE toObject(): posle njega Buffer postaje BSON
    // Binary objekat kome je `length` funkcija, a ne broj.
    const velicinaPriloga = notification.attachment?.content?.length;

    const obj = notification.toObject();

    // Sadrzaj priloga moze biti megabajt - salje se samo opis
    if (obj.attachment?.content) {
      obj.attachment = {
        filename: obj.attachment.filename,
        contentType: obj.attachment.contentType,
        size: velicinaPriloga ?? null
      };
    }

    res.json({ success: true, data: { ...obj, logs }, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/retry
router.post('/:id/retry', verifyToken, async (req, res, next) => {
  try {
    const n = await service.retry(req.params.id, kontekst(req));

    res.json({
      success: true,
      data: { _id: n._id, status: n.status, retryCount: n.retryCount },
      statusCode: 200
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/cancel
router.patch('/:id/cancel', verifyToken, async (req, res, next) => {
  try {
    const n = await service.cancel(req.params.id, kontekst(req));
    res.json({ success: true, data: { _id: n._id, status: n.status }, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
