const test = require('node:test');
const assert = require('node:assert/strict');

const { validiraj, normalizuj, maskiraj } = require('../src/utils/phoneValidator');

/**
 * Broj telefona se cuva u E.164 obliku, jer ga Twilio prima samo tako.
 * Korisnik ga kuca kako mu je zgodno, pa normalizacija mora da podnese
 * razmake, crtice, zagrade i domaci zapis sa vodecom nulom.
 */

test('normalizacija broja telefona', async (t) => {
  await t.test('uklanja razmake, crtice, zagrade i tacke', () => {
    // Korisnik broj cita sa vizitkarte; oblik zapisa ne sme da odlucuje o ispravnosti.
    assert.equal(normalizuj('+381 60 123-45 67'), '+381601234567');
    assert.equal(normalizuj('+381 (60) 123.4567'), '+381601234567');
  });

  await t.test('medjunarodni prefiks 00 prevodi u +', () => {
    // Evropski zapis „00381..." je isti broj kao „+381..." i mora da prodje.
    assert.equal(normalizuj('00381601234567'), '+381601234567');
  });

  await t.test('skida vodece i prateee praznine', () => {
    // Nalepljeni broj iz druge aplikacije cesto nosi praznine.
    assert.equal(normalizuj('  +381601234567  '), '+381601234567');
  });

  await t.test('prazna vrednost ostaje prazna, bez greske', () => {
    // Telefon je opciono polje; normalizacija se poziva i kada ga nema.
    assert.equal(normalizuj(''), '');
    assert.equal(normalizuj(null), null);
    assert.equal(normalizuj(undefined), undefined);
  });
});

test('validacija broja telefona (E.164)', async (t) => {
  await t.test('ispravan srpski mobilni prolazi i vraca normalizovan oblik', () => {
    // Validator vraca broj koji se upisuje u bazu, ne onaj koji je korisnik ukucao.
    const r = validiraj('+381 60 123 4567');

    assert.equal(r.valid, true);
    assert.equal(r.number, '+381601234567');
  });

  await t.test('prazan broj daje jasnu poruku', () => {
    // Korisnik koji je polje ostavio prazno ne treba da vidi poruku o obliku.
    assert.equal(validiraj('').valid, false);
    assert.match(validiraj('').error, /prazan/);
  });

  await t.test('broj bez + se odbija sa porukom o pozivnom broju', () => {
    // Bez pozivnog broja Twilio ne zna drzavu, pa SMS ne bi stigao.
    const r = validiraj('0601234567');

    assert.equal(r.valid, false);
    assert.match(r.error, /pocinje sa \+/);
  });

  await t.test('odbija manje od 10 i vise od 14 cifara', () => {
    // Granice su iz E.164; poruka navodi ocekivani opseg.
    assert.equal(validiraj(`+${'1'.repeat(9)}`).valid, false);
    assert.equal(validiraj(`+${'1'.repeat(10)}`).valid, true);
    assert.equal(validiraj(`+${'1'.repeat(14)}`).valid, true);
    assert.equal(validiraj(`+${'1'.repeat(15)}`).valid, false);
  });

  await t.test('odbija slova u broju', () => {
    // Broj sa slovima bi prosao duzinsku proveru da se ne trazi da su sve cifre.
    assert.equal(validiraj('+38160ABC4567').valid, false);
  });

  await t.test('poruka o obliku nosi primer broja', () => {
    // Primer u poruci je najkraci nacin da korisnik vidi ocekivani oblik.
    assert.match(validiraj('+123').error, /\+381601234567/);
  });
});

test('PHONE_REGEX iz okruzenja', async (t) => {
  t.afterEach(() => {
    delete process.env.PHONE_REGEX;
  });

  await t.test('zadati izraz zamenjuje podrazumevani', () => {
    // Postavljanje samo srpskih mobilnih je legitimno podesavanje instalacije.
    process.env.PHONE_REGEX = '^\\+3816[0-9]{7,8}$';

    assert.equal(validiraj('+381601234567').valid, true);
    assert.equal(validiraj('+49301234567').valid, false);
  });

  await t.test('neispravan izraz se ignorise, validacija nastavlja da radi', () => {
    // Greska u .env-u ne sme da onemoguci potvrdu telefona svim korisnicima.
    process.env.PHONE_REGEX = '^\\+38(1[0-9';

    assert.equal(validiraj('+381601234567').valid, true);
  });
});

test('maskiranje broja za log', async (t) => {
  await t.test('ostavlja pozivni broj i poslednje tri cifre', () => {
    // Log sluzi za pracenje toka, a ne za cuvanje broja telefona korisnika.
    assert.equal(maskiraj('+381601234567'), '+3816****567');
  });

  await t.test('kratku vrednost ne dira', () => {
    // Nema sta da se maskira, a rezanje bi dalo besmislenu nisku.
    assert.equal(maskiraj('+3816'), '+3816');
    assert.equal(maskiraj(''), '');
    assert.equal(maskiraj(null), null);
  });
});
