const test = require('node:test');
const assert = require('node:assert/strict');

const FlightChangeService = require('../src/services/FlightChangeService');

/**
 * Otisak leta.
 *
 * Duffel ponuda vazi 20-30 minuta, a korisnik se na sacuvano putovanje
 * vraca posle sati ili dana. Isti let se u novoj pretrazi prepoznaje po
 * otisku - kompanija, brojevi letova i vremena polaska svih segmenata.
 * Servis se ovde samo instancira; nijedan test ne dodiruje mrezu ni bazu.
 */
const servis = new FlightChangeService();

const ponuda = (izmene = {}) => ({
  airlineIata: 'ZZ',
  totalPrice: 177.18,
  currency: 'EUR',
  outbound: {
    airline: 'ZZ',
    number: '100',
    departure: '2026-11-10T08:00:00Z'
  },
  inbound: {
    airline: 'ZZ',
    number: '101',
    departure: '2026-11-15T19:30:00Z'
  },
  ...izmene
});

test('otisak leta', async (t) => {
  await t.test('ista ponuda daje isti otisak', () => {
    // Bez toga se isti let posle nove pretrage ne bi prepoznao i validacija bi uvek vracala 410.
    assert.equal(servis.otisak(ponuda()), servis.otisak(ponuda()));
  });

  await t.test('cena NIJE deo otiska', () => {
    // Cena se i menja, i upravo je ona ono sto korisnik treba da potvrdi - zato se ne broji.
    assert.equal(servis.otisak(ponuda()), servis.otisak(ponuda({ totalPrice: 250.0 })));
  });

  await t.test('offerId NIJE deo otiska', () => {
    // Duffel daje nov offerId u svakoj pretrazi; da je u otisku, isti let se nikad ne bi nasao.
    assert.equal(
      servis.otisak(ponuda({ offerId: 'off_A' })),
      servis.otisak(ponuda({ offerId: 'off_B' }))
    );
  });

  await t.test('druga kompanija daje drugi otisak', () => {
    // Isti broj leta kod druge kompanije je drugi let.
    assert.notEqual(servis.otisak(ponuda()), servis.otisak(ponuda({ airlineIata: 'A3' })));
  });

  await t.test('drugi broj leta daje drugi otisak', () => {
    // Broj leta razlikuje dva leta iste kompanije na istoj ruti istog dana.
    const drugi = ponuda();
    drugi.outbound = { ...drugi.outbound, number: '200' };

    assert.notEqual(servis.otisak(ponuda()), servis.otisak(drugi));
  });

  await t.test('drugo vreme polaska daje drugi otisak', () => {
    // Jutarnji i popodnevni let istog broja su razliciti polasci; korisnik bi dobio pogresan.
    const drugi = ponuda();
    drugi.outbound = { ...drugi.outbound, departure: '2026-11-10T17:00:00Z' };

    assert.notEqual(servis.otisak(ponuda()), servis.otisak(drugi));
  });

  await t.test('sekunde u vremenu polaska se ne broje', () => {
    // Izvori isto vreme daju sa i bez sekundi; otisak uzima prvih 16 znakova (do minuta).
    const drugi = ponuda();
    drugi.outbound = { ...drugi.outbound, departure: '2026-11-10T08:00:45Z' };

    assert.equal(servis.otisak(ponuda()), servis.otisak(drugi));
  });

  await t.test('kompanija se poredi bez obzira na velicinu slova', () => {
    // Izvori vracaju i `zz` i `ZZ`; isti let ne sme da ispadne razlicit zbog toga.
    assert.equal(servis.otisak(ponuda({ airlineIata: 'zz' })), servis.otisak(ponuda({ airlineIata: 'ZZ' })));
  });

  await t.test('let u jednom smeru se razlikuje od povratnog', () => {
    // Nedostatak povratne noge je zapisan kao `-`, pa se one ne mogu pomesati.
    const jedan = ponuda({ inbound: null });

    assert.notEqual(servis.otisak(jedan), servis.otisak(ponuda()));
    assert.match(servis.otisak(jedan), /#-$/);
  });

  await t.test('svi segmenti presedanja ulaze u otisak', () => {
    // Dva leta sa istim prvim segmentom a razlicitim presedanjem nisu isti let.
    const a = ponuda();
    a.outbound = {
      segments: [
        { airline: 'ZZ', number: '100', departure: '2026-11-10T08:00:00Z' },
        { airline: 'ZZ', number: '300', departure: '2026-11-10T12:00:00Z' }
      ]
    };

    const b = ponuda();
    b.outbound = {
      segments: [
        { airline: 'ZZ', number: '100', departure: '2026-11-10T08:00:00Z' },
        { airline: 'ZZ', number: '400', departure: '2026-11-10T13:00:00Z' }
      ]
    };

    assert.notEqual(servis.otisak(a), servis.otisak(b));
  });

  await t.test('noga bez razlozenih segmenata se cita iz same noge', () => {
    // Demo podaci i neki izvori ne razlazu segmente; otisak mora da radi i tada.
    const bezSegmenata = servis.otisak(ponuda());

    const saJednim = ponuda();
    saJednim.outbound = {
      segments: [{ airline: 'ZZ', number: '100', departure: '2026-11-10T08:00:00Z' }]
    };
    saJednim.inbound = {
      segments: [{ airline: 'ZZ', number: '101', departure: '2026-11-15T19:30:00Z' }]
    };

    assert.equal(bezSegmenata, servis.otisak(saJednim));
  });

  await t.test('prazna ponuda daje null, ne gresku', () => {
    // Sacuvano putovanje moze biti bez leta (grad bez aerodroma), pa otisak mora da izdrzi null.
    assert.equal(servis.otisak(null), null);
    assert.equal(servis.otisak(undefined), null);
  });
});
