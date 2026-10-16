/**
 * Integracione provere: referentni podaci o gradovima, pretraga,
 * gradovi bez aerodroma, transfer i demo rezim.
 *
 *   npm run proba:gradovi
 *
 * Trazi POKRENUTE servise (gateway 4000 i sve iza njega) i uvezenu bazu
 * gradova (`npm run import:gradovi`). Radi u mock/demo rezimu i ne pravi
 * nijedan zapis - samo cita.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const axios = require('axios');

const City = require('../src/models/City');
const Airport = require('../src/models/Airport');
const { OZNAKE_DRZAVA } = require('../src/config/evropa');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/trips_db';

const DATUMI = { checkIn: '2027-06-10', checkOut: '2027-06-14' };

let pali = 0;

const tacno = (sta, uslov, opis = '') => {
  console.log(`${uslov ? 'OK  ' : 'PAD '} ${sta}${opis ? `: ${opis}` : ''}`);
  if (!uslov) pali += 1;
};

const mora = (sta, vrednost) => {
  if (vrednost === undefined || vrednost === null) {
    throw new Error(`${sta} nije pronadjeno - dalje provere nemaju smisla`);
  }
  return vrednost;
};

const poziv = async (metod, putanja, telo) => {
  const r = await axios({
    method: metod,
    url: `${GATEWAY}${putanja}`,
    data: telo,
    timeout: 180000,
    validateStatus: () => true
  });

  return { status: r.status, telo: r.data };
};

const naslov = (tekst) => console.log(`\n--- ${tekst} ---`);

/** Prvi predlog za upit. */
const prvi = async (q) => {
  const { telo } = await poziv('get', `/v1/cities?q=${encodeURIComponent(q)}&limit=5`);
  return (telo.data || [])[0] || null;
};

/** Plan za zadatu rutu, preko identifikatora gradova. */
const plan = async (fromCityId, toCityId, preferencije = {}) => {
  const { status, telo } = await poziv('post', '/v1/plan', {
    fromCityId,
    toCityId,
    ...DATUMI,
    passengers: 2,
    guests: 2,
    preferences: {
      interests: ['kultura'],
      pace: 'umeren',
      transportPriority: 'balans',
      accommodationTypes: ['hotel'],
      dayStart: '09:00',
      dayEnd: '20:00',
      ...preferencije
    }
  });

  if (status !== 200) throw new Error(`/v1/plan je vratio ${status}: ${JSON.stringify(telo)}`);

  return telo;
};

(async () => {
  await mongoose.connect(MONGO);

  // =================================================================
  // 1. Uvoz: broj gradova i aerodroma po drzavi
  // =================================================================
  naslov('1. Obuhvat uvoza');

  const ukupnoGradova = await City.countDocuments();
  const ukupnoAerodroma = await Airport.countDocuments();

  console.log(`     Gradova: ${ukupnoGradova}, aerodroma: ${ukupnoAerodroma}`);

  tacno('baza gradova je uvezena', ukupnoGradova > 10000, `${ukupnoGradova} gradova`);
  tacno('baza aerodroma je uvezena', ukupnoAerodroma > 300, `${ukupnoAerodroma} aerodroma`);

  const poDrzavi = await Airport.aggregate([
    { $group: { _id: '$drzava', broj: { $sum: 1 } } },
    { $sort: { broj: -1 } }
  ]);

  const gradoviPoDrzavi = await City.aggregate([
    { $group: { _id: '$drzava', broj: { $sum: 1 } } },
    { $sort: { broj: -1 } }
  ]);

  const brojGradova = new Map(gradoviPoDrzavi.map((r) => [r._id, r.broj]));

  console.log('     Prvih 12 drzava (aerodroma / gradova):');
  for (const r of poDrzavi.slice(0, 12)) {
    console.log(`       ${r._id}: ${r.broj} / ${brojGradova.get(r._id) || 0}`);
  }

  const nemacka = poDrzavi.find((r) => r._id === 'DE');
  tacno('Nemacka ima bar 20 aerodroma', (nemacka?.broj || 0) >= 20, `${nemacka?.broj} aerodroma`);

  tacno(
    'svaka drzava iz obuhvata ima bar jedan grad',
    OZNAKE_DRZAVA.every((d) => (brojGradova.get(d) || 0) > 0),
    `${OZNAKE_DRZAVA.filter((d) => !brojGradova.get(d)).join(', ') || 'sve pokrivene'}`
  );

  // Drugi uvoz ne menja broj zapisa: `_id` je geonameId / IATA kod, pa je
  // upis idempotentan. Ovde se proverava da nema duplikata po nazivu+drzavi.
  const duplikati = await City.aggregate([
    { $group: { _id: { n: '$naziv', d: '$drzava', lat: '$lat' }, broj: { $sum: 1 } } },
    { $match: { broj: { $gt: 1 } } },
    { $limit: 5 }
  ]);

  tacno('nema dvostruko uvezenih gradova', duplikati.length === 0, `${duplikati.length} duplikata`);

  // =================================================================
  // 2. Obuhvat: nema Rusije i Belorusije, ima Turske i Kipra
  // =================================================================
  naslov('2. Granice obuhvata');

  for (const d of ['RU', 'BY']) {
    const broj = await City.countDocuments({ drzava: d });
    tacno(`${d} nije u bazi`, broj === 0, `${broj} gradova`);
  }

  for (const d of ['TR', 'CY']) {
    const broj = await City.countDocuments({ drzava: d });
    tacno(`${d} je u bazi`, broj > 0, `${broj} gradova`);
  }

  // =================================================================
  // 3. Pretraga: prvi rezultat je onaj koji korisnik trazi
  // =================================================================
  naslov('3. Pretraga gradova');

  const UPITI = [
    ['munch', 'Minhen'],
    ['münch', 'Minhen'],
    ['minh', 'Minhen'],
    ['beč', 'Beč'],
    ['wien', 'Beč'],
    ['thessal', 'Solun'],
    ['solun', 'Solun'],
    ['zürich', 'Cirih'],
    ['zurich', 'Cirih'],
    ['kraków', 'Krakov'],
    ['krakow', 'Krakov'],
    ['ljub', 'Ljubljana']
  ];

  for (const [q, ocekivano] of UPITI) {
    const g = await prvi(q);
    tacno(`„${q}" -> ${ocekivano}`, g?.naziv === ocekivano, `dobijeno ${g?.naziv || 'nista'}`);
  }

  tacno('upit od jednog znaka je odbijen', (await poziv('get', '/v1/cities?q=m')).status === 400);

  // =================================================================
  // 4. Bled: grad bez sopstvenog aerodroma
  // =================================================================
  naslov('4. Grad bez aerodroma');

  const bled = mora('Bled', await prvi('bled'));

  tacno('Bled je nadjen', bled.naziv === 'Bled' && bled.drzava === 'SI');
  tacno('Bled nosi oznaku bezAerodroma', bled.bezAerodroma === true);
  tacno('Bled ipak ima let', bled.bezLeta === false);
  tacno(
    'najblizi aerodrom je LJU, 30-60 km',
    bled.aerodrom?.iata === 'LJU' &&
      bled.aerodrom.udaljenostKm >= 30 &&
      bled.aerodrom.udaljenostKm <= 60,
    `${bled.aerodrom?.iata} na ${bled.aerodrom?.udaljenostKm} km`
  );

  // =================================================================
  // 5. London i Pariz: pretraga leta ide preko koda grada
  // =================================================================
  naslov('5. Gradovi sa vise aerodroma');

  for (const [q, kod] of [
    ['london', 'LON'],
    ['pariz', 'PAR'],
    ['milano', 'MIL']
  ]) {
    const g = mora(q, await prvi(q));

    tacno(
      `${g.naziv} ima kod grada ${kod}`,
      g.iataGrada === kod,
      `iataGrada=${g.iataGrada}, aerodroma ${g.aerodromi.length}`
    );
  }

  // =================================================================
  // 6. Plan za Bled: transfer od aerodroma
  // =================================================================
  naslov('6. Transfer do grada bez aerodroma');

  const beograd = mora('Beograd', await prvi('beograd'));
  const zaBled = await plan(beograd.id, bled.id);

  const letBled = mora('let za Bled', zaBled.itinerary?.selectedFlight);
  const prviDan = mora('prvi dan plana', zaBled.itinerary?.itinerary?.[0]);

  const sletanje = String(letBled.outbound?.arrival || letBled.arrival).slice(11, 16);
  // `availableFrom` je pocetak raspolozivog prozora prvog dana
  const pocetak = String(prviDan.availableFrom || '').slice(0, 5);

  console.log(`     sletanje ${sletanje}, prvi dan pocinje ${pocetak}`);

  tacno(
    'prvi dan pocinje posle sletanja',
    Boolean(pocetak) && pocetak > sletanje,
    `${sletanje} -> ${pocetak}`
  );

  const porukaTransfera = (zaBled.itinerary?.warnings || [])
    .concat(zaBled.warnings || [])
    .find((w) => w.includes('LJU') && w.includes('km'));

  tacno('poruka o transferu postoji', Boolean(porukaTransfera), porukaTransfera || 'nema');

  tacno(
    'poruka navodi procenjen transfer',
    Boolean(porukaTransfera && porukaTransfera.includes('transfer')),
    porukaTransfera || ''
  );

  // =================================================================
  // 7. Stari zahtev from=BEG&to=ATH i dalje radi, i to isto
  // =================================================================
  naslov('7. Stari oblik zahteva (IATA kod)');

  const staro = async () => {
    const { status, telo } = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      ...DATUMI,
      passengers: 2,
      guests: 2,
      preferences: {
        interests: ['kultura', 'muzeji'],
        pace: 'umeren',
        transportPriority: 'balans',
        accommodationTypes: ['hotel'],
        dayStart: '09:00',
        dayEnd: '20:00'
      }
    });

    if (status !== 200) throw new Error(`stari oblik je vratio ${status}`);

    return telo;
  };

  const prvoAtina = await staro();
  const drugoAtina = await staro();

  /** Prozori dana - zavise od leta, ne od grupisanja. */
  const prozori = (p) =>
    (p.itinerary?.itinerary || []).map((d) => `${d.day}:${d.availableFrom}-${d.availableTo}`);

  /** Skup izabranih atrakcija, bez obzira na raspored po danima. */
  const skupAtrakcija = (p) =>
    (p.itinerary?.itinerary || [])
      .flatMap((d) => (d.attractions || []).map((a) => a.id))
      .sort();

  tacno(
    'stari zahtev daje plan',
    (prvoAtina.itinerary?.itinerary || []).length > 0,
    `${prvoAtina.itinerary?.itinerary?.length} dana`
  );

  tacno(
    'razresen je grad Atina, ne samo kod',
    prvoAtina.request?.toCity?.naziv === 'Atina',
    prvoAtina.request?.toCity?.naziv || 'nema toCity'
  );

  tacno(
    'let i smestaj su isti kao pre',
    prvoAtina.itinerary?.selectedFlight?.offerId ===
      drugoAtina.itinerary?.selectedFlight?.offerId &&
      prvoAtina.itinerary?.selectedAccommodation?.id ===
        drugoAtina.itinerary?.selectedAccommodation?.id,
    `${prvoAtina.itinerary?.selectedFlight?.airline}, ${prvoAtina.itinerary?.selectedAccommodation?.name}`
  );

  tacno(
    'prozori dana su isti',
    JSON.stringify(prozori(prvoAtina)) === JSON.stringify(prozori(drugoAtina)),
    prozori(prvoAtina).join(' ')
  );

  /*
   * Skup KANDIDATA je isti; raspored po danima NIJE bit-po-bit isti i nije
   * ni bio pre ovog taska: pocetne centroide u k-means++ bira Math.random
   * (KMeans uzima seed samo kada mu se prosledi), pa se pojedina atrakcija
   * premesti iz dana u dan, a popravka rasporeda tada izbaci drugu. Zato se
   * ovde proverava sto je stabilno - let, smestaj, prozori dana i broj
   * kandidata - a determinizam SA seed-om pokrivaju jedinicni testovi
   * Plannera (`npm --prefix planner-service test`, 59 provera).
   */
  tacno(
    'isti broj kandidata za atrakcije',
    prvoAtina.itinerary?.meta?.attractionsFound === drugoAtina.itinerary?.meta?.attractionsFound,
    `${prvoAtina.itinerary?.meta?.attractionsFound} = ${drugoAtina.itinerary?.meta?.attractionsFound}`
  );

  const razlikaBroja = Math.abs(skupAtrakcija(prvoAtina).length - skupAtrakcija(drugoAtina).length);

  tacno(
    'broj rasporedjenih atrakcija se ne razlikuje vise od 3',
    razlikaBroja <= 3,
    `${skupAtrakcija(prvoAtina).length} vs ${skupAtrakcija(drugoAtina).length}`
  );

  tacno(
    'Atina i dalje ima atrakcije',
    skupAtrakcija(prvoAtina).length > 0,
    `${skupAtrakcija(prvoAtina).length} u planu, ${prvoAtina.itinerary?.meta?.attractionsFound} nadjeno`
  );

  tacno(
    'atrakcije su iz stvarnih podataka o Atini',
    prvoAtina.itinerary?.meta?.attractionsFound >= 50,
    `${prvoAtina.itinerary?.meta?.attractionsFound} atrakcija`
  );

  // =================================================================
  // 8. Migracija starih putovanja
  // =================================================================
  naslov('8. Migracija putovanja');

  const Trip = require('../src/models/Trip');

  const bezGrada = await Trip.countDocuments({
    $or: [{ toCity: null }, { toCity: { $exists: false } }]
  });

  const ukupnoPutovanja = await Trip.countDocuments();

  tacno(
    'sva putovanja imaju grad odredista',
    bezGrada === 0,
    `${ukupnoPutovanja - bezGrada} / ${ukupnoPutovanja}`
  );

  // =================================================================
  // 9. Demo letovi
  // =================================================================
  naslov('9. Demo ponude');

  const { demoLetovi } = require('../../integration-service/src/utils/demoGenerator');

  const ulaz = {
    from: 'BEG',
    to: 'OPO',
    ...DATUMI,
    passengers: 2,
    odKoordinate: { lat: 44.8, lon: 20.46 },
    doKoordinate: { lat: 41.15, lon: -8.61 }
  };

  const a = demoLetovi(ulaz);
  const b = demoLetovi(ulaz);

  /*
   * `expiresAt` je namerno izostavljen: rok trajanja ponude tece od
   * trenutka pravljenja, kao i kod stvarnog Duffel-a. Sve ostalo - cene,
   * vremena, brojevi letova - mora da bude isto za isti ulaz.
   */
  const bezRoka = (ponude) =>
    JSON.stringify(ponude.map(({ expiresAt, ...ostalo }) => ostalo));

  tacno('isti ulaz daje isti izlaz', bezRoka(a) === bezRoka(b));
  tacno('kompanija je Demo Air', a.every((p) => p.airline === 'Demo Air'));
  tacno('ponude su poredjane po ceni', a.every((p, i) => i === 0 || p.price >= a[i - 1].price));

  const kratka = demoLetovi({
    ...ulaz,
    to: 'SKG',
    doKoordinate: { lat: 40.64, lon: 22.94 }
  });

  console.log(
    `     BEG-OPO ${a[0].distanceKm} km / ${a[0].outbound.duration} min;` +
      ` BEG-SKG ${kratka[0].distanceKm} km / ${kratka[0].outbound.duration} min`
  );

  tacno(
    'duza ruta daje duzi let',
    a[0].outbound.duration > kratka[0].outbound.duration,
    `${a[0].outbound.duration} > ${kratka[0].outbound.duration} min`
  );

  tacno(
    'duza ruta je skuplja',
    Math.min(...a.map((p) => p.price)) > Math.min(...kratka.map((p) => p.price))
  );

  // =================================================================
  // 10. Brzina pretrage
  // =================================================================
  naslov('10. Brzina pretrage');

  const UZORAK = ['be', 'beo', 'par', 'lon', 'min', 'ath', 'za', 'ist', 'bud', 'kra'];
  const CityService = require('../src/services/CityService');
  const servis = new CityService();

  // Bez kesa: meri se sam upit nad bazom, ne ponovno citanje odgovora
  servis.ocistiKes();

  const pocetakMerenja = Date.now();
  let broj = 0;

  for (let i = 0; i < 10; i++) {
    for (const q of UZORAK) {
      servis.ocistiKes();
      await servis.pretrazi(q, 8);
      broj += 1;
    }
  }

  const prosek = (Date.now() - pocetakMerenja) / broj;

  console.log(`     ${broj} upita, prosek ${prosek.toFixed(1)} ms (bez kesa)`);

  tacno('prosek ispod 50 ms', prosek < 50, `${prosek.toFixed(1)} ms`);

  const saKesom = Date.now();
  for (let i = 0; i < 100; i++) await servis.pretrazi(UZORAK[i % UZORAK.length], 8);
  console.log(`     sa kesom: ${((Date.now() - saKesom) / 100).toFixed(2)} ms po upitu`);

  // =================================================================
  naslov('Rezultat');

  await mongoose.disconnect();

  if (pali > 0) {
    console.log(`\nPALO PROVERA: ${pali}`);
    process.exit(1);
  }

  console.log('\nSVE PROVERE PROLAZE');
})().catch(async (err) => {
  console.error('\nPROBA PREKINUTA:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
