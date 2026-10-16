/**
 * npm run merenje:plan
 *
 * Meri POST /v1/plan kraj-do-kraja preko gateway-a (spec §11:
 * < 10 s sa spoljnim pozivima, < 2 s kada su podaci u kesu).
 *
 *   prazan kes: pre svakog merenja se prazne SVE kes kolekcije u
 *               integration_db (i `attraction_details_cache`, koju
 *               POST /cache/clear ne dira), pa svaki poziv ide ka API-ju
 *   topao kes:  isti zahtev odmah posle toga, bez praznjenja
 *
 * Po 3 merenja za BEG->ATH i BEG->OPO. Radi nad pokrenutim razvojnim
 * stekom, sa kljucevima koji su upisani u integration-service/.env.
 * Kljucevi se nigde ne ispisuju; brisu se samo kes zapisi.
 */
const path = require('path');

const INT = path.join(__dirname, '..', 'backend_Node', 'integration-service');
require(path.join(INT, 'node_modules', 'dotenv')).config({ path: path.join(INT, '.env') });
const { MongoClient } = require(path.join(INT, 'node_modules', 'mongodb'));

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/integration_db';
const PONAVLJANJA = 3;

const datum = (dana) => new Date(Date.now() + dana * 864e5).toISOString().slice(0, 10);

const zahtev = (to) => ({
  from: 'BEG',
  to,
  checkIn: datum(30),
  checkOut: datum(34),
  passengers: 1,
  preferences: {
    transportPriority: 'balans',
    pace: 'intenzivan',
    interests: ['kultura', 'muzeji']
  }
});

async function isprazniKes(db) {
  const kolekcije = (await db.listCollections().toArray())
    .map((k) => k.name)
    .filter((n) => n.endsWith('_cache'));

  let obrisano = 0;
  for (const n of kolekcije) obrisano += (await db.collection(n).deleteMany({})).deletedCount;

  return obrisano;
}

async function jednoMerenje(telo) {
  const pocetak = process.hrtime.bigint();
  const odgovor = await fetch(`${GATEWAY}/v1/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(telo)
  });
  const json = await odgovor.json();
  const ms = Number(process.hrtime.bigint() - pocetak) / 1e6;

  const plan = json.itinerary || {};
  const izvori = plan.meta?.sources || {};
  const dani = (plan.itinerary || []).map((d) => (d.attractions || []).length);

  return { http: odgovor.status, status: json.status, ms, izvori, dani, timings: json.timings };
}

const fmt = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

async function main() {
  const klijent = new MongoClient(MONGO);
  await klijent.connect();
  const db = klijent.db();

  const redovi = [];

  for (const to of ['ATH', 'OPO']) {
    for (let i = 1; i <= PONAVLJANJA; i++) {
      const obrisano = await isprazniKes(db);
      const hladno = await jednoMerenje(zahtev(to));
      const toplo = await jednoMerenje(zahtev(to));

      redovi.push({ to, i, obrisano, hladno, toplo });
      console.log(
        `BEG→${to} #${i}: prazan ${fmt(hladno.ms)} (HTTP ${hladno.http}, ${hladno.status}), ` +
          `topao ${fmt(toplo.ms)} (HTTP ${toplo.http}) | izvori ${JSON.stringify(hladno.izvori)} ` +
          `→ ${JSON.stringify(toplo.izvori)} | dani ${hladno.dani.join(',')} | ` +
          `timings ${JSON.stringify(hladno.timings)} / ${JSON.stringify(toplo.timings)} | ` +
          `obrisano kes zapisa ${obrisano}`
      );
    }
  }

  await klijent.close();

  console.log('\n| Ruta | Merenje | Prazan keš | Topao keš |');
  console.log('|---|---:|---:|---:|');
  for (const r of redovi) {
    console.log(`| BEG→${r.to} | ${r.i} | ${fmt(r.hladno.ms)} | ${fmt(r.toplo.ms)} |`);
  }

  const ok = redovi.every((r) => r.hladno.http === 200 && r.toplo.http === 200);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
