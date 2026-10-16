/**
 * Merenje vremena algoritma planiranja (spec §11: < 1 s).
 *
 *   npm run bench
 *
 * Meri se SAMO algoritam (faze 3, 4 i 5) nad sintetickim skupom od
 * 100 atrakcija i 14 dana - bez mreze, baze i spoljnih poziva, jer se
 * zahtev iz specifikacije odnosi na algoritam, a ne na cekanje API-ja.
 */
const { izaberiAtrakcije } = require('../src/services/FazaAtrakcije');
const { rasporediPoDanima } = require('../src/services/FazaRaspodela');
const { sastaviDan } = require('../src/services/FazaRedosled');
const { izracunajDane, ukupanCilj, ukupnoVreme } = require('../src/services/Dani');

const BROJ_ATRAKCIJA = Number(process.argv[2]) || 100;
const BROJ_DANA = Number(process.argv[3]) || 14;
const PONAVLJANJA = Number(process.argv[4]) || 20;

/** Deterministican generator, da merenje bude ponovljivo. */
const seedRandom = (seed = 2027) => {
  let stanje = seed;

  return () => {
    stanje = (stanje * 1664525 + 1013904223) % 4294967296;
    return stanje / 4294967296;
  };
};

const KATEGORIJE = ['kultura', 'muzeji', 'priroda', 'gastronomija', 'nocni_zivot', 'soping'];

/** Atrakcije razbacane po gradu precnika ~12 km, kao u stvarnosti. */
const napraviAtrakcije = (broj, random) =>
  Array.from({ length: broj }, (_, i) => ({
    id: `A${i}`,
    name: `Atrakcija ${i}`,
    lat: 37.94 + random() * 0.11,
    lon: 23.66 + random() * 0.14,
    price: Math.round(random() * 20),
    duration: [30, 45, 60, 90, 120][Math.floor(random() * 5)],
    rating: 3 + random() * 2,
    categories: [KATEGORIJE[Math.floor(random() * KATEGORIJE.length)]]
  }));

const preferencije = {
  transportPriority: 'balans',
  accommodationTypes: ['hotel', 'apartman', 'hostel'],
  minAccommodationRating: null,
  interests: KATEGORIJE,
  pace: 'intenzivan',
  dayStart: '09:00',
  dayEnd: '20:00'
};

const smestaj = { lat: 37.9755, lon: 23.7348 };

const jedanProlaz = (atrakcije, random) => {
  const dani = izracunajDane({ checkIn: '2027-06-10', numDays: BROJ_DANA, preferencije });

  // FAZA 3
  const { izabrane } = izaberiAtrakcije(atrakcije, {
    interesovanja: preferencije.interests,
    ciljniBroj: ukupanCilj(dani),
    raspolozivoMinuta: ukupnoVreme(dani)
  });

  // FAZA 4
  const { raspored } = rasporediPoDanima(izabrane, dani, { random });

  // FAZA 5
  let ukupnoAktivnosti = 0;

  for (const dan of dani) {
    const r = sastaviDan({ atrakcije: raspored.get(dan.day) || [], start: smestaj, dan });
    ukupnoAktivnosti += r.attractions.length;
  }

  return ukupnoAktivnosti;
};

const main = () => {
  const random = seedRandom();
  const atrakcije = napraviAtrakcije(BROJ_ATRAKCIJA, random);

  console.log(
    `[BENCH] ${BROJ_ATRAKCIJA} atrakcija, ${BROJ_DANA} dana, ` +
    `${PONAVLJANJA} pokretanja (faze 3-5)\n`
  );

  // Jedno pokretanje van merenja - da se JIT zagreje
  jedanProlaz(atrakcije, seedRandom(1));

  const vremena = [];
  let aktivnosti = 0;

  for (let i = 0; i < PONAVLJANJA; i++) {
    const pocetak = process.hrtime.bigint();
    aktivnosti = jedanProlaz(atrakcije, seedRandom(100 + i));
    const kraj = process.hrtime.bigint();

    vremena.push(Number(kraj - pocetak) / 1e6);
  }

  const prosek = vremena.reduce((z, v) => z + v, 0) / vremena.length;
  const najduze = Math.max(...vremena);
  const najkrace = Math.min(...vremena);

  console.log(`  najkrace: ${najkrace.toFixed(1)} ms`);
  console.log(`  prosek:   ${prosek.toFixed(1)} ms`);
  console.log(`  najduze:  ${najduze.toFixed(1)} ms`);
  console.log(`  aktivnosti u planu: ${aktivnosti}\n`);

  const granica = 1000;
  const prolazi = najduze < granica;

  console.log(
    prolazi
      ? `ZAHTEV ISPUNJEN: najduze ${najduze.toFixed(1)} ms < ${granica} ms (spec §11)`
      : `ZAHTEV NIJE ISPUNJEN: najduze ${najduze.toFixed(1)} ms >= ${granica} ms`
  );

  process.exit(prolazi ? 0 : 1);
};

main();
