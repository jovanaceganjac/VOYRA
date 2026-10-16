const mongoose = require('mongoose');

const TTL = parseInt(process.env.AUDIT_LOG_TTL, 10) || 7776000; // 90 dana

const AuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        'LOGIN', 'LOGOUT', 'REGISTER', 'CREATE_TRIP', 'BOOK_TRIP',
        'UPDATE_USER_STATUS', 'DELETE_USER', 'CHANGE_USER_ROLE',
        'ADMIN_LOGIN', 'ADMIN_ACTION', 'PLAN_TRIP',
        // Korisnik sam menja lozinku - bez ijednog podatka o njoj
        'CHANGE_PASSWORD',
        // Rucna izmena plana i ponovno generisanje (spec §4.6)
        'EDIT_PLAN', 'REGENERATE_PLAN',
        // Odluka o zahtevu za registraciju (spec §3.3) - izdvojena iz
        // UPDATE_USER_STATUS, da se u zapisima vidi bas odluka
        'APPROVE_REGISTRATION', 'REJECT_REGISTRATION',
        'BLOCK_USER', 'UNBLOCK_USER',
        // Sadrzaj koji uredjuje administrator (spec §3.3)
        'CREATE_DESTINATION', 'UPDATE_DESTINATION', 'DELETE_DESTINATION',
        'REORDER_DESTINATIONS',
        'CREATE_ATTRACTION', 'UPDATE_ATTRACTION', 'DELETE_ATTRACTION',
        'CREATE_CATEGORY', 'UPDATE_CATEGORY', 'DELETE_CATEGORY'
      ],
      required: true,
      index: true
    },

    userId: { type: String, index: true },

    // Ko je izvrsio akciju, ako je to bio admin
    adminId: { type: String, index: true },

    // Nad cime je akcija izvrsena
    target: { type: String },

    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,

    // BEZ `index: true` - obican indeks na istom kljucu bi sprecio
    // kreiranje TTL indeksa nize (MongoDB ne pravi dva indeksa sa
    // istim kljucem, a razlicitim opcijama)
    timestamp: { type: Date, default: Date.now },

    ipAddress: String,
    userAgent: String,

    status: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS' },
    errorMessage: String
  },
  { timestamps: false }
);

// TTL ide na `timestamp` - sema nema `createdAt` jer je timestamps iskljucen,
// pa bi indeks na createdAt bio nad nepostojecim poljem i nista ne bi brisao.
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: TTL });

// Najcesci upit: logovi jednog admina/akcije, najnoviji prvi
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ adminId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema, 'audit_logs');
