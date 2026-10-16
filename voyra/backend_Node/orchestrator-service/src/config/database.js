const mongoose = require('mongoose');

const connectDB = async () => {
  const uri =
    process.env.MONGODB_ORCHESTRATOR_DB ||
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/orchestrator_db';

  try {
    console.log(`[ORCHESTRATOR] Povezivanje na MongoDB: ${uri}`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('[ORCHESTRATOR] MongoDB konekcija uspesna');
    return true;
  } catch (err) {
    console.error('[ORCHESTRATOR] MongoDB greska:', err.message);
    return false;
  }
};

module.exports = connectDB;
