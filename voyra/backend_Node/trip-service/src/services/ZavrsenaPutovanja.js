const Trip = require('../models/Trip');

/** Podrazumevano na svakih sat vremena. */
const INTERVAL_MS = parseInt(process.env.COMPLETED_JOB_INTERVAL_MS, 10) || 60 * 60 * 1000;

/**
 * Pozadinski posao koji rezervisana putovanja sa proslim datumom
 * povratka prevodi u ZAVRSENO (spec §4.9: "ZAVRSENO - automatski nakon
 * datuma povratka").
 *
 * Dira SAMO REZERVISANO: nacrt koji je ostao neiskoriscen nije zavrseno
 * putovanje, a otkazano i zavrseno su konacna stanja.
 */
const oznaciZavrsena = async () => {
  const sada = new Date();

  const rezultat = await Trip.updateMany(
    { status: 'REZERVISANO', checkOut: { $lt: sada } },
    { $set: { status: 'ZAVRSENO' } }
  );

  if (rezultat.modifiedCount > 0) {
    console.log(`[TRIP_SERVICE] Automatski ZAVRSENO: ${rezultat.modifiedCount} putovanja`);
  }

  return rezultat.modifiedCount;
};

/**
 * Pokrece posao odmah (da se zaostalo ne ceka ceo sat) pa na interval.
 * `unref` sprecava da tajmer drzi proces u zivotu pri gasenju servisa.
 */
const pokreniPosao = () => {
  oznaciZavrsena().catch((err) =>
    console.error('[TRIP_SERVICE] Posao ZAVRSENO neuspesan:', err.message)
  );

  const tajmer = setInterval(() => {
    oznaciZavrsena().catch((err) =>
      console.error('[TRIP_SERVICE] Posao ZAVRSENO neuspesan:', err.message)
    );
  }, INTERVAL_MS);

  tajmer.unref();

  console.log(
    `[TRIP_SERVICE] Posao "automatski ZAVRSENO" radi na ${Math.round(INTERVAL_MS / 60000)} min`
  );

  return tajmer;
};

module.exports = { oznaciZavrsena, pokreniPosao, INTERVAL_MS };
