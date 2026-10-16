/**
 * proba:env - poredi `.env.example` svakog servisa sa onim sto kod zaista cita.
 *
 * Pokrece se bez baze i bez pokrenutih servisa. Trazi dve stvari:
 *
 *   1. svaka promenljiva koju servis cita preko `process.env.X` mora da postoji
 *      u njegovom `.env.example` - inace cist start iz README-a pukne na koraku
 *      koji README ne pominje;
 *   2. `.env.example` ne sme da sadrzi pravu tajnu - vrednosti spoljnih kljuceva
 *      moraju biti prazne, a zajednicke tajne ocigledno razvojni placeholderi.
 *
 * Promenljive koje kod uopste ne cita se samo prijavljuju kao mrtve, jer nisu
 * greska - samo zaostatak.
 */

const fs = require('fs');
const path = require('path');

const KOREN = path.resolve(__dirname, '..');

const SERVISI = [
  'api-gateway',
  'user-service',
  'trip-service',
  'integration-service',
  'planner-service',
  'admin-service',
  'booking-service',
  'notification-service',
  'orchestrator-service'
];

/**
 * Stariji nazivi porta koje kod prihvata kao rezervu. Ako je `.env.example`
 * postavio noviji naziv, stariji ne mora da stoji.
 */
const ALIJASI = {
  PLANNER_PORT: 'PLANNER_SERVICE_PORT',
  ADMIN_PORT: 'ADMIN_SERVICE_PORT',
  BOOKING_PORT: 'BOOKING_SERVICE_PORT',
  NOTIFICATION_PORT: 'NOTIFICATION_SERVICE_PORT'
};

/** Promenljiva koju cita `shared/`, pa vazi za svaki servis. */
const ZAJEDNICKE = ['DOCS_ENABLED'];

/** Kljucevi spoljnih API-ja - u primeru moraju biti prazni. */
const SPOLJNI_KLJUC = /_(API_KEY|AUTH_TOKEN|ACCOUNT_SID|PASS)$/;

/** Zajednicke tajne - dozvoljena je samo vrednost koja se sama proglasava razvojnom. */
const RAZVOJNI = /^razvojni_/;

const jsFajlovi = (dir) => {
  const nadjeno = [];
  const obidji = (d) => {
    for (const ime of fs.readdirSync(d)) {
      if (['node_modules', '.git', 'coverage', 'data', 'confirmations'].includes(ime)) continue;
      const p = path.join(d, ime);
      const st = fs.statSync(p);
      if (st.isDirectory()) obidji(p);
      else if (ime.endsWith('.js')) nadjeno.push(p);
    }
  };
  obidji(dir);
  return nadjeno;
};

/** Koje promenljive kod servisa cita. */
const procitaneIzKoda = (servis) => {
  const nadjene = new Set();
  for (const f of jsFajlovi(path.join(KOREN, servis))) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/process\.env\.([A-Z0-9_]+)/g)) nadjene.add(m[1]);
  }
  return nadjene;
};

/** Koje promenljive `.env.example` postavlja, sa vrednostima. */
const izPrimera = (servis) => {
  const p = path.join(KOREN, servis, '.env.example');
  if (!fs.existsSync(p)) return null;
  const mapa = new Map();
  for (const linija of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = linija.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) mapa.set(m[1], m[2]);
  }
  return mapa;
};

let greske = 0;
let mrtvih = 0;

console.log('Provera .env.example fajlova\n');

for (const servis of SERVISI) {
  const primer = izPrimera(servis);
  if (!primer) {
    console.log(`  ${servis}: NEMA .env.example`);
    greske += 1;
    continue;
  }

  const kod = procitaneIzKoda(servis);
  for (const z of ZAJEDNICKE) kod.add(z);

  // Skripte same postavljaju neke promenljive (lazni server u proba:adapteri);
  // takve se pisu, ne citaju, pa ih izuzimamo tek kad ih primer vec nosi.
  const nedostaju = [...kod]
    .filter((v) => !primer.has(v))
    .filter((v) => !(ALIJASI[v] && primer.has(ALIJASI[v])))
    .sort();

  const mrtve = [...primer.keys()].filter((v) => !kod.has(v)).sort();

  const tajneSaVrednoscu = [...primer.entries()]
    .filter(([k, v]) => k !== 'INTERNAL_API_KEY' && SPOLJNI_KLJUC.test(k) && v.trim() !== '')
    .map(([k]) => k);

  const sumnjiveTajne = [...primer.entries()]
    .filter(([k, v]) => ['JWT_SECRET', 'INTERNAL_API_KEY'].includes(k) && !RAZVOJNI.test(v))
    .map(([k]) => k);

  const ok = nedostaju.length === 0 && tajneSaVrednoscu.length === 0 && sumnjiveTajne.length === 0;
  console.log(`  ${ok ? 'OK  ' : 'PAD '} ${servis.padEnd(22)} ${primer.size} promenljivih, kod cita ${kod.size}`);

  if (nedostaju.length) {
    console.log(`         nedostaje u primeru: ${nedostaju.join(', ')}`);
    greske += nedostaju.length;
  }
  if (tajneSaVrednoscu.length) {
    console.log(`         PRAVA TAJNA u primeru: ${tajneSaVrednoscu.join(', ')}`);
    greske += tajneSaVrednoscu.length;
  }
  if (sumnjiveTajne.length) {
    console.log(`         tajna nije razvojni placeholder: ${sumnjiveTajne.join(', ')}`);
    greske += sumnjiveTajne.length;
  }
  if (mrtve.length) {
    console.log(`         u primeru a kod ih ne cita: ${mrtve.join(', ')}`);
    mrtvih += mrtve.length;
  }
}

console.log(`\n${greske === 0 ? 'Sve u redu.' : `Gresaka: ${greske}`}`);
if (mrtvih) console.log(`Mrtvih promenljivih: ${mrtvih} (nije greska, samo zaostatak).`);

process.exit(greske === 0 ? 0 : 1);
