const mongoose = require('mongoose');

/**
 * Konekcija ka trips_db (putovanja korisnika).
 * Podrzava i MONGODB_URI (ostali servisi) i MONGODB_URL.
 */
const connectDB = async () => {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    'mongodb://localhost:27017/trips_db';

  try {
    console.log(`[TRIP_SERVICE] Povezivanje na MongoDB: ${uri}`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('[TRIP_SERVICE] MongoDB konekcija uspesna');
    return true;
  } catch (err) {
    console.error('[TRIP_SERVICE] MongoDB greska:', err.message);
    return false;
  }
};

module.exports = connectDB;
