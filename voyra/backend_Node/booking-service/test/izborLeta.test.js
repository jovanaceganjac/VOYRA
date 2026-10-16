const test = require('node:test');
const assert = require('node:assert/strict');

const BookingService = require('../src/services/BookingService');

const { MAX_PUTNIKA } = BookingService;
const servis = new BookingService();

const let1 = (izmene = {}) => ({ offerId: 'off_1', airline: 'Duffel Airways', price: 177.18, ...izmene });

test('izbor leta koji se rezervise (spec §4.8)', async (t) => {
  await t.test('izricit izbor korisnika ima prednost nad rangiranom listom', () => {
    // Lista `flights` je rangirana, pa bi `flights[0]` rezervisao drugi let od izabranog.
    const trip = {
      itinerary: {
        selectedFlight: let1({ offerId: 'izabrani' }),
        flights: [let1({ offerId: 'prvi', recommended: true }), let1({ offerId: 'drugi' })]
      }
    };

    const r = servis._ponudaIzPlana(trip);

    assert.equal(r.ponuda.offerId, 'izabrani');
    assert.equal(r.explicit, true);
    assert.equal(r.warning, null);
  });

  await t.test('bez izbora se uzima preporucena ponuda, uz upozorenje', () => {
    // Putovanja sacuvana ranije nemaju `selectedFlight`; korisnik mora da vidi sta se bira.
    const trip = {
      itinerary: { flights: [let1({ offerId: 'prvi' }), let1({ offerId: 'preporucena', recommended: true })] }
    };

    const r = servis._ponudaIzPlana(trip);

    assert.equal(r.ponuda.offerId, 'preporucena');
    assert.equal(r.explicit, false);
    assert.equal(r.warning, 'FLIGHT_NOT_EXPLICIT');
  });

  await t.test('bez izbora i bez preporuke uzima se prva ponuda, uz upozorenje', () => {
    // Poslednja odstupnica; i ona se jasno prijavljuje, jer korisnik nije izabrao.
    const trip = { itinerary: { flights: [let1({ offerId: 'prvi' }), let1({ offerId: 'drugi' })] } };

    const r = servis._ponudaIzPlana(trip);

    assert.equal(r.ponuda.offerId, 'prvi');
    assert.equal(r.warning, 'FLIGHT_NOT_EXPLICIT');
  });

  await t.test('plan bez letova daje null, ne gresku', () => {
    // Grad bez aerodroma (spec §4.2) daje plan bez leta; ruta iz `null` vraca 404.
    assert.equal(servis._ponudaIzPlana({ itinerary: { flights: [] } }), null);
    assert.equal(servis._ponudaIzPlana({ itinerary: {} }), null);
    assert.equal(servis._ponudaIzPlana({}), null);
    assert.equal(servis._ponudaIzPlana(null), null);
  });

  await t.test('zadati offerId se trazi i u listi i u izabranom letu', () => {
    // Korisnik iz carobnjaka moze da posalje bilo koju ponudu koju je video.
    const trip = {
      itinerary: { selectedFlight: let1({ offerId: 'izabrani' }), flights: [let1({ offerId: 'drugi' })] }
    };

    assert.equal(servis._ponudaIzPlana(trip, 'drugi').ponuda.offerId, 'drugi');
    assert.equal(servis._ponudaIzPlana(trip, 'izabrani').ponuda.offerId, 'izabrani');
  });

  await t.test('zadati offerId koji nije u planu daje null', () => {
    // Rezervacija ponude koja nije deo plana ne sme tiho da rezervise nesto drugo.
    const trip = { itinerary: { flights: [let1({ offerId: 'prvi' })] } };

    assert.equal(servis._ponudaIzPlana(trip, 'nepostojeci'), null);
  });

  await t.test('zadati offerId je uvek izricit izbor', () => {
    // Korisnik ga je poslao svesno, pa nema upozorenja ni kada plan nema `selectedFlight`.
    const trip = { itinerary: { flights: [let1({ offerId: 'prvi', recommended: true })] } };
    const r = servis._ponudaIzPlana(trip, 'prvi');

    assert.equal(r.explicit, true);
    assert.equal(r.warning, null);
  });

  await t.test('offerId se poredi i sa poljem `id`', () => {
    // Demo ponude nose `id`, Duffel `offerId`; oba oblika moraju da se nadju.
    const trip = { itinerary: { flights: [{ id: 'demo_1', price: 100 }] } };

    assert.equal(servis._ponudaIzPlana(trip, 'demo_1').ponuda.id, 'demo_1');
  });
});

test('cena ponude i tolerancija', async (t) => {
  await t.test('cena u evrima ima prednost nad prikazanom cenom', () => {
    // Plan racuna u evrima; `price` moze biti u valuti izvora.
    assert.equal(servis._cena({ priceEUR: 150, price: 17600 }), 150);
  });

  await t.test('bez cene je nula, ne NaN', () => {
    // NaN bi se kroz poredjenja prosirio i dao besmislene poruke o promeni cene.
    assert.equal(servis._cena({}), 0);
    assert.equal(servis._cena(null), 0);
  });

  await t.test('ista cena nije promena', () => {
    // Bez toga bi svaka provera ponude tražila novu potvrdu korisnika.
    assert.equal(servis._cenaPromenjena(177.18, 177.18), false);
  });

  await t.test('razlika do jednog centa nije promena', () => {
    // Cena prolazi kroz zaokruživanje, pa se razlika od 0,004 EUR ne racuna.
    assert.equal(servis._cenaPromenjena(177.18, 177.184), false);
    assert.equal(servis._cenaPromenjena(177.18, 177.19), false);
  });

  await t.test('razlika veca od centa je promena', () => {
    // Korisnik placa cenu koju je video; svaka stvarna razlika trazi potvrdu.
    assert.equal(servis._cenaPromenjena(177.18, 177.2), true);
    assert.equal(servis._cenaPromenjena(177.18, 250), true);
  });

  await t.test('promena u oba smera se prijavljuje', () => {
    // I nizu cenu korisnik treba da potvrdi - inace bi se rezervisalo nesto drugo od videnog.
    assert.equal(servis._cenaPromenjena(250, 177.18), true);
  });

  await t.test('cena kao niska se poredi kao broj', () => {
    // Telo zahteva donosi `acceptedPrice` iz JSON-a, gde moze biti i niska.
    assert.equal(servis._cenaPromenjena('177.18', 177.18), false);
  });
});

test('istekla ponuda', async (t) => {
  await t.test('ponuda bez roka se ne racuna kao istekla', () => {
    // Demo ponude i neki izvori ne daju `expiresAt`; odbijanje bi zaustavilo rezervaciju.
    assert.equal(servis._jeIstekla({}), false);
    assert.equal(servis._jeIstekla(null), false);
  });

  await t.test('rok u buducnosti znaci da ponuda vazi', () => {
    // Osnovni slucaj svezе ponude.
    assert.equal(servis._jeIstekla({ expiresAt: new Date(Date.now() + 600_000) }), false);
  });

  await t.test('rok u proslosti znaci da je istekla', () => {
    // Duffel ponuda vazi 20-30 minuta; posle toga kreiranje vraca gresku.
    assert.equal(servis._jeIstekla({ expiresAt: new Date(Date.now() - 1000) }), true);
  });

  await t.test('neispravan datum se ne racuna kao istekao', () => {
    // Bolje pustiti izvor da odbije ponudu nego odbiti vazecu zbog lose niske.
    assert.equal(servis._jeIstekla({ expiresAt: 'juce' }), false);
  });
});

test('najveci broj putnika po rezervaciji', async (t) => {
  await t.test('granica je 9 putnika (spec §4.8)', () => {
    // Vecina avio-kompanija ne prima vise; visak se rezervise u vise delova.
    assert.equal(MAX_PUTNIKA, 9);
  });
});
