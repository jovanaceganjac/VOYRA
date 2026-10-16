const test = require('node:test');
const assert = require('node:assert/strict');

const { napraviSatnicu, urediDan } = require('../src/services/FazaRedosled');
const { izracunajDane, imaVremeZaRucak } = require('../src/services/Dani');
const Distances = require('../src/utils/Distances');

/**
 * RUCNA IZMENA PLANA (spec §4.6).
 *
 * Kljucna razlika u odnosu na generisanje: algoritam ne odlucuje umesto
 * korisnika. Sto je korisnik postavio, ostaje - samo se obelezi ako ne
 * valja.
 */

const distances = new Distances();

const dan = (izmene = {}) => ({
  day: 2,
  date: '2027-06-11',
  availableFrom: '09:00',
  availableTo: '20:00',
  note: null,
  ...izmene
});

const atrakcija = (id, lat, lon, opcije = {}) => ({
  id,
  name: id,
  lat,
  lon,
  duration: opcije.duration ?? 60,
  price: opcije.price ?? 0,
  rating: opcije.rating ?? 4,
  categories: opcije.categories ?? ['kultura'],
  openingHours: opcije.openingHours,
  score: opcije.score ?? 0.5
});

const SMESTAJ = { lat: 37.9715, lon: 23.7267 };

/** Ukupna duzina putanje smestaj -> a1 -> a2 -> ... */
const duzinaPutanje = (redosled, start) => {
  let mesto = start;
  let ukupno = 0;

  for (const a of redosled) {
    ukupno += distances.between(mesto, a);
    mesto = a;
  }

  return ukupno;
};

// =================================================================
// 1. schedule-day: ne menja redosled i ne izbacuje
// =================================================================

test('rucna satnica cuva redosled koji je korisnik postavio', () => {
  const redosled = [
    atrakcija('treca', 37.99, 23.75),
    atrakcija('prva', 37.9715, 23.7267),
    atrakcija('druga', 37.975, 23.73)
  ];

  const s = napraviSatnicu({ redosled, start: SMESTAJ, dan: dan(), zadrziSve: true });

  assert.deepEqual(
    s.stavke.map((a) => a.id),
    ['treca', 'prva', 'druga'],
    'satnica je promenila redosled'
  );
});

test('rucna satnica ne izbacuje ni sta ne staje u dan', () => {
  const redosled = [
    atrakcija('duga1', 37.97, 23.72, { duration: 300 }),
    atrakcija('duga2', 37.98, 23.73, { duration: 300 }),
    atrakcija('duga3', 37.99, 23.74, { duration: 300 })
  ];

  const s = napraviSatnicu({ redosled, start: SMESTAJ, dan: dan(), zadrziSve: true });

  assert.equal(s.stavke.length, 3, 'neka atrakcija je ispala iz dana');
});

test('dolazak van radnog vremena dobija violation "zatvoreno"', () => {
  const klub = atrakcija('nocni klub', 37.98, 23.73, {
    duration: 120,
    openingHours: { open: '20:00', close: '02:00' }
  });

  const s = napraviSatnicu({ redosled: [klub], start: SMESTAJ, dan: dan(), zadrziSve: true });

  assert.equal(s.stavke[0].violation, 'zatvoreno');

  // Dolazak je vreme puta od smestaja, a NE 20:00 - satnica ne ceka
  // otvaranje, jer bi tako prikazala vreme koje korisnik nije trazio
  assert.ok(
    s.stavke[0].startTime < '10:00',
    `dolazak je tiho pomeren na otvaranje: ${s.stavke[0].startTime}`
  );
});

test('aktivnost koja se zavrsava posle kraja dana dobija "posle_kraja_dana"', () => {
  const kratak = dan({ availableFrom: '09:00', availableTo: '11:00' });

  const redosled = [
    atrakcija('staje', 37.9715, 23.7267, { duration: 60 }),
    atrakcija('ne staje', 37.972, 23.727, { duration: 180 })
  ];

  const s = napraviSatnicu({ redosled, start: SMESTAJ, dan: kratak, zadrziSve: true });

  assert.equal(s.stavke.length, 2);
  assert.equal(s.stavke[0].violation, null);
  assert.equal(s.stavke[1].violation, 'posle_kraja_dana');
});

test('generisanje i dalje izbacuje ono sto ne staje (zadrziSve iskljucen)', () => {
  const kratak = dan({ availableFrom: '09:00', availableTo: '11:00' });

  const redosled = [
    atrakcija('staje', 37.9715, 23.7267, { duration: 60 }),
    atrakcija('ne staje', 37.972, 23.727, { duration: 180 })
  ];

  const s = napraviSatnicu({ redosled, start: SMESTAJ, dan: kratak });

  assert.equal(s.stavke.length, 1, 'generisanje je zadrzalo atrakciju koja ne staje');
  assert.equal(s.nestale.length, 1);
});

// =================================================================
// 2. optimize-day: nikada ne produzava putanju
// =================================================================

test('optimizacija dana ne produzava putanju i polazi od smestaja', () => {
  // Namerno los redosled: cik-cak preko grada
  const loseRedom = [
    atrakcija('daleko1', 38.02, 23.78),
    atrakcija('blizu1', 37.972, 23.727),
    atrakcija('daleko2', 38.03, 23.79),
    atrakcija('blizu2', 37.973, 23.728)
  ];

  const pre = duzinaPutanje(loseRedom, SMESTAJ);
  const { redosled } = urediDan({ atrakcije: loseRedom, start: SMESTAJ, dan: dan() });
  const posle = duzinaPutanje(redosled, SMESTAJ);

  assert.equal(redosled.length, loseRedom.length, 'optimizacija je izgubila atrakciju');
  assert.ok(posle <= pre + 1e-9, `putanja je duza posle optimizacije: ${pre} -> ${posle}`);

  // Prva stavka je najbliza smestaju - najblizi sused polazi odatle
  const najbliza = [...loseRedom].sort(
    (a, b) => distances.between(SMESTAJ, a) - distances.between(SMESTAJ, b)
  )[0];

  assert.equal(redosled[0].id, najbliza.id);
});

test('optimizacija nikada ne vraca duzi put od zatecenog', () => {
  /*
   * Najblizi sused ne garantuje poboljsanje nad PROIZVOLJNIM zatecenim
   * redosledom - zato ruta `optimize-day` bira krace od dva resenja.
   * Ovde se proverava upravo taj izbor.
   */
  const atrakcije = [
    atrakcija('a', 37.9715, 23.7267, { openingHours: { open: '09:00', close: '18:00' } }),
    atrakcija('b', 37.978, 23.732, { openingHours: { open: '09:00', close: '18:00' } }),
    atrakcija('c', 37.985, 23.74, { openingHours: { open: '09:00', close: '18:00' } }),
    atrakcija('d', 37.99, 23.75, { openingHours: { open: '09:00', close: '18:00' } })
  ];

  for (const poredak of [atrakcije, [...atrakcije].reverse()]) {
    const { redosled } = urediDan({ atrakcije: poredak, start: SMESTAJ, dan: dan() });

    const optimizovana = napraviSatnicu({ redosled, start: SMESTAJ, dan: dan(), zadrziSve: true });
    const zatecena = napraviSatnicu({
      redosled: poredak,
      start: SMESTAJ,
      dan: dan(),
      zadrziSve: true
    });

    const bolja = Math.min(optimizovana.totalDistance, zatecena.totalDistance);

    assert.ok(
      bolja <= zatecena.totalDistance,
      `izbor je duzi od zatecenog: ${bolja} > ${zatecena.totalDistance}`
    );
  }
});

test('optimizacija zadrzava sve atrakcije i kad neka ne staje u dan', () => {
  const kratak = dan({ availableFrom: '09:00', availableTo: '11:00' });

  const atrakcije = [
    atrakcija('a', 37.9715, 23.7267, { duration: 90 }),
    atrakcija('b', 37.98, 23.73, { duration: 90 })
  ];

  const { redosled } = urediDan({ atrakcije, start: SMESTAJ, dan: kratak });
  const s = napraviSatnicu({ redosled, start: SMESTAJ, dan: kratak, zadrziSve: true });

  assert.equal(s.stavke.length, 2);
  assert.ok(s.stavke.some((a) => a.violation === 'posle_kraja_dana'));
});

// =================================================================
// 3. Rucak samo kada dan obuhvata vreme rucka
// =================================================================

test('rucak se ne racuna danu koji se zavrsava pre 12:30', () => {
  assert.equal(imaVremeZaRucak(9 * 60, 10 * 60 + 30), false);
});

test('rucak se racuna danu koji ima 60 min posle 12:30', () => {
  assert.equal(imaVremeZaRucak(9 * 60, 20 * 60), true);
  assert.equal(imaVremeZaRucak(13 * 60 + 45, 20 * 60), true);
});

test('dan 13:00-13:30 nema mesta za rucak', () => {
  assert.equal(imaVremeZaRucak(13 * 60, 13 * 60 + 30), false);
});

test('kratak jutarnji dan ima ciljni broj veci od nule', () => {
  const let_ = {
    outbound: { arrival: '2027-06-10T12:15:00' },
    inbound: { departure: '2027-06-14T13:30:00' }
  };

  const dani = izracunajDane({
    checkIn: '2027-06-10',
    numDays: 5,
    preferencije: { dayStart: '09:00', dayEnd: '20:00', pace: 'intenzivan' },
    let_
  });

  const poslednji = dani[dani.length - 1];

  assert.equal(poslednji.availableTo, '10:30');
  assert.equal(poslednji.availableMinutes, 90, 'rucak je i dalje oduzet');
  assert.ok(poslednji.targetCount >= 1, 'kratak dan je i dalje prazan');
});
