const mongoose = require('mongoose');

/**
 * Uspostavlja konekciju ka users_db.
 * Vraca true/false umesto da baca - index.js odlucuje da li da startuje server.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/users_db';

  try {
    console.log(`[USER_SERVICE] Povezivanje na MongoDB: ${uri}`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('[USER_SERVICE] MongoDB konekcija uspesna');
    return true;
  } catch (err) {
    console.error('[USER_SERVICE] MongoDB greska:', err.message);
    return false;
  }
};

module.exports = connectDB;
