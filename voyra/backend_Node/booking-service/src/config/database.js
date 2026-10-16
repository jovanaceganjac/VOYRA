const mongoose = require('mongoose');

/** Konekcija ka booking_db (rezervacije i placanja). */
const connectDB = async () => {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    'mongodb://localhost:27017/booking_db';

  try {
    console.log(`[BOOKING_SERVICE] Povezivanje na MongoDB: ${uri}`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('[BOOKING_SERVICE] MongoDB konekcija uspesna');

    /*
     * Indeksi se usaglasavaju sa modelom.
     *
     * Mongoose sam pravi indekse koji ne postoje, ali NE menja postojeci
     * indeks istog naziva. Kada je `aktivnaZaPutovanje_1` iz ranije verzije
     * napravljen kao `sparse`, otkazivanje druge rezervacije u toj bazi
     * pada na duplikat `null` vrednosti. `syncIndexes` stari indeks brise i
     * pravi parcijalni, pa se baza ne mora rucno cistiti.
     */
    const Booking = require('../models/Booking');
    await Booking.syncIndexes();

    return true;
  } catch (err) {
    console.error('[BOOKING_SERVICE] MongoDB greska:', err.message);
    return false;
  }
};

module.exports = connectDB;
