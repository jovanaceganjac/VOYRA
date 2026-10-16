/**
 * Popunjava `fromCity` / `toCity` za putovanja sacuvana ranije.
 *
 *   npm run migrate:gradovi
 *
 * IDEMPOTENTNA: dira samo putovanja kojima polje nedostaje, pa drugo
 * pokretanje ne menja nista. Gradovi se traze po IATA kodu iz `from`
 * i `to`, koji stara putovanja i dalje nose.
 */
require('dotenv').config();

const mongoose = require('mongoose');

const Trip = require('../src/models/Trip');
const CityService = require('../src/services/CityService');

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/trips_db';

(async () => {
  await mongoose.connect(MONGO);

  const cities = new CityService();

  const bezGradova = await Trip.find({
    $or: [{ fromCity: null }, { toCity: null }, { fromCity: { $exists: false } }]
  }).lean();

  console.log(`[MIGRACIJA] Putovanja bez gradova: ${bezGradova.length}`);

  const kes = new Map();

  /** Grad po IATA kodu, sa kesom - ista ruta se ponavlja. */
  const grad = async (iata) => {
    const kod = String(iata || '').toUpperCase();
    if (!kod) return null;

    if (kes.has(kod)) return kes.get(kod);

    const g = await cities.poIataKodu(kod).catch(() => null);

    const zapis = g
      ? {
          id: g.id,
          naziv: g.naziv,
          drzava: g.drzava,
          drzavaNaziv: g.drzavaNaziv,
          lat: g.lat,
          lon: g.lon,
          aerodrom: g.aerodrom
            ? {
                iata: g.aerodrom.iata,
                naziv: g.aerodrom.naziv,
                udaljenostKm: g.aerodrom.udaljenostKm,
                izvanGrada: g.aerodrom.udaljenostKm > 30
              }
            : null
        }
      : null;

    kes.set(kod, zapis);

    return zapis;
  };

  let azurirano = 0;
  let bezPara = 0;

  for (const trip of bezGradova) {
    const izmene = {};

    if (!trip.fromCity) {
      const g = await grad(trip.from);
      if (g) izmene.fromCity = g;
    }

    if (!trip.toCity) {
      const g = await grad(trip.to);
      if (g) izmene.toCity = g;
    }

    if (Object.keys(izmene).length === 0) {
      bezPara++;
      continue;
    }

    await Trip.updateOne({ _id: trip._id }, { $set: izmene });
    azurirano++;
  }

  console.log(`[MIGRACIJA] Azurirano: ${azurirano}`);

  if (bezPara > 0) {
    console.log(
      `[MIGRACIJA] Bez para u bazi gradova: ${bezPara} ` +
        '(IATA kod van obuhvata - putovanje i dalje radi preko `from`/`to`)'
    );
  }

  const ukupno = await Trip.countDocuments();
  const sa = await Trip.countDocuments({ toCity: { $ne: null } });

  console.log(`[MIGRACIJA] Putovanja sa gradovima: ${sa} / ${ukupno}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('[MIGRACIJA] Neuspeh:', err.message);
  process.exit(1);
});
