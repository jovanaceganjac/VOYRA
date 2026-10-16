const mongoose = require('mongoose');

const TTL = parseInt(process.env.SYSTEM_STATS_TTL, 10) || 15552000; // 180 dana

const SystemStatsSchema = new mongoose.Schema(
  {
    // BEZ `index: true` - vidi komentar u AuditLog.js
    timestamp: { type: Date, default: Date.now },

    totalUsers: Number,
    activeUsers: Number,   // prijava u poslednjih 24h
    totalTrips: Number,
    totalBookings: Number,
    averageRating: Number,

    apiHealth: {
      user: { status: String, lastCheck: Date, responseTime: Number },
      trip: { status: String, lastCheck: Date, responseTime: Number },
      integration: { status: String, lastCheck: Date, responseTime: Number }
    },

    responseTime: Number, // ms
    errorRate: Number     // %
  },
  { timestamps: true }
);

SystemStatsSchema.index({ timestamp: 1 }, { expireAfterSeconds: TTL });

module.exports = mongoose.model('SystemStats', SystemStatsSchema, 'system_stats');
