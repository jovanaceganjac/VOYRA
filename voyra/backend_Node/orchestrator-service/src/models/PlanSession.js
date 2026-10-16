const mongoose = require('mongoose');

const PlanSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },

    // null = gost
    userId: { type: String, default: null },

    requestId: String,
    request: Object,
    response: Object,

    status: { type: String, enum: ['READY', 'FAILED'], default: 'READY', index: true },
    errorCode: String,

    route: { type: String, index: true }, // "BEG-ATH"
    sources: {
      flights: String,
      accommodations: String
    },

    savedTripId: { type: String, default: null },
    durationMs: Number,

    createdAt: { type: Date, default: Date.now },

    // Apsolutni datum brisanja: READY +24h, FAILED +7 dana
    expiresAt: Date
  },
  { timestamps: false }
);

// Jedan TTL indeks nad apsolutnim datumom pokriva oba roka.
// Kolekcija sadrzi samo sesije, pa TTL ne moze da obrise nista drugo.
PlanSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

PlanSessionSchema.index({ createdAt: -1 });
PlanSessionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('PlanSession', PlanSessionSchema, 'plan_sessions');
