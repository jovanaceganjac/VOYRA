#!/usr/bin/env node
/**
 * `npm run test:sve` - SVI TESTOVI JEDNOM KOMANDOM.
 *
 * Redom:
 *   1. prekida ako razvojni servisi već drže portove;
 *   2. jedinični testovi svih devet servisa (bez baze i mreže);
 *   3. servisi nad `*_db_test` bazama, u MOCK režimu, pa čekanje `/health`;
 *   4. uvoz gradova, seed kategorija i destinacija, demo nalozi;
 *   5. sve `proba:*` skripte;
 *   6. frontend Karma testovi;
 *   7. Selenium E2E nad frontendom na zasebnom portu;
 *   8. gašenje servisa i brisanje test baza;
 *   9. tabela rezultata.
 *
 * RAZVOJNI PODACI SE NE DIRAJU. Svakom servisu se prepisuje svaka
 * `mongodb://` adresa tako da naziv baze dobije sufiks `_test`, pa test
 * stek radi nad odvojenim bazama. Broj zapisa u razvojnim bazama se meri
 * pre i posle i ispisuje, da to ne ostane na reč.
 *
 * Izlazni kod je 0 samo ako sve prođe.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const KOREN = path.resolve(__dirname, '..');
const BACKEND = path.join(KOREN, 'backend_Node');

const SERVISI = [
  { ime: 'api-gateway', port: 4000 },
  { ime: 'user-service', port: 4001 },
  { ime: 'trip-service', port: 4002 },
  { ime: 'integration-service', port: 4003 },
  { ime: 'planner-service', port: 4004 },
  { ime: 'admin-service', port: 4005 },
  { ime: 'booking-service', port: 4006 },
  { ime: 'notification-service', port: 4007 },
  { ime: 'orchestrator-service', port: 4008 }
];

/** Frontend za E2E ide na svoj port, da se ne pomeša sa razvojnim (4200). */
const FRONTEND_PORT = Number(process.env.TEST_FRONTEND_PORT) || 4201;

const MONGO = process.env.TEST_MONGO_URL || 'mongodb://localhost:27017';

/** Razvojne baze čiji se broj zapisa meri pre i posle. */
const RAZVOJNE_BAZE = [
  'users_db',
  'trips_db',
  'booking_db',
  'admin_db',
  'notifications_db',
  'integration_db',
  'orchestrator_db'
];

// ===========================================================================
// Ispis
// ===========================================================================

const BOJE = {
  siva: (t) => `\x1b[90m${t}\x1b[0m`,
  zelena: (t) => `\x1b[32m${t}\x1b[0m`,
  crvena: (t) => `\x1b[31m${t}\x1b[0m`,
  zuta: (t) => `\x1b[33m${t}\x1b[0m`,
  jaka: (t) => `\x1b[1m${t}\x1b[0m`
};

const naslov = (t) => console.log(`\n${BOJE.jaka(`=== ${t} ===`)}`);
const korak = (t) => console.log(BOJE.siva(`  ${t}`));

// ===========================================================================
// Pomoćno
// ===========================================================================

const portZauzet = (port) =>
  new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' });

    s.on('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(1000, () => {
      s.destroy();
      resolve(false);
    });
  });

const cekaj = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pokreće komandu i vraća `{ ok, izlaz, trajanjeMs }`.
 * Izlaz se pamti, a ispisuje samo kada padne - inače bi tabela nestala u logu.
 */
const pokreni = (komanda, argumenti, { cwd, env = {}, tiho = true, timeoutMs = 20 * 60 * 1000 } = {}) =>
  new Promise((resolve) => {
    const pocetak = Date.now();
    const p = spawn(komanda, argumenti, {
      cwd,
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
      windowsHide: true
    });

    let izlaz = '';
    const primi = (d) => {
      izlaz += d.toString();
      if (!tiho) process.stdout.write(d);
    };

    p.stdout.on('data', primi);
    p.stderr.on('data', primi);

    const sat = setTimeout(() => {
      izlaz += `\n[test:sve] prekinuto posle ${Math.round(timeoutMs / 1000)} s\n`;
      p.kill('SIGKILL');
    }, timeoutMs);

    p.on('close', (kod) => {
      clearTimeout(sat);
      resolve({ ok: kod === 0, kod, izlaz, trajanjeMs: Date.now() - pocetak });
    });

    p.on('error', (err) => {
      clearTimeout(sat);
      resolve({ ok: false, kod: -1, izlaz: `${izlaz}\n${err.message}`, trajanjeMs: Date.now() - pocetak });
    });
  });

/** `.env` servisa kao objekat (bez menjanja fajla). */
const procitajEnv = (servis) => {
  const p = path.join(BACKEND, servis, '.env');
  const mapa = {};

  if (!fs.existsSync(p)) return mapa;

  for (const linija of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = linija.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) mapa[m[1]] = m[2];
  }

  return mapa;
};

/** `mongodb://host/users_db` -> `mongodb://host/users_db_test` */
const uTestBazu = (adresa) =>
  String(adresa).replace(/(mongodb:\/\/[^/]+\/)([A-Za-z0-9_-]+)/g, (ceo, pre, baza) =>
    baza.endsWith('_test') ? ceo : `${pre}${baza}_test`
  );

// ===========================================================================
// Okruženje test steka
// ===========================================================================

/**
 * SVE promenljive baze, sa test bazom kao vrednošću.
 *
 * Ne izvodi se iz `.env`-a nego se postavlja izričito, i to je bilo
 * neophodno: postojeći razvojni `.env` fajlovi nose samo `MONGODB_URI`, a
 * ostale adrese (`MONGODB_USERS_DB`, `MONGODB_TRIPS_DB`, …) kod čita sa
 * **ugrađenom razvojnom vrednošću** kad promenljive nema. Test stek je zato
 * u prvom prolazu pisao i čitao RAZVOJNE baze: probe su pravile naloge u
 * `users_db`, a user-service ih tražio u `users_db_test`, pa je gateway
 * vraćao `401 TOKEN_REVOKED`.
 */
const TEST_BAZE = {
  MONGODB_USERS_DB: 'users_db_test',
  MONGODB_TRIPS_DB: 'trips_db_test',
  MONGODB_ADMIN_DB: 'admin_db_test',
  MONGODB_NOTIF_DB: 'notifications_db_test',
  MONGODB_ORCHESTRATOR_DB: 'orchestrator_db_test',
  NOTIFICATION_DB_URL: 'notifications_db_test'
};

/** Sopstvena baza servisa (`MONGODB_URI` i stariji `MONGODB_URL`). */
const SOPSTVENA_BAZA = {
  'user-service': 'users_db_test',
  'trip-service': 'trips_db_test',
  'integration-service': 'integration_db_test',
  'admin-service': 'admin_db_test',
  'booking-service': 'booking_db_test',
  'notification-service': 'notifications_db_test',
  'orchestrator-service': 'orchestrator_db_test'
};

/**
 * Okruženje jednog servisa za test stek.
 *
 * - svaka `mongodb://` adresa dobija sufiks `_test`, a promenljive koje u
 *   `.env`-u ne postoje se izričito postavljaju (vidi `TEST_BAZE`);
 * - spoljni ključevi se PRAZNE (mock režim), pa su rezultati deterministični
 *   i ne troši se kvota; granični slučajevi iz §4.8 rade samo u mock režimu;
 * - `TOKEN_VERSION_CACHE_MS=0`, pa opoziv tokena deluje odmah i E2E
 *   scenariji 11 i 12c ne čekaju pola minuta.
 */
const okruzenjeServisa = (servis) => {
  const izEnv = procitajEnv(servis);
  const env = {};

  for (const [k, v] of Object.entries(izEnv)) {
    env[k] = /mongodb:\/\//.test(v) ? uTestBazu(v) : v;
  }

  // Sve baze izričito, da nijedna ne padne na ugrađenu razvojnu vrednost
  for (const [kljuc, baza] of Object.entries(TEST_BAZE)) {
    env[kljuc] = `${MONGO}/${baza}`;
  }

  if (SOPSTVENA_BAZA[servis]) {
    env.MONGODB_URI = `${MONGO}/${SOPSTVENA_BAZA[servis]}`;
    env.MONGODB_URL = env.MONGODB_URI;
  }

  // Proba adaptera radi nad svojom bazom
  env.MONGODB_TEST_URI = `${MONGO}/integration_proba_db_test`;

  for (const kljuc of [
    'DUFFEL_API_KEY',
    'LITEAPI_API_KEY',
    'GEOAPIFY_API_KEY',
    'OPENTRIPMAP_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS'
  ]) {
    env[kljuc] = '';
  }

  env.TOKEN_VERSION_CACHE_MS = '0';
  env.DOCS_ENABLED = 'true';
  env.NODE_ENV = 'test';

  return env;
};

/** Okruženje za skripte koje same pričaju sa servisima (probe, seed). */
const okruzenjeSkripte = (servis) => ({
  ...okruzenjeServisa(servis),
  GATEWAY_URL: `http://localhost:4000`,
  E2E_FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
  E2E_API_URL: 'http://localhost:4000'
});

// ===========================================================================
// Mongo
// ===========================================================================

const mongoose = require(path.join(BACKEND, 'trip-service', 'node_modules', 'mongoose'));

/** Broj zapisa po kolekciji u jednoj bazi. */
const stanjeBaze = async (naziv) => {
  const c = await mongoose.createConnection(`${MONGO}/${naziv}`).asPromise();

  try {
    const kolekcije = await c.db.listCollections().toArray();
    const rezultat = {};

    for (const k of kolekcije.map((x) => x.name).sort()) {
      rezultat[k] = await c.db.collection(k).countDocuments();
    }

    return rezultat;
  } finally {
    await c.close();
  }
};

const stanjeRazvojnih = async () => {
  const stanje = {};
  for (const b of RAZVOJNE_BAZE) stanje[b] = await stanjeBaze(b);
  return stanje;
};

/** Briše sve `*_test` baze koje je test stek napravio. */
const obrisiTestBaze = async () => {
  const c = await mongoose.createConnection(`${MONGO}/admin`).asPromise();

  try {
    const { databases } = await c.db.admin().listDatabases();
    const nase = databases.map((d) => d.name).filter((n) => n.endsWith('_test'));

    for (const n of nase) {
      await c.useDb(n).dropDatabase();
    }

    return nase;
  } finally {
    await c.close();
  }
};

// ===========================================================================
// Pokretanje i gašenje steka
// ===========================================================================

const pokrenuti = [];

const pokreniUPozadini = (naziv, komanda, argumenti, { cwd, env }) => {
  const p = spawn(komanda, argumenti, {
    cwd,
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
    windowsHide: true
  });

  let izlaz = '';
  p.stdout.on('data', (d) => {
    izlaz += d.toString();
  });
  p.stderr.on('data', (d) => {
    izlaz += d.toString();
  });

  const zapis = { naziv, proces: p, dnevnik: () => izlaz };
  pokrenuti.push(zapis);

  return zapis;
};

const ugasiSve = async () => {
  for (const { naziv, proces } of pokrenuti) {
    try {
      if (process.platform === 'win32') {
        await pokreni('taskkill', ['/PID', String(proces.pid), '/T', '/F'], { timeoutMs: 30000 });
      } else {
        proces.kill('SIGTERM');
      }
    } catch (e) {
      console.warn(BOJE.zuta(`  [test:sve] ${naziv} nije ugašen čisto: ${e.message}`));
    }
  }

  pokrenuti.length = 0;

  // Portovi se ne oslobode u istom trenutku
  for (let i = 0; i < 20; i++) {
    const zauzeti = [];

    for (const s of SERVISI) if (await portZauzet(s.port)) zauzeti.push(s.port);
    if (await portZauzet(FRONTEND_PORT)) zauzeti.push(FRONTEND_PORT);

    if (zauzeti.length === 0) return;
    await cekaj(500);
  }
};

const zdrav = async (port) => {
  try {
    const r = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
    return r.status === 200;
  } catch {
    return false;
  }
};

const cekajZdravlje = async (timeoutMs = 90000) => {
  const kraj = Date.now() + timeoutMs;

  while (Date.now() < kraj) {
    const nezdravi = [];

    for (const s of SERVISI) if (!(await zdrav(s.port))) nezdravi.push(s.ime);

    if (nezdravi.length === 0) return { ok: true };
    await cekaj(1000);
  }

  const nezdravi = [];
  for (const s of SERVISI) if (!(await zdrav(s.port))) nezdravi.push(s.ime);

  return { ok: false, nezdravi };
};

const cekajFrontend = async (timeoutMs = 180000) => {
  const kraj = Date.now() + timeoutMs;

  while (Date.now() < kraj) {
    try {
      const r = await fetch(`http://localhost:${FRONTEND_PORT}/`, { signal: AbortSignal.timeout(3000) });
      if (r.status === 200) return true;
    } catch {
      // još se gradi
    }

    await cekaj(2000);
  }

  return false;
};

// ===========================================================================
// Tabela rezultata
// ===========================================================================

const rezultati = [];

const zabelezi = (skup, { ok, izlaz, trajanjeMs }, brojac = null) => {
  const brojevi = brojac ? brojac(izlaz) : { ukupno: null, proslo: null, palo: null };

  rezultati.push({ skup, ok, ...brojevi, trajanjeMs, izlaz });

  const oznaka = ok ? BOJE.zelena('OK  ') : BOJE.crvena('PAD ');
  const broj = brojevi.ukupno !== null ? `${brojevi.proslo}/${brojevi.ukupno}` : '';

  console.log(`  ${oznaka} ${skup.padEnd(34)} ${broj.padStart(9)}  ${(trajanjeMs / 1000).toFixed(1)} s`);

  return ok;
};

/** `# tests`/`# pass`/`# fail` iz `node --test`. */
const brojacNodeTest = (izlaz) => {
  const uzmi = (kljuc) => {
    const m = izlaz.match(new RegExp(`^# ${kljuc} (\\d+)$`, 'm'));
    return m ? Number(m[1]) : null;
  };

  return { ukupno: uzmi('tests'), proslo: uzmi('pass'), palo: uzmi('fail') };
};

/** „OK   …" / „PAD  …" iz naših proba. */
const brojacProbe = (izlaz) => {
  const ok = (izlaz.match(/^OK\s/gm) || []).length;
  const pad = (izlaz.match(/^PAD\s/gm) || []).length;

  return { ukupno: ok + pad, proslo: ok, palo: pad };
};

/** „TOTAL: 184 SUCCESS" iz Karma-e. */
const brojacKarma = (izlaz) => {
  const m = izlaz.match(/TOTAL:\s*(\d+)\s*(SUCCESS|FAILED)/);
  const pad = izlaz.match(/TOTAL:\s*(\d+)\s*FAILED,\s*(\d+)\s*SUCCESS/);

  if (pad) return { ukupno: Number(pad[1]) + Number(pad[2]), proslo: Number(pad[2]), palo: Number(pad[1]) };
  if (m) return { ukupno: Number(m[1]), proslo: Number(m[1]), palo: 0 };

  return { ukupno: null, proslo: null, palo: null };
};

/** „19 passing" / „1 failing" iz mocha-e. */
const brojacMocha = (izlaz) => {
  const proslo = Number((izlaz.match(/(\d+) passing/) || [])[1] ?? NaN);
  const palo = Number((izlaz.match(/(\d+) failing/) || [])[1] ?? 0);

  if (Number.isNaN(proslo)) return { ukupno: null, proslo: null, palo: null };

  return { ukupno: proslo + palo, proslo, palo };
};

// ===========================================================================
// Koraci
// ===========================================================================

const proveriPortove = async () => {
  naslov('1. Provera portova');

  const zauzeti = [];

  for (const s of SERVISI) if (await portZauzet(s.port)) zauzeti.push(`${s.ime} (${s.port})`);
  if (await portZauzet(FRONTEND_PORT)) zauzeti.push(`frontend za testove (${FRONTEND_PORT})`);

  if (zauzeti.length > 0) {
    console.error(
      BOJE.crvena(
        '\nPortovi su zauzeti:\n' +
          zauzeti.map((z) => `  - ${z}`).join('\n') +
          '\n\nTest stek koristi ISTE portove kao razvojni, da bi probe i E2E\n' +
          'radili bez izmena. Zaustavi razvojni stek (npm run dev) pa pokreni\n' +
          'ponovo, ili promeni port frontenda sa TEST_FRONTEND_PORT.\n'
      )
    );

    process.exit(2);
  }

  korak(`slobodni: ${SERVISI.map((s) => s.port).join(', ')} i ${FRONTEND_PORT}`);
};

const jedinicniTestovi = async () => {
  naslov('2. Jedinični testovi (bez baze i mreže)');

  let sve = true;

  for (const s of SERVISI) {
    const r = await pokreni('npm', ['test', '--silent'], {
      cwd: path.join(BACKEND, s.ime),
      timeoutMs: 5 * 60 * 1000
    });

    sve = zabelezi(`jedinicni: ${s.ime}`, r, brojacNodeTest) && sve;
  }

  return sve;
};

const podigniStek = async () => {
  naslov('3. Test stek nad `*_db_test` bazama, u mock režimu');

  for (const s of SERVISI) {
    pokreniUPozadini(s.ime, 'node', ['src/index.js'], {
      cwd: path.join(BACKEND, s.ime),
      env: okruzenjeServisa(s.ime)
    });
  }

  const zdravlje = await cekajZdravlje();

  if (!zdravlje.ok) {
    console.error(BOJE.crvena(`\nServisi nisu odgovorili na /health: ${zdravlje.nezdravi.join(', ')}`));

    for (const { naziv, dnevnik } of pokrenuti) {
      if (!zdravlje.nezdravi.includes(naziv)) continue;
      console.error(BOJE.siva(`\n--- ${naziv} ---\n${dnevnik().slice(-2000)}`));
    }

    return false;
  }

  korak(`svih ${SERVISI.length} servisa odgovara na /health`);
  return true;
};

const seed = async () => {
  naslov('4. Uvoz i seed nad test bazom');

  const koraci = [
    ['uvoz gradova', 'trip-service', ['run', 'import:gradovi']],
    ['seed kategorija', 'trip-service', ['run', 'seed:kategorije']],
    ['seed destinacija', 'trip-service', ['run', 'seed:destinacije']],
    ['demo nalozi', 'user-service', ['run', 'seed:demo']]
  ];

  let sve = true;

  for (const [opis, servis, argumenti] of koraci) {
    const r = await pokreni('npm', [...argumenti, '--silent'], {
      cwd: path.join(BACKEND, servis),
      env: okruzenjeSkripte(servis),
      timeoutMs: 10 * 60 * 1000
    });

    sve = zabelezi(`seed: ${opis}`, r) && sve;
  }

  return sve;
};

const probe = async () => {
  naslov('5. Probe (integracija kroz pokrenute servise)');

  const spisak = [
    ['adapteri', 'integration-service', 'proba:adapteri'],
    ['gradovi', 'trip-service', 'proba:gradovi'],
    ['carobnjak', 'orchestrator-service', 'proba:carobnjak'],
    ['izmena plana', 'orchestrator-service', 'proba:izmena'],
    ['rezervacija', 'booking-service', 'proba:rezervacija'],
    ['admin', 'admin-service', 'proba:admin'],
    ['bezbednost', 'user-service', 'proba:bezbednost']
  ];

  let sve = true;

  for (const [opis, servis, skripta] of spisak) {
    const r = await pokreni('npm', ['run', skripta, '--silent'], {
      cwd: path.join(BACKEND, servis),
      env: okruzenjeSkripte(servis),
      timeoutMs: 10 * 60 * 1000
    });

    sve = zabelezi(`proba: ${opis}`, r, brojacProbe) && sve;
  }

  // OpenAPI proba se pokreće iz korena i ne traži servise
  const openapi = await pokreni('npm', ['run', 'proba:openapi', '--silent'], {
    cwd: KOREN,
    timeoutMs: 5 * 60 * 1000
  });

  sve = zabelezi('proba: openapi', openapi, brojacProbe) && sve;

  // Podešavanja: da li `.env.example` pokriva sve promenljive
  const env = await pokreni('npm', ['run', 'proba:env', '--silent'], {
    cwd: KOREN,
    timeoutMs: 2 * 60 * 1000
  });

  return zabelezi('proba: podesavanja', env) && sve;
};

const frontendTestovi = async () => {
  naslov('6. Frontend (Karma)');

  const r = await pokreni('npm', ['test', '--', '--watch=false', '--browsers=ChromeHeadless'], {
    cwd: path.join(KOREN, 'frontend'),
    timeoutMs: 15 * 60 * 1000
  });

  return zabelezi('frontend: Karma', r, brojacKarma);
};

const e2eTestovi = async () => {
  naslov('7. Selenium E2E');

  korak(`frontend na portu ${FRONTEND_PORT}`);

  pokreniUPozadini('frontend', 'npm', ['start', '--', '--port', String(FRONTEND_PORT)], {
    cwd: path.join(KOREN, 'frontend'),
    env: {}
  });

  if (!(await cekajFrontend())) {
    const fe = pokrenuti.find((p) => p.naziv === 'frontend');
    console.error(BOJE.crvena(`\nFrontend nije odgovorio na portu ${FRONTEND_PORT}`));
    if (fe) console.error(BOJE.siva(fe.dnevnik().slice(-2000)));

    rezultati.push({ skup: 'e2e: Selenium', ok: false, ukupno: null, proslo: null, palo: null, trajanjeMs: 0, izlaz: 'frontend nije podignut' });
    return false;
  }

  const r = await pokreni('npm', ['test', '--silent'], {
    cwd: path.join(KOREN, 'e2e'),
    env: {
      E2E_FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
      E2E_API_URL: 'http://localhost:4000',
      // Keš opoziva je 0 u test steku, pa provere ne moraju da čekaju pola minuta
      E2E_OPOZIV_MS: '10000'
    },
    timeoutMs: 30 * 60 * 1000
  });

  return zabelezi('e2e: Selenium', r, brojacMocha);
};

// ===========================================================================
// Tabela
// ===========================================================================

const ispisiTabelu = (razvojnePre, razvojnePosle, obrisaneBaze) => {
  naslov('Rezultat');

  const sirina = Math.max(...rezultati.map((r) => r.skup.length), 24);

  console.log(`  ${'Skup'.padEnd(sirina)}  ${'Provera'.padStart(9)}  ${'Prošlo'.padStart(7)}  ${'Palo'.padStart(5)}  ${'Trajanje'.padStart(9)}`);
  console.log(`  ${'-'.repeat(sirina)}  ${'-'.repeat(9)}  ${'-'.repeat(7)}  ${'-'.repeat(5)}  ${'-'.repeat(9)}`);

  let ukupnoProvera = 0;
  let ukupnoProslo = 0;
  let ukupnoPalo = 0;

  for (const r of rezultati) {
    const u = r.ukupno ?? '-';
    const p = r.proslo ?? (r.ok ? '-' : '0');
    const f = r.palo ?? (r.ok ? '0' : '-');

    if (typeof r.ukupno === 'number') {
      ukupnoProvera += r.ukupno;
      ukupnoProslo += r.proslo || 0;
      ukupnoPalo += r.palo || 0;
    }

    const boja = r.ok ? BOJE.zelena : BOJE.crvena;

    console.log(
      `  ${boja(r.skup.padEnd(sirina))}  ${String(u).padStart(9)}  ${String(p).padStart(7)}  ` +
        `${String(f).padStart(5)}  ${`${(r.trajanjeMs / 1000).toFixed(1)} s`.padStart(9)}`
    );
  }

  console.log(`  ${'-'.repeat(sirina)}  ${'-'.repeat(9)}  ${'-'.repeat(7)}  ${'-'.repeat(5)}  ${'-'.repeat(9)}`);
  console.log(
    `  ${BOJE.jaka('UKUPNO'.padEnd(sirina))}  ${String(ukupnoProvera).padStart(9)}  ` +
      `${String(ukupnoProslo).padStart(7)}  ${String(ukupnoPalo).padStart(5)}`
  );

  // --- razvojne baze ---
  naslov('Razvojne baze (pre i posle)');

  /*
   * Zaprljanjem se računa samo RAST broja zapisa - on bi značio da je test
   * stek pisao u razvojnu bazu. Smanjenje nije: razvojne baze imaju TTL
   * indekse (sesije planiranja 24 h, revizioni zapisi 90 dana, obaveštenja),
   * pa MongoDB sam briše istekle zapise i dok testovi rade.
   */
  let poraslo = false;
  let smanjeno = false;

  for (const baza of RAZVOJNE_BAZE) {
    const pre = razvojnePre[baza] || {};
    const posle = razvojnePosle[baza] || {};
    const kolekcije = [...new Set([...Object.keys(pre), ...Object.keys(posle)])].sort();

    const opis = kolekcije
      .map((k) => {
        const a = pre[k] ?? 0;
        const b = posle[k] ?? 0;

        if (b > a) {
          poraslo = true;
          return BOJE.crvena(`${k}: ${a} -> ${b} (+${b - a})`);
        }

        if (b < a) {
          smanjeno = true;
          return BOJE.zuta(`${k}: ${a} -> ${b} (TTL)`);
        }

        return `${k}=${a}`;
      })
      .join(' ');

    console.log(`  ${baza.padEnd(18)} ${opis || '(nema kolekcija)'}`);
  }

  if (poraslo) {
    console.log(BOJE.crvena('\n  RAZVOJNI PODACI SU DOPISANI - test stek nije radio nad odvojenim bazama.'));
  } else if (smanjeno) {
    console.log(
      BOJE.zelena('\n  Test stek nije ništa dopisao u razvojne baze.') +
        BOJE.siva(' (Smanjenja su TTL indeksi razvojnih baza, ne testovi.)')
    );
  } else {
    console.log(BOJE.zelena('\n  Razvojni podaci su nepromenjeni.'));
  }

  if (obrisaneBaze.length > 0) {
    console.log(BOJE.siva(`\n  Obrisane test baze: ${obrisaneBaze.join(', ')}`));
  }

  return !poraslo;
};

const ispisiPadove = () => {
  const pali = rezultati.filter((r) => !r.ok);
  if (pali.length === 0) return;

  for (const r of pali) {
    naslov(`Izlaz: ${r.skup}`);
    console.log(BOJE.siva((r.izlaz || '').slice(-4000)));
  }
};

// ===========================================================================
// Glavni tok
// ===========================================================================

(async () => {
  const pocetak = Date.now();
  let sve = true;
  let razvojnePre = {};
  let obrisane = [];

  try {
    await proveriPortove();

    korak('merim stanje razvojnih baza');
    razvojnePre = await stanjeRazvojnih();

    // Ostatak prethodnog prolaza ne sme da utiče na rezultat
    obrisane = await obrisiTestBaze();
    if (obrisane.length > 0) korak(`obrisane zaostale test baze: ${obrisane.join(', ')}`);

    sve = (await jedinicniTestovi()) && sve;

    if (!(await podigniStek())) {
      sve = false;
    } else {
      sve = (await seed()) && sve;
      sve = (await probe()) && sve;
      sve = (await frontendTestovi()) && sve;
      sve = (await e2eTestovi()) && sve;
    }
  } catch (err) {
    console.error(BOJE.crvena(`\n[test:sve] neočekivana greška: ${err.stack || err.message}`));
    sve = false;
  } finally {
    naslov('8. Gašenje steka i brisanje test baza');

    await ugasiSve();
    korak('servisi ugašeni');

    try {
      obrisane = await obrisiTestBaze();
      korak(`test baze obrisane (${obrisane.length})`);
    } catch (err) {
      console.warn(BOJE.zuta(`  test baze nisu obrisane: ${err.message}`));
    }
  }

  const razvojnePosle = await stanjeRazvojnih().catch(() => ({}));
  const bazeNetaknute = ispisiTabelu(razvojnePre, razvojnePosle, obrisane);

  ispisiPadove();

  const trajanje = ((Date.now() - pocetak) / 1000 / 60).toFixed(1);
  const uspeh = sve && bazeNetaknute;

  console.log(
    `\n${uspeh ? BOJE.zelena('SVE PROLAZI') : BOJE.crvena('NEŠTO JE PALO')} — ukupno ${trajanje} min\n`
  );

  process.exit(uspeh ? 0 : 1);
})();
