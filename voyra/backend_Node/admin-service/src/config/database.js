const mongoose = require('mongoose');

/** Konekcija ka admin_db (audit logovi i statistika sistema). */
const connectDB = async () => {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    'mongodb://localhost:27017/admin_db';

  try {
    console.log(`[ADMIN_SERVICE] Povezivanje na MongoDB: ${uri}`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('[ADMIN_SERVICE] MongoDB konekcija uspesna');
    return true;
  } catch (err) {
    console.error('[ADMIN_SERVICE] MongoDB greska:', err.message);
    return false;
  }
};

module.exports = connectDB;
