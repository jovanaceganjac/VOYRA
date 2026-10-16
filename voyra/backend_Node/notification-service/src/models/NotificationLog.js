const mongoose = require('mongoose');

const TTL_DANA = parseInt(process.env.TTL_LOGS_DAYS, 10) || 90;

const NotificationLogSchema = new mongoose.Schema({
  notificationId: { type: String, required: true, index: true },
  action: { type: String, enum: ['SENT', 'FAILED', 'RETRIED', 'BOUNCED', 'CANCELLED'], required: true },
  timestamp: { type: Date, default: Date.now },
  details: String,
  externalId: String
});

// Logovi se cuvaju duze od samih notifikacija - zbog revizije
NotificationLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: TTL_DANA * 24 * 60 * 60 });

module.exports = mongoose.model('NotificationLog', NotificationLogSchema, 'notification_logs');
