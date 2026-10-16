const mongoose = require('mongoose');
const { TTL } = require('../models/CacheModels');

/**
 * MongoDB NE menja postojeci TTL indeks kada se `expireAfterSeconds`
 * promeni u kodu - indeks se kreira samo ako ga jos nema. Bez ovoga bi
 * kes i dalje trajao po starim vrednostima (letovi 1 h umesto 15 min),
 * a da nista u logu ne kaze da vrednosti iz specifikacije ne vaze.
 *
 * Zato se pri pokretanju uporedi stvarno stanje indeksa sa TTL tabelom
 * i po potrebi pozove `collMod`. Idempotentno: kada su vrednosti iste,
 * ne radi nista.
 */
const KOLEKCIJE = [
  ['flights_cache', TTL.flights],
  ['accommodations_cache', TTL.accommodations],
  ['attractions_cache', TTL.attractions],
  ['exchange_rates_cache', TTL.rates],
  ['geocode_cache', TTL.geocode]
];

const uskladiTtlIndekse = async () => {
  const db = mongoose.connection.db;
  if (!db) return;

  for (const [naziv, ocekivano] of KOLEKCIJE) {
    try {
      const kolekcije = await db.listCollections({ name: naziv }).toArray();
      if (kolekcije.length === 0) continue;

      const indeksi = await db.collection(naziv).indexes();
      const ttlIndeks = indeksi.find((i) => i.expireAfterSeconds !== undefined);

      if (!ttlIndeks || ttlIndeks.expireAfterSeconds === ocekivano) continue;

      await db.command({
        collMod: naziv,
        index: { name: ttlIndeks.name, expireAfterSeconds: ocekivano }
      });

      console.log(
        `[INTEGRATION_SERVICE] TTL ${naziv}: ` +
        `${ttlIndeks.expireAfterSeconds}s -> ${ocekivano}s`
      );
    } catch (err) {
      // Neuspela izmena indeksa ne sme da spreci pokretanje servisa
      console.warn(`[INTEGRATION_SERVICE] TTL ${naziv} nije usklađen: ${err.message}`);
    }
  }
};

module.exports = { uskladiTtlIndekse };
