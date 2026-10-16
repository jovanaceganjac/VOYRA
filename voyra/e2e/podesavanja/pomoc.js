/** Pomoćne funkcije koje dele svi scenariji. */

const fs = require('fs');
const path = require('path');

const KONFIG = require('./konfiguracija');
const { apsolutni } = require('./drajver');

/** Datum za `n` dana od danas, u obliku YYYY-MM-DD (kakav `input[type=date]` prima). */
const zaDana = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Datumi putovanja koje scenariji koriste: polazak za 30 dana, 5 noći. */
const DATUMI = {
  polazak: zaDana(30),
  povratak: zaDana(35)
};

/**
 * Prijava bez klikanja kroz formu.
 *
 * Token i korisnik se upisuju u `localStorage` isto kao što to radi
 * `AuthService`, pa aplikacija po osvežavanju obnovi sesiju. Koristi se
 * kada prijava NIJE ono što scenario proverava.
 */
const prijaviKrozSkladiste = async (drajver, { token, user }) => {
  await drajver.get(KONFIG.frontend);

  await drajver.executeScript(
    `window.localStorage.setItem('voyra_token', arguments[0]);
     window.localStorage.setItem('voyra_korisnik', arguments[1]);`,
    token,
    JSON.stringify(user)
  );

  await drajver.navigate().refresh();
};

const ocistiSkladiste = async (drajver) => {
  await drajver.get(KONFIG.frontend);
  await drajver.executeScript('window.localStorage.clear(); window.sessionStorage.clear();');
};

/** Folder za preuzimanja, prazan pre testa koji proverava fajl. */
const pripremiPreuzimanja = () => {
  const dir = apsolutni(KONFIG.preuzimanjaDir);

  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });

  return dir;
};

/**
 * Čeka da se u folderu pojavi PDF i vrati njegovu putanju.
 *
 * Nema `sleep`: proverava se postojanje fajla koji NIJE `.crdownload`
 * (Chrome tako imenuje nezavršeno preuzimanje).
 */
const cekajPdf = async (drajver, ms = KONFIG.cekanjeMs) => {
  const dir = apsolutni(KONFIG.preuzimanjaDir);

  const nadji = () =>
    fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .map((f) => path.join(dir, f));

  await drajver.wait(
    () => nadji().length > 0,
    ms,
    `U folderu ${dir} nije se pojavio PDF (sadržaj: ${fs.readdirSync(dir).join(', ') || 'prazno'})`
  );

  return nadji()[0];
};

/** Prvi bajtovi fajla - PDF mora da počinje sa `%PDF`. */
const pocetakFajla = (putanja, koliko = 4) => {
  const bafer = Buffer.alloc(koliko);
  const f = fs.openSync(putanja, 'r');

  try {
    fs.readSync(f, bafer, 0, koliko, 0);
  } finally {
    fs.closeSync(f);
  }

  return bafer.toString('latin1');
};

module.exports = {
  zaDana,
  DATUMI,
  prijaviKrozSkladiste,
  ocistiSkladiste,
  pripremiPreuzimanja,
  cekajPdf,
  pocetakFajla
};
