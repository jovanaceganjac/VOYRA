const test = require('node:test');
const assert = require('node:assert/strict');

const TravelPlanner = require('../src/services/TravelPlanner');

/**
 * IZABRANI LET I SMESTAJ U PLANU (korak 4 carobnjaka).
 *
 * Prijavljena greska: posle izbora leta i hotela (Rim) korak „Plan"
 * uvek javlja „Izabrani let vise nije dostupan".
 *
 * Uzroci:
 *   1. LiteAPI smestaj nosi `id` hotela I `offerId` sobe. Klijent bira
 *      hotel po `id`-ju, a planer je poredio samo `offerId ?? id` - pa
 *      izabran hotel nikad nije pronadjen (mock smestaj nema `offerId`,
 *      zato demo rezim to nije pokazivao).
 *   2. Duffel svakoj pretrazi daje NOVE id-jeve ponuda, pa izabrani let
 *      nije u listi cim ponovna pretraga ne pogodi isti zapis u kesu.
 */

const noga = (dan, od, do_) => ({
  departure: `${dan}T${od}:00`,
  arrival: `${dan}T${do_}:00`,
  duration: 120,
  stops: 0,
  segments: [{ from: 'BEG', to: 'FCO', departure: `${dan}T${od}:00`, arrival: `${dan}T${do_}:00` }]
});

const let_ = (offerId, cena) => ({
  id: offerId,
  offerId,
  expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
  from: 'BEG',
  to: 'FCO',
  price: cena,
  priceEUR: cena,
  duration: 240,
  stops: 0,
  departure: '2027-06-10T08:00:00',
  arrival: '2027-06-10T10:00:00',
  outbound: noga('2027-06-10', '08:00', '10:00'),
  inbound: noga('2027-06-14', '12:00', '14:00')
});

/** Oblik iz LiteApiHotelAdapter-a: `id` hotela i `offerId` sobe se razlikuju. */
const hotel = (id, tip = 'hotel', cena = 120) => ({
  id,
  offerId: `ofr_${Math.random().toString(16).slice(2, 10)}`,
  name: `Hotel ${id}`,
  type: tip,
  rating: 4.2,
  lat: 41.89,
  lon: 12.49,
  pricePerNight: cena,
  price: cena,
  priceEUR: cena,
  totalPrice: cena * 4,
  nights: 4,
  currency: 'EUR'
});

const atrakcije = () =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `ATR${i}`,
    name: `Mesto ${i}`,
    categories: ['kultura'],
    category: 'kultura',
    lat: 41.89 + i * 0.002,
    lon: 12.48 + i * 0.002,
    price: 0,
    duration: 60,
    rating: 4.5,
    views: 1000
  }));

/**
 * @param {object} p
 * @param {object[]} p.letovi - sta vraca ponovna pretraga
 * @param {Function} [p.izabrana] - odgovor Integration Service-a po offerId-ju
 * @param {object[]} p.smestaji
 */
const napraviPlanner = ({ letovi, izabrana = async () => null, smestaji }) => {
  const pozivi = { izabrana: [] };

  const flightService = {
    fetch: async () => letovi,
    izabrana: async (id) => {
      pozivi.izabrana.push(id);
      return izabrana(id);
    }
  };

  const planner = new TravelPlanner(
    flightService,
    { fetch: async () => smestaji },
    { fetch: async () => atrakcije(), detalji: async () => [] },
    { zaGrad: async () => [] }
  );

  return { planner, pozivi };
};

const upit = (dodatno = {}) => ({
  from: 'BEG',
  to: 'ROM',
  checkIn: '2027-06-10',
  checkOut: '2027-06-14',
  passengers: 1,
  guests: 1,
  destination: { id: 'rim', naziv: 'Rim', nazivEn: 'Rome', drzava: 'IT', lat: 41.89, lon: 12.48 },
  preferences: { interests: ['kultura'], transportPriority: 'balans' },
  random: () => 0.5,
  ...dodatno
});

test('izbor smestaja po id-ju hotela (LiteAPI oblik sa offerId sobe)', async () => {
  // Ponovna pretraga cena daje nov offerId sobe, id hotela ostaje isti
  const { planner } = napraviPlanner({
    letovi: [let_('off_a', 300)],
    smestaji: [hotel('lp_1'), hotel('lp_2', 'hotel', 90)]
  });

  const plan = await planner.plan(
    upit({ selectedFlightOfferId: 'off_a', selectedAccommodationId: 'lp_2' })
  );

  assert.equal(plan.selectedAccommodation.id, 'lp_2');
  assert.equal(plan.selectedFlight.offerId, 'off_a');
  assert.ok(plan.itinerary.length > 0);
});

test('let iz ponovne pretrage sa novim id-jevima se nalazi po offerId-ju', async () => {
  // Duffel: nova pretraga -> novi id-jevi; izabrani `off_stari` nije u listi
  const izabran = let_('off_stari', 275);

  const { planner, pozivi } = napraviPlanner({
    letovi: [let_('off_novi_1', 300), let_('off_novi_2', 260)],
    izabrana: async (id) => (id === 'off_stari' ? izabran : null),
    smestaji: [hotel('lp_1')]
  });

  const plan = await planner.plan(
    upit({ selectedFlightOfferId: 'off_stari', selectedAccommodationId: 'lp_1' })
  );

  assert.deepEqual(pozivi.izabrana, ['off_stari']);
  assert.equal(plan.selectedFlight.offerId, 'off_stari');
  // Cena je ona koju je korisnik video, ne neka druga ponuda
  assert.equal(plan.totalBudget.flights, 275);
  assert.ok(plan.flights.some((f) => f.offerId === 'off_stari'));
  assert.equal(plan.flights.filter((f) => f.recommended).length, 1);
});

test('let koji je u listi ne trazi dodatnu proveru', async () => {
  const { planner, pozivi } = napraviPlanner({
    letovi: [let_('off_a', 300)],
    smestaji: [hotel('lp_1')]
  });

  await planner.plan(upit({ selectedFlightOfferId: 'off_a', selectedAccommodationId: 'lp_1' }));

  assert.deepEqual(pozivi.izabrana, []);
});

test('stvarno istekao let -> 410 SELECTION_EXPIRED sa selection=flight', async () => {
  const { planner } = napraviPlanner({
    letovi: [let_('off_novi', 300)],
    izabrana: async () => null,
    smestaji: [hotel('lp_1')]
  });

  await assert.rejects(
    planner.plan(upit({ selectedFlightOfferId: 'off_istekao', selectedAccommodationId: 'lp_1' })),
    (e) => e.statusCode === 410 && e.code === 'SELECTION_EXPIRED' && e.selection === 'flight'
  );
});

test('smestaj koji ne postoji -> 410 sa selection=accommodation', async () => {
  const { planner } = napraviPlanner({
    letovi: [let_('off_a', 300)],
    smestaji: [hotel('lp_1')]
  });

  await assert.rejects(
    planner.plan(upit({ selectedFlightOfferId: 'off_a', selectedAccommodationId: 'lp_nema' })),
    (e) => e.statusCode === 410 && e.selection === 'accommodation'
  );
});

test('smestaj izabran uz drugaciji filter koraka 3 ne nestaje u planu', async () => {
  // Korak 1: samo hoteli; korak 3: korisnik je ukljucio i apartmane
  const { planner } = napraviPlanner({
    letovi: [let_('off_a', 300)],
    smestaji: [hotel('lp_hotel'), hotel('lp_apartman', 'apartman', 80)]
  });

  const plan = await planner.plan(
    upit({
      selectedFlightOfferId: 'off_a',
      selectedAccommodationId: 'lp_apartman',
      preferences: { interests: ['kultura'], accommodationTypes: ['hotel'] }
    })
  );

  assert.equal(plan.selectedAccommodation.id, 'lp_apartman');
  assert.ok(plan.accommodations.some((s) => s.id === 'lp_apartman'));
});

test('bez izbora ostaje preporucena ponuda', async () => {
  const { planner, pozivi } = napraviPlanner({
    letovi: [let_('off_a', 300), let_('off_b', 200)],
    smestaji: [hotel('lp_1')]
  });

  const plan = await planner.plan(upit());

  assert.ok(plan.selectedFlight.recommended);
  assert.deepEqual(pozivi.izabrana, []);
});
