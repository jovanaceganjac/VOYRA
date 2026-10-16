/**
 * Migracija statusa putovanja na vrednosti iz specifikacije §4.9.
 *
 *   npm run migrate:statusi
 *
 * Stara sema: draft | saved | booked
 * Nova sema:  NACRT | REZERVISANO | OTKAZANO | ZAVRSENO
 *
 * `draft` i `saved` postaju NACRT - oba znace "sacuvan plan bez
 * rezervacije", a razlika izmedju njih vise ne postoji. `booked`
 * postaje REZERVISANO.
 *
 * Idempotentno: drugo pokretanje ne menja nista, jer se trazi samo ono
 * sto je jos u staroj semi.
 */
require('dotenv').config();

const mongoose = require('mongoose');

const MAPA = {
  draft: 'NACRT',
  saved: 'NACRT',
  booked: 'REZERVISANO'
};

const migriraj = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trips_db';

  console.log(`[MIGRACIJA] Baza: ${uri}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  // Zaobilazi se model: stara vrednost vise nije u enum-u, pa bi
  // validacija odbila i samo citanje kroz model
  const kolekcija = mongoose.connection.db.collection('trips');

  const pre = await kolekcija
    .aggregate([{ $group: { _id: '$status', broj: { $sum: 1 } } }])
    .toArray();

  console.log('[MIGRACIJA] Pre:', pre.map((r) => `${r._id}=${r.broj}`).join(', ') || '(prazno)');

  let ukupno = 0;

  for (const [staro, novo] of Object.entries(MAPA)) {
    const r = await kolekcija.updateMany({ status: staro }, { $set: { status: novo } });

    if (r.modifiedCount > 0) {
      console.log(`[MIGRACIJA] ${staro} -> ${novo}: ${r.modifiedCount}`);
    }

    ukupno += r.modifiedCount;
  }

  // Zapis bez statusa (ili sa nepoznatim) dobija NACRT, da ne ostane
  // van sheme - inace ga citanje kroz model ne bi validiralo
  const ostali = await kolekcija.updateMany(
    { status: { $nin: ['NACRT', 'REZERVISANO', 'OTKAZANO', 'ZAVRSENO'] } },
    { $set: { status: 'NACRT' } }
  );

  if (ostali.modifiedCount > 0) {
    console.log(`[MIGRACIJA] nepoznat status -> NACRT: ${ostali.modifiedCount}`);
    ukupno += ostali.modifiedCount;
  }

  const posle = await kolekcija
    .aggregate([{ $group: { _id: '$status', broj: { $sum: 1 } } }])
    .toArray();

  console.log('[MIGRACIJA] Posle:', posle.map((r) => `${r._id}=${r.broj}`).join(', ') || '(prazno)');
  console.log(`[MIGRACIJA] Izmenjeno zapisa: ${ukupno}`);

  await mongoose.disconnect();

  return ukupno;
};

if (require.main === module) {
  migriraj()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MIGRACIJA] Greska:', err.message);
      process.exit(1);
    });
}

module.exports = { migriraj, MAPA };
