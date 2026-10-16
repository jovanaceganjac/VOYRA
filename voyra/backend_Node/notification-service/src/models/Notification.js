const mongoose = require('mongoose');

const TIPOVI = [
  'BOOKING_CONFIRMED', 'BOOKING_FAILED', 'BOOKING_CANCELLED',
  'TRIP_SAVED', 'TRIP_DELETED',
  // Odluka administratora o nalogu (spec §3.3, §4.10)
  'REGISTRATION_APPROVED', 'REGISTRATION_REJECTED',
  'ACCOUNT_BLOCKED', 'ACCOUNT_UNBLOCKED',
  // Bezbednosna obavestenja samom korisniku (§4.10)
  'PASSWORD_CHANGED',
  'ADMIN_ACTION'
];

/*
 * PAYMENT_FAILED i PAYMENT_REFUNDED su uklonjeni: placanje je
 * izbaceno ranije (aplikacija ne naplacuje, let se rezervise kod
 * prevoznika), pa su ta dva tipa ostala bez posiljaoca.
 */

const NotificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TIPOVI, required: true, index: true },
    channel: { type: String, enum: ['email', 'sms', 'push'], required: true },

    recipient: {
      userId: { type: String, index: true },
      email: String,
      phone: String
    },

    subject: String,
    body: String,

    templateName: String,
    templateData: { type: Object, default: {} },

    attachment: {
      filename: String,
      content: Buffer,
      contentType: String
    },

    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED', 'BOUNCED', 'CANCELLED'],
      default: 'PENDING',
      index: true
    },

    sentAt: Date,
    failureReason: String,

    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: parseInt(process.env.MAX_RETRIES, 10) || 3 },

    // null = salje se odmah; datum u buducnosti = ceka
    scheduledFor: Date,

    // Worker ne sme dva puta da uzme isti zapis
    lockedAt: Date,

    // TTL: apsolutni datum brisanja, razlicit za SENT (7d) i FAILED (30d)
    expiresAt: Date,

    metadata: {
      bookingId: String,
      tripId: String,
      adminId: String,
      source: String
    },

    // Sprecava dve iste notifikacije za isti dogadjaj (test 16)
    dedupeKey: String
  },
  { timestamps: true }
);

// TTL sa expireAfterSeconds: 0 brise dokument kada `expiresAt` prodje.
// Tako jedan indeks pokriva i 7 dana za SENT i 30 dana za FAILED.
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Worker cita PENDING po redu zakazivanja
NotificationSchema.index({ status: 1, scheduledFor: 1 });
NotificationSchema.index({ 'recipient.userId': 1, createdAt: -1 });

// Jedinstveno samo kada dedupeKey postoji - obicne notifikacije ga nemaju
NotificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Notification', NotificationSchema, 'notifications');
module.exports.TIPOVI = TIPOVI;
