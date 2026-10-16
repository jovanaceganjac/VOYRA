const test = require('node:test');
const assert = require('node:assert/strict');

const LiteApiHotelAdapter = require('../src/adapters/LiteApiHotelAdapter');
const { bookingUrl } = require('../src/utils/bookingLink');

const { uSkaluDoPet, prepoznajTip } = LiteApiHotelAdapter;
const adapter = new LiteApiHotelAdapter();

test('ocena smestaja sa skale 0—10 na 1—5', async (t) => {
  await t.test('ocena iznad 5 se deli na dva', () => {
    // Planner kaznu racuna kao `(5 - ocena) / 5`; ocena 8.6 bi dala NEGATIVNU kaznu,
    // to jest nezasluzenu prednost nad svim ostalim smestajem.
    assert.equal(uSkaluDoPet(8.6), 4.3);
    assert.equal(uSkaluDoPet(10), 5);
    assert.equal(uSkaluDoPet(7), 3.5);
  });

  await t.test('ocena do 5 se ostavlja kakva je', () => {
    // Demo podaci su vec na skali 1-5; deljenje bi ih dvaput smanjilo.
    assert.equal(uSkaluDoPet(4.3), 4.3);
    assert.equal(uSkaluDoPet(5), 5);
    assert.equal(uSkaluDoPet(1), 1);
  });

  await t.test('granica 5 pripada skali 1—5', () => {
    // Bez jasne granice bi ocena 5 mogla da postane 2.5.
    assert.equal(uSkaluDoPet(5), 5);
    assert.equal(uSkaluDoPet(5.1), 2.6);
  });

  await t.test('rezultat je zaokruzen na jednu decimalu', () => {
    // Prikaz ima jedno decimalno mesto; duzi broj bi izgledao kao greska.
    assert.equal(uSkaluDoPet(8.67), 4.3);
    assert.equal(uSkaluDoPet(9.99), 5);
  });

  await t.test('nula, negativna i besmislena vrednost daju null', () => {
    // Ocena 0 kod LiteAPI-ja znaci „nema ocene", ne „najgore".
    assert.equal(uSkaluDoPet(0), null);
    assert.equal(uSkaluDoPet(-3), null);
    assert.equal(uSkaluDoPet('Not Available'), null);
    assert.equal(uSkaluDoPet(null), null);
    assert.equal(uSkaluDoPet(undefined), null);
  });
});

test('tip smestaja iz slobodnog teksta (spec §4.4)', async (t) => {
  await t.test('prepoznaje hostel', () => {
    // Tip ulazi u filter korisnika, pa mora da se prepozna iz opisa izvora.
    assert.equal(prepoznajTip('Hostel'), 'hostel');
    assert.equal(prepoznajTip('Youth hostel'), 'hostel');
  });

  await t.test('prepoznaje apartman u vise oblika', () => {
    // LiteAPI koristi i „Apartment", i „Condo", i „Residence" za istu vrstu smestaja.
    assert.equal(prepoznajTip('Apartment'), 'apartman');
    assert.equal(prepoznajTip('Aparthotel'), 'apartman');
    assert.equal(prepoznajTip('Condo Hotel'), 'apartman');
    assert.equal(prepoznajTip('Serviced Residence'), 'apartman');
  });

  await t.test('velicina slova se ne racuna', () => {
    // Izvor nije dosledan u pisanju tipa.
    assert.equal(prepoznajTip('HOSTEL'), 'hostel');
    assert.equal(prepoznajTip('apartment'), 'apartman');
  });

  await t.test('sve ostalo je hotel', () => {
    // Spec §4.4 poznaje samo tri tipa, a LiteAPI zna da posalje „Not Available".
    assert.equal(prepoznajTip('Not Available'), 'hotel');
    assert.equal(prepoznajTip('Boutique Hotel'), 'hotel');
    assert.equal(prepoznajTip(''), 'hotel');
    assert.equal(prepoznajTip(null), 'hotel');
  });

  await t.test('hostel ima prednost nad recju „hotel" u istom tekstu', () => {
    // Redosled provera odlucuje; „Hostel Hotel Beograd" je hostel.
    assert.equal(prepoznajTip('Hostel Hotel Beograd'), 'hostel');
  });
});

test('udaljenost smestaja od centra grada', async (t) => {
  await t.test('ista tacka je nula', () => {
    // Sluzi kao provera da formula ne daje NaN.
    assert.equal(adapter._razdaljinaKm(37.98, 23.73, 37.98, 23.73), 0);
  });

  await t.test('jedan stepen sirine je oko 111 km', () => {
    // Nezavisna provera skale.
    const d = adapter._razdaljinaKm(0, 0, 1, 0);

    assert.ok(d > 110 && d < 112, `dobijeno ${d.toFixed(2)}`);
  });

  await t.test('smestaj u centru Atine je blizu centra', () => {
    // Prikaz navodi udaljenost od centra; greska bi je prikazala kao desetine kilometara.
    const d = adapter._razdaljinaKm(37.98376, 23.72784, 37.9755, 23.7348);

    assert.ok(d > 0.5 && d < 2, `dobijeno ${d.toFixed(2)}`);
  });
});

test('Booking.com link za rezervaciju smestaja (spec §4.4)', async (t) => {
  await t.test('link nosi grad, datume i broj gostiju', () => {
    // Aplikacija smestaj NE rezervise; korisnik ide na Booking sa popunjenom pretragom.
    const u = new URL(bookingUrl({ city: 'Athens', checkIn: '2026-11-10', checkOut: '2026-11-15', guests: 2 }));

    assert.equal(u.origin + u.pathname, 'https://www.booking.com/searchresults.html');
    assert.equal(u.searchParams.get('ss'), 'Athens');
    assert.equal(u.searchParams.get('checkin'), '2026-11-10');
    assert.equal(u.searchParams.get('checkout'), '2026-11-15');
    assert.equal(u.searchParams.get('group_adults'), '2');
  });

  await t.test('naziv objekta suzava pretragu i ide uz grad', () => {
    // Korisnik treba da vidi bas onaj objekat koji je izabrao u planu.
    const u = new URL(bookingUrl({ city: 'Athens', hotelName: 'President Hotel' }));

    assert.equal(u.searchParams.get('ss'), 'President Hotel Athens');
  });

  await t.test('datum se skracuje na dan', () => {
    // Iz baze datum dolazi kao ISO sa vremenom, a Booking prima samo dan.
    const u = new URL(bookingUrl({ city: 'Athens', checkIn: '2026-11-10T00:00:00.000Z' }));

    assert.equal(u.searchParams.get('checkin'), '2026-11-10');
  });

  await t.test('bez datuma link i dalje radi', () => {
    // Link se pravi i za prikaz ponude van konteksta konkretnog putovanja.
    const u = new URL(bookingUrl({ city: 'Athens' }));

    assert.equal(u.searchParams.has('checkin'), false);
    assert.equal(u.searchParams.get('ss'), 'Athens');
  });

  await t.test('broj gostiju je najmanje 1', () => {
    // Booking bi na `group_adults=0` vratio gresku.
    assert.equal(new URL(bookingUrl({ city: 'Athens', guests: 0 })).searchParams.get('group_adults'), '1');
    assert.equal(new URL(bookingUrl({ city: 'Athens', guests: null })).searchParams.get('group_adults'), '1');
  });

  await t.test('bez grada i bez naziva nema linka', () => {
    // Link na praznu pretragu bi korisnika samo odveo na nista.
    assert.equal(bookingUrl({}), null);
    assert.equal(bookingUrl(), null);
  });

  await t.test('naziv sa razmacima i dijakritikom se pravilno koduje', () => {
    // Nekodovan naziv bi prekinuo URL na prvom razmaku.
    const u = bookingUrl({ city: 'Genève', hotelName: 'Hôtel de la Paix' });

    assert.equal(u.includes(' '), false);
    assert.equal(new URL(u).searchParams.get('ss'), 'Hôtel de la Paix Genève');
  });
});
