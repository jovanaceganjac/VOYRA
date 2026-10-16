const mongoose = require('mongoose');

/**
 * Uspostavlja konekciju ka integration_db (kes spoljnih API poziva).
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/integration_db';

  try {
    console.log(`[INTEGRATION_SERVICE] Povezivanje na MongoDB: ${uri}`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('[INTEGRATION_SERVICE] MongoDB konekcija uspesna');
    return true;
  } catch (err) {
    console.error('[INTEGRATION_SERVICE] MongoDB greska:', err.message);
    return false;
  }
};

module.exports = connectDB;
