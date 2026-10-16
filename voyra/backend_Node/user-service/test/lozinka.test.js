const test = require('node:test');
const assert = require('node:assert/strict');

const { MIN_ZNAKOVA, semaLozinke, ispravnaLozinka } = require('../src/config/lozinka');

/**
 * Pravila za lozinku (spec §11) stoje na jednom mestu, pa registracija i
 * promena lozinke koriste isti izraz. Ovi testovi proveravaju i Joi shemu
 * i pomocnu `ispravnaLozinka`, da se dva puta ne bi razisla.
 */

const DOBRA = 'VoyraDemo1!';

const joiPrihvata = (v, naziv) => !semaLozinke(naziv).validate(v).error;
const joiPoruka = (v, naziv) => semaLozinke(naziv).validate(v).error?.message || '';

test('validator lozinke (spec §11)', async (t) => {
  await t.test('ispravna lozinka prolazi kroz oba puta provere', () => {
    // Joi shema i pomocna funkcija moraju da daju isti odgovor za istu lozinku.
    assert.equal(ispravnaLozinka(DOBRA), true);
    assert.equal(joiPrihvata(DOBRA), true);
  });

  await t.test(`odbija lozinku kracu od ${MIN_ZNAKOVA} znakova`, () => {
    // Granica je iz specifikacije; 7 znakova pada, 8 sa svim vrstama znakova prolazi.
    assert.equal(ispravnaLozinka('Voyra1!'), false);
    assert.equal(ispravnaLozinka('Voyra1!a'), true);
  });

  await t.test('odbija lozinku bez velikog slova', () => {
    // Bez velikog slova prostor lozinki je znatno manji, pa je pravilo obavezno.
    assert.equal(ispravnaLozinka('voyrademo1!'), false);
  });

  await t.test('odbija lozinku bez malog slova', () => {
    // Isto pravilo u drugom smeru - samo velika slova i cifre nisu dovoljne.
    assert.equal(ispravnaLozinka('VOYRADEMO1!'), false);
  });

  await t.test('odbija lozinku bez cifre', () => {
    // Cifra je jedan od cetiri obavezna razreda znakova.
    assert.equal(ispravnaLozinka('VoyraDemo!'), false);
  });

  await t.test('odbija lozinku bez posebnog znaka', () => {
    // Poseban znak je cetvrti obavezan razred; bez njega lozinka pada.
    assert.equal(ispravnaLozinka('VoyraDemo1'), false);
  });

  await t.test('prihvata svaki poseban znak iz dozvoljenog skupa', () => {
    // Poruka korisniku nabraja tacno ovaj skup, pa svaki znak iz njega mora da radi.
    for (const znak of ['!', '@', '#', '$', '%', '^', '&', '*']) {
      assert.equal(ispravnaLozinka(`VoyraDemo1${znak}`), true, `pao znak ${znak}`);
    }
  });

  await t.test('znak van dozvoljenog skupa ne racuna se kao poseban', () => {
    // Skup je namerno uzan i poruka ga nabraja; sire pravilo bi poruku ucinilo neistinitom.
    assert.equal(ispravnaLozinka('VoyraDemo1?'), false);
    assert.equal(ispravnaLozinka('VoyraDemo1-'), false);
  });

  await t.test('sto nije niska nije ni lozinka', () => {
    // Telo zahteva moze da donese broj ili objekat; funkcija ne sme da pukne.
    for (const v of [undefined, null, 12345678, {}, ['VoyraDemo1!']]) {
      assert.equal(ispravnaLozinka(v), false);
    }
  });

  await t.test('poruka o gresci nosi naziv polja koje je palo', () => {
    // Promena lozinke ima tri polja; poruka „Lozinka..." bi bila nejasna za „Nova lozinka".
    assert.match(joiPoruka('kratka', 'Nova lozinka'), /^Nova lozinka mora imati najmanje 8/);
    assert.match(joiPoruka(undefined, 'Nova lozinka'), /^Nova lozinka je obavezna/);
    assert.match(joiPoruka('', 'Nova lozinka'), /^Nova lozinka je obavezna/);
  });

  await t.test('poruka o sastavu lozinke nabraja sve cetiri vrste znakova', () => {
    // Korisnik iz poruke mora da zna sta da doda, a ne samo da je lozinka „slaba".
    const p = joiPoruka('samomalaslova');

    assert.match(p, /VELIKA SLOVA/);
    assert.match(p, /mala slova/);
    assert.match(p, /broj/);
    assert.match(p, /!@#\$%\^&\*/);
  });

  await t.test('duga lozinka nije ogranicena gornjom granicom', () => {
    // Gornja granica bi se sukobila sa upotrebom menadzera lozinki.
    assert.equal(ispravnaLozinka(`Aa1!${'x'.repeat(200)}`), true);
  });
});
