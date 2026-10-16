const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TravelPlanner = require('../src/services/TravelPlanner');
const { AKTIVNOSTI_PO_TEMPU } = require('../src/config/preferencije');

/**
 * TEMPO KOJI SE STVARNO POSTUJE (spec §4.2, §6.2, §6.3).
 *
 * Prijavljena greska: Atina, 5 dana, tempo "intenzivan" (5-6 aktivnosti)
 * daje plan sa PO JEDNOM aktivnoscu dnevno.
 *
 * Test ide kroz ceo TravelPlanner, sa laznim servisima i determinstickim
 * generatorom, jer se uzrok krije u saradnji faza 3 i 4 - ni jedna faza
 * sama za sebe ne pokazuje gresku.
 */

const seedRandom = (seed = 42) => {
  let stanje = seed;

  return () => {
    stanje = (stanje * 1664525 + 1013904223) % 4294967296;
    return stanje / 4294967296;
  };
};

/**
 * Atrakcije za Atinu iz `mock_data`, prevedene u interni oblik isto kao
 * u `AttractionsAdapter.normalize`.
 *
 * Namerno se cita STVARNI mock fajl: prijavljena greska je nastala i iz
 * koda i iz premalo podataka, pa test mora da vidi oba.
 */
const PUTANJA_MOCK = path.resolve(__dirname, '../../../mock_data/attractions.json');

const atrakcijeAtine = () => {
  const sve = JSON.parse(fs.readFileSync(PUTANJA_MOCK, 'utf8'));

  return sve
    .filter((a) => (a.grad || a.city || '').toLowerCase() === 'athens')
    .map((a) => ({
      id: `ATR${String(a.id).padStart(3, '0')}`,
      name: a.naziv,
      city: a.city || a.grad,
      categories: a.kategorije || [a.kategorija],
      category: a.kategorija,
      lat: a.lat,
      lon: a.lon,
      description: a.opis,
      price: a.cena,
      currency: 'EUR',
      duration: a.vremeTrajanja,
      rating: a.ocena,
      views: a.pregledi,
      openingHours: a.radnoVreme
    }));
};

/** BEG -> ATH, sletanje 12:15, povratak 13:30 - isto kao mock ponuda. */
const LET = {
  id: 'off_mock_2',
  offerId: 'off_mock_2',
  price: 328,
  priceEUR: 328,
  duration: 300,
  stops: 0,
  departure: '2027-06-10T09:45:00',
  arrival: '2027-06-10T12:15:00',
  outbound: {
    departure: '2027-06-10T09:45:00',
    arrival: '2027-06-10T12:15:00',
    duration: 150,
    stops: 0,
    segments: []
  },
  inbound: {
    departure: '2027-06-14T13:30:00',
    arrival: '2027-06-14T16:00:00',
    duration: 150,
    stops: 0,
    segments: []
  }
};

const SMESTAJ = {
  id: 'ACC004',
  name: 'Hotel Acropolis View',
  lat: 37.9715,
  lon: 23.7267,
  price: 150,
  pricePerNight: 150,
  priceEUR: 150,
  totalPrice: 600,
  currency: 'EUR',
  rating: 4.7,
  type: 'hotel',
  nights: 4
};

/**
 * Lazni servis: `detalji` vraca prazno, jer opis i slika idu preko mreze
 * (Wikimedia), a testovi moraju da rade i bez interneta.
 */
const laznaUsluga = (podaci) => ({ fetch: async () => podaci, detalji: async () => [] });

/**
 * @param {object} p - { pace, interests, atrakcije }
 * @returns plan za Atinu, 10.-14. 6. 2027.
 */
const napraviPlan = async ({
  pace = 'intenzivan',
  interests = ['kultura', 'muzeji'],
  atrakcije = atrakcijeAtine()
} = {}) => {
  const planner = new TravelPlanner(
    laznaUsluga([LET]),
    laznaUsluga([SMESTAJ]),
    laznaUsluga(atrakcije)
  );

  return planner.plan({
    from: 'BEG',
    to: 'ATH',
    checkIn: '2027-06-10',
    checkOut: '2027-06-14',
    passengers: 2,
    guests: 2,
    preferences: {
      interests,
      pace,
      transportPriority: 'balans',
      accommodationTypes: ['hotel'],
      dayStart: '09:00',
      dayEnd: '20:00'
    },
    random: seedRandom(42)
  });
};

/** Broj aktivnosti po danu, radi citljivih poruka o gresci. */
const poDanima = (plan) =>
  plan.itinerary.map((d) => ({
    dan: d.day,
    od: d.availableFrom,
    do: d.availableTo,
    aktivnosti: d.attractions.length
  }));

// =================================================================
// 1. Reprodukcija prijavljene greske
// =================================================================

test('intenzivan tempo: srednji dani imaju bar 5 aktivnosti', async () => {
  const plan = await napraviPlan({ pace: 'intenzivan' });
  const dani = poDanima(plan);

  // Dan 1 je skracen sletanjem, dan 5 povratkom - oni se ne broje
  const srednji = dani.slice(1, -1);

  for (const d of srednji) {
    assert.ok(
      d.aktivnosti >= 5,
      `dan ${d.dan} ima ${d.aktivnosti} aktivnosti, a tempo trazi 5-6\n` +
        `ceo plan: ${JSON.stringify(dani)}`
    );
  }
});

/** Minuti izmedju "HH:MM" i "HH:MM". */
const prozor = (od, do_) => {
  const uMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  return uMin(do_) - uMin(od);
};

test('intenzivan tempo: pun dan nikada nema samo jednu aktivnost', async () => {
  const plan = await napraviPlan({ pace: 'intenzivan' });

  // Kratki dani (dolazak, povratak) smeju da imaju jednu - tempo se
  // skracuje srazmerno raspolozivom vremenu. Pun dan ne sme.
  const puni = poDanima(plan).filter((d) => prozor(d.od, d.do) >= 6 * 60);
  const mrsavi = puni.filter((d) => d.aktivnosti <= 1);

  assert.equal(
    mrsavi.length,
    0,
    `puni dani sa najvise jednom aktivnoscu: ${JSON.stringify(mrsavi)}\n` +
      `ceo plan: ${JSON.stringify(poDanima(plan))}`
  );
});

// =================================================================
// 2. Ostali tempovi
// =================================================================

test('opusten tempo: srednji dani imaju 2 aktivnosti', async () => {
  const plan = await napraviPlan({ pace: 'opusten' });
  const srednji = poDanima(plan).slice(1, -1);

  for (const d of srednji) {
    assert.equal(
      d.aktivnosti,
      AKTIVNOSTI_PO_TEMPU.opusten,
      `dan ${d.dan}: ${d.aktivnosti}, ocekivano ${AKTIVNOSTI_PO_TEMPU.opusten}`
    );
  }
});

test('umeren tempo: srednji dani imaju 4 aktivnosti', async () => {
  const plan = await napraviPlan({ pace: 'umeren' });
  const srednji = poDanima(plan).slice(1, -1);

  for (const d of srednji) {
    assert.equal(d.aktivnosti, AKTIVNOSTI_PO_TEMPU.umeren, `dan ${d.dan}: ${d.aktivnosti}`);
  }
});

// =================================================================
// 3. Prvi dan je skracen letom, ali nije prazan
// =================================================================

test('prvi dan ima manje aktivnosti od punog dana, ali vise od nule', async () => {
  const plan = await napraviPlan({ pace: 'intenzivan' });
  const [prvi] = poDanima(plan);

  assert.ok(prvi.aktivnosti > 0, 'prvi dan je ostao prazan');
  assert.ok(
    prvi.aktivnosti < AKTIVNOSTI_PO_TEMPU.intenzivan,
    `prvi dan ima ${prvi.aktivnosti} aktivnosti, a skracen je sletanjem u 12:15`
  );
});

// =================================================================
// 4. Premalo atrakcija: dani se popunjavaju, visak ostaje slobodan
// =================================================================

test('sa osam atrakcija dani se popunjavaju, a ostali su slobodni', async () => {
  const osam = atrakcijeAtine().slice(0, 8);
  const plan = await napraviPlan({ pace: 'intenzivan', atrakcije: osam });
  const dani = poDanima(plan);

  const puni = dani.filter((d) => d.aktivnosti > 0);
  const slobodni = plan.itinerary.filter((d) => d.freeDay);

  assert.ok(puni.length < dani.length, 'nijedan dan nije ostao slobodan');
  assert.ok(slobodni.length > 0, 'nema dana oznacenog kao slobodan');

  // Ono sto jeste popunjeno mora da bude popunjeno DO VRHA, a ne razvuceno
  const najpuniji = Math.max(...puni.map((d) => d.aktivnosti));
  assert.ok(
    najpuniji >= 4,
    `najpuniji dan ima ${najpuniji} aktivnosti: ${JSON.stringify(dani)}`
  );

  for (const d of slobodni) {
    assert.match(d.note, /Nema više atrakcija/);
  }
});

test('slobodni dani nose upozorenje na nivou plana', async () => {
  const plan = await napraviPlan({ pace: 'intenzivan', atrakcije: atrakcijeAtine().slice(0, 8) });

  const upozorenje = plan.warnings.find((u) => /ostavljen/.test(u));

  assert.ok(upozorenje, `nema upozorenja o slobodnim danima: ${JSON.stringify(plan.warnings)}`);
  assert.match(upozorenje, /opušteniji tempo/);
});

// =================================================================
// 5. Atrakcije van interesovanja samo dopunjuju
// =================================================================

test('sa dovoljno atrakcija u interesovanjima nijedna van njih ne ulazi', async () => {
  const plan = await napraviPlan({ pace: 'opusten', interests: ['kultura'] });

  const van = plan.itinerary
    .flatMap((d) => d.attractions)
    .filter((a) => a.outsideInterests);

  assert.equal(van.length, 0, `u plan su usle atrakcije van interesovanja: ${van.map((a) => a.name)}`);
});

test('kada u interesovanjima nema dovoljno, dopuna se oznacava', async () => {
  // "nocni_zivot" u Atini ima svega nekoliko mesta, a intenzivan tempo
  // trazi 21 - ostatak mora da dodje spolja, uz oznaku
  const plan = await napraviPlan({ pace: 'intenzivan', interests: ['nocni_zivot'] });

  const sve = plan.itinerary.flatMap((d) => d.attractions);
  const van = sve.filter((a) => a.outsideInterests);

  assert.ok(sve.length > 0, 'plan je ostao prazan');
  assert.ok(van.length > 0, 'nijedna atrakcija nije oznacena kao van interesovanja');

  /*
   * Nocni zivot radi od 20:00, a dan se zavrsava u 20:00, pa vecina tih
   * mesta ne moze da stane. Plan zato mora da KAZE zasto ih nema, umesto
   * da ih preskoci u tisini.
   */
  const izbacene = plan.removedAttractions || [];

  assert.ok(
    izbacene.some((a) => /nema dovoljno vremena|zatvoreno/.test(a.reason)),
    `nema obrazlozenja za izostavljena mesta: ${JSON.stringify(izbacene.map((a) => a.reason))}`
  );
});

test('mesto koje ne staje ni samo ne prazni ceo dan', async () => {
  // Ranije je popravka izbacivala najslabije ocenjene atrakcije - a to su
  // upravo one koje bi stale - dok dan ne bi ostao prazan
  const plan = await napraviPlan({ pace: 'intenzivan', interests: ['nocni_zivot'] });
  const dani = poDanima(plan);

  const saVremenom = dani.filter((d) => d.do !== d.od).slice(0, -1);
  const prazni = saVremenom.filter((d) => d.aktivnosti === 0);

  assert.equal(
    prazni.length,
    0,
    `dani bez ijedne aktivnosti: ${JSON.stringify(prazni)}
ceo plan: ${JSON.stringify(dani)}`
  );
});

// =================================================================
// 6. Rucak samo kada dan obuhvata vreme rucka
// =================================================================

test('kratak jutarnji dan nema rucak i ima bar jednu aktivnost', async () => {
  const plan = await napraviPlan({ pace: 'intenzivan' });
  const poslednji = plan.itinerary[plan.itinerary.length - 1];

  // 09:00-10:30 je 90 min: rucak bi ga sveo na 30 i dan bi ostao prazan
  assert.equal(poslednji.availableFrom, '09:00');
  assert.equal(poslednji.availableTo, '10:30');
  assert.equal(poslednji.lunch, null, 'rucak je ubacen u dan koji se zavrsava pre 12:30');
  assert.ok(
    poslednji.attractions.length >= 1,
    `poslednji dan je ostao prazan: ${JSON.stringify(poslednji.note)}`
  );
});

test('dan koji se proteze preko 12:30 i dalje dobija rucak', async () => {
  const plan = await napraviPlan({ pace: 'intenzivan' });
  const prvi = plan.itinerary[0];

  assert.equal(prvi.availableFrom, '13:45');
  assert.ok(prvi.lunch, 'dan od 13:45 do 20:00 je ostao bez rucka');
});

module.exports = { napraviPlan, poDanima, atrakcijeAtine, seedRandom, LET, SMESTAJ };
