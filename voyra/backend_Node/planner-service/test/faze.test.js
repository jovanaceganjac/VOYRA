const test = require('node:test');
const assert = require('node:assert/strict');

const { rangirajLetove, primeniFiltere, normalizuj } = require('../src/services/FazaLetovi');
const { rangirajSmestaj } = require('../src/services/FazaSmestaj');
const { izaberiAtrakcije, oceniAtrakcije } = require('../src/services/FazaAtrakcije');
const { izracunajDane, brojDana, ukupanCilj } = require('../src/services/Dani');
const { rasporediPoDanima, rebalansiraj } = require('../src/services/FazaRaspodela');
const {
  sastaviDan,
  urediDan,
  napraviSatnicu,
  najbliziSused,
  vremeKretanja
} = require('../src/services/FazaRedosled');
const KMeans = require('../src/utils/KMeans');
const { validirajPreferencije } = require('../src/utils/preferencijeValidator');
const { uMinute } = require('../src/utils/vreme');

/**
 * Deterministican generator (linearni kongruentni), da testovi koji
 * zavise od k-means-a uvek daju isti rezultat. K-means je nasumican po
 * prirodi, pa bi bez seed-a testovi bili nepouzdani.
 */
const seedRandom = (seed = 42) => {
  let stanje = seed;

  return () => {
    stanje = (stanje * 1664525 + 1013904223) % 4294967296;
    return stanje / 4294967296;
  };
};

const let_ = (id, cena, trajanje, presedanja, polazak = '2027-06-10T08:00:00Z') => ({
  id,
  offerId: id,
  price: cena,
  priceEUR: cena,
  duration: trajanje,
  stops: presedanja,
  departure: polazak,
  outbound: { departure: polazak, arrival: polazak, duration: trajanje, stops: presedanja, segments: [] },
  inbound: null
});

const atrakcija = (id, lat, lon, opcije = {}) => ({
  id,
  name: id,
  lat,
  lon,
  price: opcije.price ?? 0,
  duration: opcije.duration ?? 60,
  rating: opcije.rating ?? 4,
  categories: opcije.categories ?? ['kultura'],
  openingHours: opcije.openingHours,
  ...opcije
});

// =================================================================
// 1. Normalizacija
// =================================================================

test('normalizacija: jedna vrednost daje 0, bez deljenja nulom', () => {
  assert.deepEqual(normalizuj([42]), [0]);
});

test('normalizacija: sve iste vrednosti daju 0', () => {
  assert.deepEqual(normalizuj([100, 100, 100]), [0, 0, 0]);
});

test('normalizacija: min je 0, max je 1', () => {
  assert.deepEqual(normalizuj([10, 20, 30]), [0, 0.5, 1]);
});

// =================================================================
// 2. Tezine po prioritetu prevoza
// =================================================================

test('najjeftinije bira najjeftiniju ponudu', () => {
  const r = rangirajLetove([let_('skup', 400, 120, 0), let_('jeftin', 100, 600, 0)], {
    transportPriority: 'najjeftinije'
  });

  assert.equal(r.find((f) => f.recommended).id, 'jeftin');
});

test('najbrze bira najkracu ponudu', () => {
  const r = rangirajLetove([let_('skup', 400, 120, 0), let_('jeftin', 100, 600, 0)], {
    transportPriority: 'najbrze'
  });

  assert.equal(r.find((f) => f.recommended).id, 'skup');
});

test('balans bira kompromis - rucno sracunat primer', () => {
  // cene 100/200/400 -> c = 0, 0.333, 1
  // trajanja 600/300/120 -> t = 1, 0.375, 0
  // score = 0.5c + 0.5t:  jeftin 0.5 | sredina 0.354 | brz 0.5
  const ponude = [let_('jeftin', 100, 600, 0), let_('sredina', 200, 300, 0), let_('brz', 400, 120, 0)];
  const r = rangirajLetove(ponude, { transportPriority: 'balans' });

  assert.equal(r.find((f) => f.recommended).id, 'sredina');
  assert.equal(r.find((f) => f.id === 'sredina').score, 0.354);
});

test('kazna po presedanju ulazi u skor', () => {
  const r = rangirajLetove([let_('direktan', 100, 300, 0), let_('sa1', 100, 300, 1)], {
    transportPriority: 'najjeftinije'
  });

  assert.equal(r.find((f) => f.id === 'sa1').scoreBreakdown.presedanja, 0.1);
  assert.equal(r.find((f) => f.recommended).id, 'direktan');
});

test('budzet ne odseca ponude, samo ih oznaci', () => {
  const r = rangirajLetove([let_('skup', 900, 300, 0), let_('jeftin', 100, 300, 0)], {
    transportPriority: 'balans',
    budget: 500
  });

  assert.equal(r.length, 2);
  assert.equal(r.find((f) => f.id === 'skup').overBudget, true);
  assert.equal(r.find((f) => f.id === 'jeftin').overBudget, false);
});

// =================================================================
// 3. Filteri letova
// =================================================================

test('filter presedanja izbacuje ponude sa vise presedanja', () => {
  const r = primeniFiltere([let_('a', 100, 300, 0), let_('b', 100, 300, 2)], { maxStops: 1 });

  assert.deepEqual(r.map((f) => f.id), ['a']);
});

test('filter vremena polaska gleda odlazak', () => {
  const rano = let_('rano', 100, 300, 0, '2027-06-10T06:00:00Z');
  const kasno = let_('kasno', 100, 300, 0, '2027-06-10T18:00:00Z');

  const r = primeniFiltere([rano, kasno], { departureFrom: '10:00', departureTo: '20:00' });

  assert.deepEqual(r.map((f) => f.id), ['kasno']);
});

// =================================================================
// 4. Smestaj
// =================================================================

const smestaj = (id, cena, ocena, tip = 'hotel', distanca = 1) => ({
  id,
  name: id,
  type: tip,
  rating: ocena,
  pricePerNight: cena,
  price: cena,
  priceEUR: cena,
  totalPrice: cena * 4,
  nights: 4,
  distanceToCenter: distanca
});

test('filter tipa smestaja', () => {
  const { ponude } = rangirajSmestaj([smestaj('h', 80, 4), smestaj('x', 30, 4, 'hostel')], {
    preferencije: { accommodationTypes: ['hostel'] }
  });

  assert.deepEqual(ponude.map((s) => s.id), ['x']);
});

test('smestaj bez ocene prolazi filter po oceni i to se naznaci', () => {
  const { ponude } = rangirajSmestaj([smestaj('bez', 80, null), smestaj('slab', 80, 2)], {
    preferencije: { minAccommodationRating: 4 }
  });

  assert.deepEqual(ponude.map((s) => s.id), ['bez']);
  assert.equal(ponude[0].ratingUnknown, true);
});

test('preporuka je najbolje rangirana ponuda u preostalom budzetu', () => {
  // budzet 1000 - let 600 - ulaznice 50 = 350 preostalo
  const { ponude } = rangirajSmestaj(
    [smestaj('skup', 200, 5), smestaj('taman', 80, 4), smestaj('jeftin', 40, 3)],
    { preferencije: {}, budget: 1000, flightPrice: 600, attractionsEstimate: 50 }
  );

  const preporuka = ponude.find((s) => s.recommended);
  const prviUBudzetu = ponude.find((s) => s.totalPrice <= 350);

  assert.equal(preporuka.id, prviUBudzetu.id, 'preporuka je prva u rangiranju koja staje');
  assert.ok(preporuka.totalPrice <= 350);
  assert.equal(ponude.find((s) => s.id === 'skup').recommended, false, 'skup ne staje u budzet');
});

test('kada nijedan ne staje u budzet, preporucuje se najjeftiniji uz upozorenje', () => {
  const { ponude, upozorenja } = rangirajSmestaj([smestaj('a', 200, 5), smestaj('b', 100, 4)], {
    preferencije: {},
    budget: 700,
    flightPrice: 650,
    attractionsEstimate: 0
  });

  assert.equal(ponude.find((s) => s.recommended).id, 'b');
  assert.equal(upozorenja.length, 1);
});

// =================================================================
// 5. Faza 3: tempo, skraceni dani, ocena
// =================================================================

const preferencije = (dopuna = {}) => ({
  transportPriority: 'balans',
  accommodationTypes: ['hotel', 'apartman', 'hostel'],
  minAccommodationRating: null,
  interests: ['kultura', 'muzeji'],
  pace: 'umeren',
  dayStart: '09:00',
  dayEnd: '20:00',
  ...dopuna
});

test('tempo odredjuje ciljni broj aktivnosti po danu', () => {
  const opusten = izracunajDane({ checkIn: '2027-06-10', numDays: 3, preferencije: preferencije({ pace: 'opusten' }) });
  const intenzivan = izracunajDane({ checkIn: '2027-06-10', numDays: 3, preferencije: preferencije({ pace: 'intenzivan' }) });

  assert.equal(ukupanCilj(opusten), 6);
  assert.equal(ukupanCilj(intenzivan), 18);
});

test('prvi i poslednji dan se skracuju prema letu', () => {
  const dani = izracunajDane({
    checkIn: '2027-06-10',
    numDays: 3,
    preferencije: preferencije(),
    let_: {
      outbound: { arrival: '2027-06-10T11:00:00Z' },
      inbound: { departure: '2027-06-12T12:00:00Z' }
    }
  });

  // sletanje 11:00 + 90 min transfera
  assert.equal(dani[0].availableFrom, '12:30');
  // poletanje 12:00 - 180 min rezerve
  assert.equal(dani[2].availableTo, '09:00');
  assert.equal(dani[2].targetCount, 0, 'dan bez vremena nema aktivnosti');
  assert.match(dani[2].note, /nema dovoljno vremena/);
});

test('atrakcija bez poklapanja sa interesovanjima dobija nizu ocenu', () => {
  const [poklapa, ne] = oceniAtrakcije(
    [
      atrakcija('muzej', 0, 0, { categories: ['muzeji'], rating: 4 }),
      atrakcija('bar', 0, 0, { categories: ['nocni_zivot'], rating: 4 })
    ],
    ['muzeji']
  );

  assert.ok(poklapa.score > ne.score);
  assert.equal(poklapa.scoreBreakdown.interesovanja, 0.7);
  assert.equal(ne.scoreBreakdown.interesovanja, 0);
});

test('pohlepni izbor postuje ciljni broj i raspolozivo vreme', () => {
  const atrakcije = Array.from({ length: 10 }, (_, i) =>
    atrakcija(`a${i}`, 0, 0, { duration: 120, rating: 5 - i * 0.1 })
  );

  const { izabrane } = izaberiAtrakcije(atrakcije, {
    interesovanja: ['kultura'],
    ciljniBroj: 4,
    raspolozivoMinuta: 10000
  });

  assert.equal(izabrane.length, 4);

  const { izabrane: maloVremena } = izaberiAtrakcije(atrakcije, {
    interesovanja: ['kultura'],
    ciljniBroj: 10,
    raspolozivoMinuta: 250
  });

  assert.equal(maloVremena.length, 2, '250 min staje samo dve posete od 120 min');
});

// =================================================================
// 6-7. Faza 4: kapacitet, rebalansiranje, dodela danima
// =================================================================

test('posle rebalansiranja nijedna grupa nije preko kapaciteta', () => {
  const kmeans = new KMeans({ random: seedRandom(1) });

  const klasteri = [
    [{ x: 0, y: 0, attraction: atrakcija('a', 0, 0) }, { x: 0.01, y: 0, attraction: atrakcija('b', 0, 0.01) }, { x: 0.02, y: 0, attraction: atrakcija('c', 0, 0.02) }],
    [{ x: 5, y: 5, attraction: atrakcija('d', 5, 5) }]
  ];
  const centroidi = [{ x: 0.01, y: 0 }, { x: 5, y: 5 }];

  const posle = rebalansiraj(klasteri, centroidi, [2, 2], kmeans);

  assert.ok(posle[0].length <= 2);
  assert.ok(posle[1].length <= 2);
  assert.equal(posle[0].length + posle[1].length, 4, 'nijedna atrakcija se ne gubi');
});

test('rebalansiranje se zavrsava i kada su sve atrakcije u istoj tacki', () => {
  const kmeans = new KMeans({ random: seedRandom(7) });

  const klasteri = [
    Array.from({ length: 6 }, (_, i) => ({ x: 1, y: 1, attraction: atrakcija(`a${i}`, 1, 1) })),
    []
  ];

  const posle = rebalansiraj(klasteri, [{ x: 1, y: 1 }, { x: 1, y: 1 }], [3, 3], kmeans);

  assert.deepEqual(posle.map((g) => g.length).sort(), [3, 3]);
});

test('rebalansiranje staje kada ima vise atrakcija nego kapaciteta', () => {
  const kmeans = new KMeans({ random: seedRandom(3) });

  const klasteri = [Array.from({ length: 5 }, (_, i) => ({ x: 0, y: 0, attraction: atrakcija(`a${i}`, 0, 0) }))];
  const posle = rebalansiraj(klasteri, [{ x: 0, y: 0 }], [2], kmeans);

  assert.equal(posle[0].length, 5, 'nista se ne gubi, samo se ne moze rasporediti');
});

test('prvi i poslednji dan dobijaju grupe sa najmanjim trajanjem', () => {
  const dani = izracunajDane({ checkIn: '2027-06-10', numDays: 3, preferencije: preferencije({ pace: 'opusten' }) });

  // Tri jasno odvojene grupe: kratka, duga, srednja
  const atrakcije = [
    atrakcija('kratka1', 37.97, 23.72, { duration: 30 }),
    atrakcija('kratka2', 37.971, 23.721, { duration: 30 }),
    atrakcija('duga1', 38.5, 24.5, { duration: 180 }),
    atrakcija('duga2', 38.501, 24.501, { duration: 180 }),
    atrakcija('srednja1', 39.2, 25.4, { duration: 90 }),
    atrakcija('srednja2', 39.201, 25.401, { duration: 90 })
  ];

  // Sada raspodela vraca i spisak slobodnih dana (§6.3, odstupanje)
  const { raspored } = rasporediPoDanima(atrakcije, dani, { random: seedRandom(11) });

  const trajanje = (dan) => (raspored.get(dan) || []).reduce((z, a) => z + a.duration, 0);

  assert.ok(trajanje(1) <= trajanje(2), 'prvi dan nije duzi od srednjeg');
  assert.ok(trajanje(3) <= trajanje(2), 'poslednji dan nije duzi od srednjeg');
});

test('raspodela je ponovljiva sa istim seed-om', () => {
  const dani = izracunajDane({ checkIn: '2027-06-10', numDays: 3, preferencije: preferencije() });
  const atrakcije = Array.from({ length: 9 }, (_, i) =>
    atrakcija(`a${i}`, 37.9 + i * 0.05, 23.7 + i * 0.05)
  );

  const prvi = rasporediPoDanima(atrakcije, dani, { random: seedRandom(99) });
  const drugi = rasporediPoDanima(atrakcije, dani, { random: seedRandom(99) });

  for (const dan of [1, 2, 3]) {
    assert.deepEqual(
      (prvi.raspored.get(dan) || []).map((a) => a.id),
      (drugi.raspored.get(dan) || []).map((a) => a.id)
    );
  }

  assert.deepEqual(prvi.slobodniDani, drugi.slobodniDani);
});

// =================================================================
// 8. Faza 5: najblizi sused i 2-opt
// =================================================================

const dan = (dopuna = {}) => ({
  day: 1,
  date: '2027-06-10',
  availableFrom: '09:00',
  availableTo: '20:00',
  availableMinutes: 600,
  targetCount: 4,
  note: null,
  ...dopuna
});

test('najblizi sused krece od smestaja', () => {
  const smestajTacka = { lat: 37.97, lon: 23.72 };

  const put = najbliziSused(smestajTacka, [
    atrakcija('daleka', 38.2, 24.0),
    atrakcija('bliska', 37.975, 23.725)
  ]);

  assert.equal(put[0].id, 'bliska');
});

test('2-opt nikad ne produzava putanju', () => {
  const start = { lat: 37.97, lon: 23.72 };
  const atrakcije = [
    atrakcija('c', 37.99, 23.76),
    atrakcija('a', 37.972, 23.722),
    atrakcija('b', 37.98, 23.74)
  ];

  const { redosled } = urediDan({ atrakcije, start, dan: dan() });

  const Distances = require('../src/utils/Distances');
  const d = new Distances();
  const duzina = (niz) =>
    d.between(start, niz[0]) + niz.slice(0, -1).reduce((z, a, i) => z + d.between(a, niz[i + 1]), 0);

  assert.ok(duzina(redosled) <= duzina(atrakcije) + 1e-9);
});

// =================================================================
// 9. Satnica
// =================================================================

test('vreme kretanja: pesice do 2 km, prevozom preko', () => {
  assert.deepEqual(vremeKretanja(1), { travelMinutes: 12, travelMode: 'pesice', travelKm: 1 });
  assert.deepEqual(vremeKretanja(2), { travelMinutes: 24, travelMode: 'pesice', travelKm: 2 });
  assert.deepEqual(vremeKretanja(10), { travelMinutes: 30, travelMode: 'prevoz', travelKm: 10 });
});

test('rucak se ubacuje prvi put posle 12:30', () => {
  const start = { lat: 37.97, lon: 23.72 };
  const atrakcije = [
    atrakcija('pre', 37.971, 23.721, { duration: 180 }),
    atrakcija('posle', 37.972, 23.722, { duration: 60 })
  ];

  const s = napraviSatnicu({ redosled: atrakcije, start, dan: dan({ availableFrom: '10:00' }) });

  assert.ok(s.lunch, 'rucak postoji');
  assert.ok(uMinute(s.lunch.startTime) >= uMinute('12:30'));
});

test('nijedna aktivnost ne prelazi dayEnd', () => {
  const start = { lat: 37.97, lon: 23.72 };
  const atrakcije = Array.from({ length: 8 }, (_, i) =>
    atrakcija(`a${i}`, 37.97 + i * 0.002, 23.72, { duration: 120 })
  );

  const s = napraviSatnicu({ redosled: atrakcije, start, dan: dan({ availableTo: '16:00' }) });

  for (const a of s.stavke) {
    assert.ok(uMinute(a.endTime) <= uMinute('16:00'), `${a.id} zavrsava ${a.endTime}`);
  }

  assert.ok(s.nestale.length > 0, 'ono za sta nema vremena je prijavljeno');
});

// =================================================================
// 10. Radno vreme
// =================================================================

test('atrakcija zatvorena u vreme dolaska se premesta unutar dana', () => {
  const start = { lat: 37.97, lon: 23.72 };

  // Klub je blizi, pa ga najblizi sused stavlja PRVI - a tada je jos
  // zatvoren. Mora da zavrsi na kraju dana, a muzej da ide pre njega.
  const atrakcije = [
    atrakcija('klub', 37.9701, 23.7201, {
      duration: 60,
      openingHours: { open: '20:00', close: '23:00' },
      score: 0.9
    }),
    atrakcija('muzej', 37.98, 23.73, {
      duration: 60,
      openingHours: { open: '09:00', close: '17:00' },
      score: 0.8
    })
  ];

  const r = sastaviDan({ atrakcije, start, dan: dan({ availableFrom: '09:00', availableTo: '22:00' }) });

  assert.equal(r.attractions.length, 2, 'obe ostaju u danu');
  assert.equal(r.attractions[0].id, 'muzej', 'muzej ide prvi, dok je otvoren');
  assert.equal(r.attractions[1].id, 'klub', 'klub je premesten na kraj');
  assert.ok(r.attractions.every((a) => a.violation === null));
});

test('atrakcija koja ne moze ni u jednom terminu se uklanja sa razlogom', () => {
  const start = { lat: 37.97, lon: 23.72 };

  // Dan pocinje u 18:30, a muzej radi do 17:00 - nema termina za njega
  const atrakcije = [
    atrakcija('klub', 37.971, 23.721, {
      duration: 60,
      openingHours: { open: '20:00', close: '23:00' },
      score: 0.9
    }),
    atrakcija('muzej', 37.972, 23.722, {
      duration: 60,
      openingHours: { open: '09:00', close: '17:00' },
      score: 0.8
    })
  ];

  const r = sastaviDan({ atrakcije, start, dan: dan({ availableFrom: '18:30', availableTo: '23:30' }) });

  assert.deepEqual(r.attractions.map((a) => a.id), ['klub'], 'ostaje samo ono sto je moguce');
  assert.ok(r.removedAttractions.some((a) => a.id === 'muzej' && a.reason));
});

test('kada premestanje ne pomaze, uklanja se najlosije ocenjena i to se belezi', () => {
  const start = { lat: 37.97, lon: 23.72 };

  // Oba objekta rade samo ujutru, a dan pocinje po podne
  const atrakcije = [
    atrakcija('dobra', 37.971, 23.721, { duration: 60, openingHours: { open: '08:00', close: '10:00' }, score: 0.9 }),
    atrakcija('losa', 37.972, 23.722, { duration: 60, openingHours: { open: '08:00', close: '10:00' }, score: 0.2 })
  ];

  const r = sastaviDan({ atrakcije, start, dan: dan({ availableFrom: '14:00', availableTo: '20:00' }) });

  assert.ok(r.removedAttractions.length > 0, 'uklanjanje je zabelezeno');
  assert.ok(r.removedAttractions.every((a) => a.reason));
});

// =================================================================
// 11. Validacija preferencija
// =================================================================

test('nepoznata vrednost preferencije vraca gresku', () => {
  const r = validirajPreferencije({ pace: 'brzinski', interests: ['nesto'] });

  assert.equal(r.valid, false);
  assert.equal(r.errors.length, 2);
});

test('bez preferencija se koriste podrazumevane', () => {
  const r = validirajPreferencije(undefined);

  assert.equal(r.valid, true);
  assert.equal(r.value.pace, 'umeren');
  assert.deepEqual(r.value.interests, ['kultura', 'muzeji']);
});

test('dayEnd mora biti posle dayStart', () => {
  const r = validirajPreferencije({ dayStart: '20:00', dayEnd: '09:00' });

  assert.equal(r.valid, false);
  assert.match(r.errors[0], /dayEnd/);
});

test('broj dana ukljucuje i dan dolaska i dan povratka', () => {
  assert.equal(brojDana('2027-06-10', '2027-06-14'), 5);
  assert.equal(brojDana('2027-06-10', '2027-06-10'), 0);
});
