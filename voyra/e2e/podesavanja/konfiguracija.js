/**
 * Podesavanja E2E testova.
 *
 * Sve adrese i nalozi stoje na jednom mestu, da se skup testova moze
 * pokrenuti i nad razvojnim i nad test stekom (Deo 5) bez menjanja
 * testova - samo promenom promenljivih okruzenja.
 */

const KONFIG = {
  /** Adresa frontenda (Angular dev server ili posluzen build). */
  frontend: process.env.E2E_FRONTEND_URL || 'http://localhost:4200',

  /** Adresa API Gateway-a - testovi ga koriste za postavljanje stanja. */
  api: process.env.E2E_API_URL || 'http://localhost:4000',

  /** `--vidljivo` u komandnoj liniji otvara pravi prozor pretrazivaca. */
  vidljivo: process.argv.includes('--vidljivo') || process.env.E2E_VIDLJIVO === 'true',

  /** Koliko se najduze ceka na uslov na stranici. */
  cekanjeMs: parseInt(process.env.E2E_CEKANJE_MS, 10) || 20000,

  /** Duze cekanje za planiranje - Planner zove tri servisa. */
  cekanjePlanMs: parseInt(process.env.E2E_CEKANJE_PLAN_MS, 10) || 60000,

  /** Folder za snimke ekrana i HTML pri padu testa. */
  izvestajDir: process.env.E2E_IZVESTAJ_DIR || 'izvestaj',

  /** Folder u koji Chrome preuzima fajlove (PDF potvrda). */
  preuzimanjaDir: process.env.E2E_PREUZIMANJA_DIR || 'izvestaj/preuzimanja',

  /** Nalozi iz README-a (`npm run seed:demo`). */
  nalozi: {
    korisnik: { korisnickoIme: 'demo', lozinka: 'VoyraDemo1!' },
    admin: { korisnickoIme: 'demo_admin', lozinka: 'VoyraDemo1!' }
  },

  /**
   * Odredista koja se koriste u scenarijima.
   *
   * Atina zato sto demo podaci pokrivaju rutu BEG -> ATH, pa plan ima i
   * letove i smestaj i bez ijednog kljuca.
   */
  odredista: {
    atina: { upit: 'ati', naziv: 'Atina', iata: 'ATH' },
    porto: { upit: 'port', naziv: 'Porto', iata: 'OPO' }
  },

  polaziste: { upit: 'beo', naziv: 'Beograd', iata: 'BEG' }
};

module.exports = KONFIG;
