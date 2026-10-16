const mongoose = require('mongoose');

/** Konekcija ka notifications_db. */
const connectDB = async () => {
  const uri =
    process.env.MONGODB_URI ||
    process.env.NOTIFICATION_DB_URL ||
    'mongodb://localhost:27017/notifications_db';

  try {
    console.log(`[NOTIFICATION_SERVICE] Povezivanje na MongoDB: ${uri}`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('[NOTIFICATION_SERVICE] MongoDB konekcija uspesna');
    return true;
  } catch (err) {
    console.error('[NOTIFICATION_SERVICE] MongoDB greska:', err.message);
    return false;
  }
};

module.exports = connectDB;
