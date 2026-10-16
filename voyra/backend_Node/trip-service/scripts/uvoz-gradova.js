/**
 * Uvoz referentnih podataka o gradovima i aerodromima Evrope.
 *
 *   npm run import:gradovi
 *
 * Idempotentan je: ponovno pokretanje azurira postojece zapise i ne
 * pravi duplikate (`_id` je IATA kod, odnosno geonameId).
 *
 * IZVORI I LICENCE
 *   - OurAirports `airports.csv` - JAVNI DOMEN
 *     (https://ourairports.com/data/: "All data is released to the
 *     Public Domain"). Navodjenje nije obavezno, ali ga navodimo.
 *   - GeoNames `cities5000` - CC BY 4.0
 *     (https://www.geonames.org/export/: "cc-by licence ... You should
 *     give credit to GeoNames"). Navedeno u README-u i u podnozju
 *     aplikacije.
 *
 * Preuzeti fajlovi ostaju u `data/` i NE ulaze u git.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const mongoose = require('mongoose');

const City = require('../src/models/City');
const Airport = require('../src/models/Airport');
const { OZNAKE_DRZAVA, nazivDrzave, uEvropi } = require('../src/config/evropa');
const { normalizuj, obliciZaPretragu, udaljenostKm } = require('../src/utils/normalizacija');

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/trips_db';
const DATA = path.resolve(__dirname, '../data');

const IZVORI = {
  aerodromi: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  gradovi: 'https://download.geonames.org/export/dump/cities5000.zip'
};

/** Najdalji aerodrom koji se jos racuna kao "aerodrom tog grada". */
const MAX_UDALJENOST_KM = 150;
const MAX_AERODROMA = 3;

// =================================================================
// Preuzimanje
// =================================================================

const preuzmi = (url, uFajl) =>
  new Promise((resolve, reject) => {
    const tok = fs.createWriteStream(uFajl);

    https
      .get(url, { headers: { 'User-Agent': 'Voyra/1.0 (diplomski rad, ETF Beograd)' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          tok.close();
          return preuzmi(res.headers.location, uFajl).then(resolve, reject);
        }

        if (res.statusCode !== 200) {
          tok.close();
          return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
        }

        res.pipe(tok);
        tok.on('finish', () => tok.close(() => resolve(uFajl)));
      })
      .on('error', reject);
  });

/** Preuzima samo ako fajl ne postoji ili je stariji od 30 dana. */
const osvezi = async (url, ime) => {
  const putanja = path.join(DATA, ime);

  if (fs.existsSync(putanja)) {
    const star = (Date.now() - fs.statSync(putanja).mtimeMs) / (1000 * 60 * 60 * 24);

    if (star < 30) {
      console.log(`[UVOZ] ${ime} vec postoji (${star.toFixed(1)} dana star)`);
      return putanja;
    }
  }

  console.log(`[UVOZ] Preuzimam ${url}`);
  await preuzmi(url, putanja);

  return putanja;
};

// =================================================================
// Citanje CSV-a (OurAirports)
// =================================================================

/** Jedan CSV red -> lista polja; podrzava navodnike i zareze u njima. */
const procitajRed = (red) => {
  const polja = [];
  let tekuce = '';
  let uNavodnicima = false;

  for (let i = 0; i < red.length; i++) {
    const z = red[i];

    if (z === '"') {
      if (uNavodnicima && red[i + 1] === '"') {
        tekuce += '"';
        i++;
      } else {
        uNavodnicima = !uNavodnicima;
      }
    } else if (z === ',' && !uNavodnicima) {
      polja.push(tekuce);
      tekuce = '';
    } else {
      tekuce += z;
    }
  }

  polja.push(tekuce);

  return polja;
};

const ucitajAerodrome = (putanja) => {
  const redovi = fs.readFileSync(putanja, 'utf8').split('\n');
  const zaglavlje = procitajRed(redovi[0]);
  const k = Object.fromEntries(zaglavlje.map((ime, i) => [ime.trim(), i]));

  const aerodromi = [];

  for (let i = 1; i < redovi.length; i++) {
    if (!redovi[i].trim()) continue;

    const p = procitajRed(redovi[i]);

    const tip = p[k.type];
    const iata = (p[k.iata_code] || '').trim().toUpperCase();
    const drzava = (p[k.iso_country] || '').trim().toUpperCase();

    // Samo aerodromi koji zaista primaju redovne linije
    if (tip !== 'large_airport' && tip !== 'medium_airport') continue;
    if ((p[k.scheduled_service] || '').trim() !== 'yes') continue;
    if (iata.length !== 3) continue;
    if (!uEvropi(drzava)) continue;

    aerodromi.push({
      _id: iata,
      iata,
      naziv: (p[k.name] || '').trim(),
      grad: (p[k.municipality] || '').trim(),
      drzava,
      drzavaNaziv: nazivDrzave(drzava),
      lat: Number(p[k.latitude_deg]),
      lon: Number(p[k.longitude_deg]),
      tip
    });
  }

  return aerodromi.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
};

// =================================================================
// Citanje GeoNames dump-a
// =================================================================

/** `cities5000.zip` sadrzi jedan `.txt` fajl razdvojen tabovima. */
const raspakuj = (zipPutanja) => {
  const buf = fs.readFileSync(zipPutanja);

  // Minimalno citanje ZIP-a: jedan zapis, deflate ili bez kompresije
  const potpis = buf.readUInt32LE(0);
  if (potpis !== 0x04034b50) throw new Error('Neocekivan oblik ZIP fajla');

  const metod = buf.readUInt16LE(8);
  const duzinaImena = buf.readUInt16LE(26);
  const duzinaDodatka = buf.readUInt16LE(28);
  const pocetak = 30 + duzinaImena + duzinaDodatka;

  const komprimovano = buf.readUInt32LE(18);
  const telo = buf.subarray(pocetak, komprimovano > 0 ? pocetak + komprimovano : undefined);

  return metod === 0 ? telo.toString('utf8') : zlib.inflateRawSync(telo).toString('utf8');
};

/**
 * Kolone `cities5000.txt` (GeoNames readme):
 * 0 geonameid, 1 name, 2 asciiname, 3 alternatenames, 4 lat, 5 lon,
 * 6 feature class, 7 feature code, 8 country code, ..., 14 population
 */
const ucitajGradove = (putanja, srpskiPoIata, aerodromi) => {
  const tekst = raspakuj(putanja);
  const redovi = tekst.split('\n');

  const gradovi = [];

  for (const red of redovi) {
    if (!red.trim()) continue;

    const p = red.split('\t');
    const drzava = (p[8] || '').trim().toUpperCase();

    if (!uEvropi(drzava)) continue;

    const naziv = (p[1] || '').trim();
    const asci = (p[2] || '').trim();
    const lat = Number(p[4]);
    const lon = Number(p[5]);

    if (!naziv || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    /*
     * Alternativni nazivi: GeoNames ih daje na svim pismima, a nama
     * trebaju samo latinicni - cirilicni i grcki oblici bi samo napunili
     * indeks pretrage necim sto korisnik ovde nece kucati.
     */
    const alternativni = (p[3] || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && /^[\x20-\x7EÀ-ɏ]+$/.test(s));

    gradovi.push({
      _id: String(p[0]).trim(),
      naziv,
      nazivEn: asci || naziv,
      nazivSr: null,
      alternativniNazivi: alternativni,
      drzava,
      drzavaNaziv: nazivDrzave(drzava),
      lat,
      lon,
      stanovnika: Number(p[14]) || 0
    });
  }

  return gradovi;
};

// =================================================================
// Povezivanje gradova i aerodroma
// =================================================================

/**
 * Najblizi aerodromi za svaki grad.
 *
 * Racuna se JEDNOM, pri uvozu: ni gradovi ni aerodromi se ne pomeraju,
 * pa bi racun pri svakom zahtevu bio cist trosak. Da poredjenje svih sa
 * svima (oko 3.000 gradova x 600 aerodroma) ne bi trajalo, aerodromi se
 * prvo grupisu po celom stepenu geografske sirine i duzine.
 */
const poveziAerodrome = (gradovi, aerodromi) => {
  const mreza = new Map();

  const kljuc = (lat, lon) => `${Math.round(lat)}:${Math.round(lon)}`;

  for (const a of aerodromi) {
    const k = kljuc(a.lat, a.lon);
    if (!mreza.has(k)) mreza.set(k, []);
    mreza.get(k).push(a);
  }

  // 150 km je najvise oko 1.4 stepena sirine, pa je dovoljan opseg od 2
  const OPSEG = 2;

  for (const grad of gradovi) {
    const kandidati = [];

    for (let dLat = -OPSEG; dLat <= OPSEG; dLat++) {
      for (let dLon = -OPSEG; dLon <= OPSEG; dLon++) {
        const k = `${Math.round(grad.lat) + dLat}:${Math.round(grad.lon) + dLon}`;
        const grupa = mreza.get(k);
        if (grupa) kandidati.push(...grupa);
      }
    }

    grad.aerodromi = kandidati
      .map((a) => ({
        iata: a.iata,
        naziv: a.naziv,
        tip: a.tip,
        udaljenostKm: Math.round(udaljenostKm(grad, a) * 10) / 10
      }))
      .filter((a) => a.udaljenostKm <= MAX_UDALJENOST_KM)
      .sort((x, y) => x.udaljenostKm - y.udaljenostKm)
      .slice(0, MAX_AERODROMA);
  }
};

/**
 * Metropolitanski IATA kodovi.
 *
 * Duffel prima kod grada kao `origin`/`destination`, pa se za te gradove
 * pretraga radi po kodu i pokriva sve njihove aerodrome. Spisak je kratak
 * i stabilan (IATA ih dodeljuje retko), pa stoji ovde.
 */
const IATA_GRADOVA = {
  London: 'LON',
  Paris: 'PAR',
  Milan: 'MIL',
  Milano: 'MIL',
  Rome: 'ROM',
  Roma: 'ROM',
  Moscow: 'MOW',
  Stockholm: 'STO',
  Istanbul: 'IST',
  Berlin: 'BER',
  Belfast: 'BFS',
  Barcelona: 'BCN'
};

// =================================================================
// Glavni tok
// =================================================================

(async () => {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

  const csv = await osvezi(IZVORI.aerodromi, 'airports.csv');
  const zip = await osvezi(IZVORI.gradovi, 'cities5000.zip');

  await mongoose.connect(MONGO);
  console.log(`[UVOZ] Baza: ${MONGO}\n`);

  // ---------- aerodromi ----------
  const aerodromi = ucitajAerodrome(csv);
  console.log(`[UVOZ] Aerodroma sa redovnim linijama u obuhvatu: ${aerodromi.length}`);

  await Airport.bulkWrite(
    aerodromi.map((a) => ({
      updateOne: { filter: { _id: a._id }, update: { $set: a }, upsert: true }
    }))
  );

  // ---------- gradovi ----------
  const srpski = JSON.parse(fs.readFileSync(path.join(DATA, 'srpski-nazivi.json'), 'utf8'));
  const gradovi = ucitajGradove(zip, srpski, aerodromi);

  console.log(`[UVOZ] Gradova preko 5.000 stanovnika u obuhvatu: ${gradovi.length}`);

  poveziAerodrome(gradovi, aerodromi);

  /*
   * SRPSKI NAZIVI (postojecih 148 iz `gradovi.ts`).
   *
   * Veza ide preko polja `municipality` iz OurAirports-a: za svaki IATA
   * kod znamo kom gradu aerodrom pripada, pa se srpski naziv dodeljuje
   * gradu koji se tako i zove. Nema pogadjanja po udaljenosti ni po
   * broju stanovnika - inace bi svako vece mesto oko Minhena postalo
   * "Minhen". Za gradove bez zapisa se NE izmislja srpski naziv.
   */
  /*
   * `municipality` ume da nosi i okrug u zagradi ("Paris (Orly,
   * Val-de-Marne)"), pa se uzima samo deo pre zagrade ili zareza. Neki
   * aerodromi su upisani na susedno selo (LJU je "Zgornji Brnik"), ali
   * im naziv nosi ime grada - to je druga provera.
   */
  const ocisti = (tekst) => normalizuj(String(tekst || '').split(/[(,]/)[0]);

  const gradAerodroma = new Map(aerodromi.map((a) => [a.iata, ocisti(a.grad)]));
  const nazivAerodroma = new Map(aerodromi.map((a) => [a.iata, normalizuj(a.naziv)]));

  /*
   * Kandidati se prvo skupe po IATA kodu, pa naziv dobije NAJVECI grad.
   *
   * Bez toga bi ime dobilo i selo u kom aerodrom stoji: "Toulouse-Blagnac
   * Airport" sadrzi i "Toulouse" i "Blagnac", pa bi i Blagnac (23.000)
   * postao "Tuluz" uz Tuluz (479.000).
   */
  const kandidati = new Map();

  for (const grad of gradovi) {
    const svaImena = [grad.naziv, grad.nazivEn, ...grad.alternativniNazivi].map(normalizuj);

    for (const a of grad.aerodromi) {
      if (!srpski[a.iata]) continue;

      const gradSaAerodroma = gradAerodroma.get(a.iata);
      const poGradu = gradSaAerodroma && svaImena.includes(gradSaAerodroma);

      // Aerodrom upisan na susedno selo, ali nazvan po gradu (LJU)
      const imeAerodroma = nazivAerodroma.get(a.iata) || '';
      const poNazivu =
        a.udaljenostKm <= 60 &&
        svaImena.some((ime) => ime.length >= 4 && imeAerodroma.split(' ').includes(ime));

      if (!poGradu && !poNazivu) continue;

      if (!kandidati.has(a.iata)) kandidati.set(a.iata, []);
      kandidati.get(a.iata).push(grad);
      break;
    }

    grad.iataGrada = IATA_GRADOVA[grad.nazivEn] || IATA_GRADOVA[grad.naziv] || null;
  }

  let saSrpskim = 0;

  for (const [iata, lista] of kandidati) {
    const najveci = lista.sort((a, b) => b.stanovnika - a.stanovnika)[0];

    najveci.nazivSr = srpski[iata].naziv;
    saSrpskim++;
  }

  /*
   * Oblici za pretragu se racunaju tek kada su srpski nazivi poznati.
   *
   * Alternativni nazivi se NE seku pre normalizacije: GeoNames ih ne daje
   * po vaznosti, pa bi odsecanje prvih dvanaest izbacilo bas "Munchen" i
   * "Wien". Posle normalizacije ih ionako ostane malo, jer se mnogi
   * poklope.
   */
  const MAX_OBLIKA = 30;

  for (const grad of gradovi) {
    grad.pretragaGlavna = obliciZaPretragu(
      [grad.naziv, grad.nazivEn, grad.nazivSr].filter(Boolean)
    );

    grad.pretraga = obliciZaPretragu(
      [grad.naziv, grad.nazivEn, grad.nazivSr, ...grad.alternativniNazivi].filter(Boolean)
    ).slice(0, MAX_OBLIKA);

    // Za prikaz je dovoljno nekoliko alternativnih naziva
    grad.alternativniNazivi = grad.alternativniNazivi.slice(0, 8);
  }

  console.log(`[UVOZ] Gradova sa srpskim nazivom: ${saSrpskim} (od ${Object.keys(srpski).length} u spisku)`);

  // Upis u grupama - jedan bulkWrite sa 3.000 operacija ume da pukne
  const VELICINA = 500;

  for (let i = 0; i < gradovi.length; i += VELICINA) {
    await City.bulkWrite(
      gradovi.slice(i, i + VELICINA).map((g) => ({
        updateOne: { filter: { _id: g._id }, update: { $set: g }, upsert: true }
      }))
    );
  }

  // ---------- izvestaj ----------
  const poDrzavi = {};

  for (const iso of OZNAKE_DRZAVA) {
    poDrzavi[iso] = {
      gradova: gradovi.filter((g) => g.drzava === iso).length,
      aerodroma: aerodromi.filter((a) => a.drzava === iso).length
    };
  }

  const najvece = Object.entries(poDrzavi)
    .sort((a, b) => b[1].gradova - a[1].gradova)
    .slice(0, 12);

  console.log('\n[UVOZ] Po drzavama (prvih 12 po broju gradova):');
  for (const [iso, broj] of najvece) {
    console.log(`  ${iso} ${nazivDrzave(iso).padEnd(22)} gradova: ${String(broj.gradova).padStart(4)}  aerodroma: ${String(broj.aerodroma).padStart(3)}`);
  }

  const ukupnoGradova = await City.countDocuments();
  const ukupnoAerodroma = await Airport.countDocuments();

  console.log(`\n[UVOZ] U bazi: ${ukupnoGradova} gradova, ${ukupnoAerodroma} aerodroma`);
  console.log('[UVOZ] Izvori: OurAirports (javni domen), GeoNames (CC BY 4.0)');

  await mongoose.disconnect();
})().catch((err) => {
  console.error('[UVOZ] Neuspeh:', err.message);
  process.exit(1);
});
