const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PhoneService = require('../src/services/PhoneService');

/**
 * TELEFON BEZ SMS POTVRDE.
 *
 * Registracija i izmena profila vise ne salju SMS kod: broj se proverava
 * samo po obliku (E.164) i cuva odmah. Nalog se aktivira odobrenjem
 * administratora, ne kodom.
 */

/** Lazan korisnik - `save` samo broji pozive, bez baze. */
const korisnik = (phone) => ({
  korisnickoIme: 'test',
  phone,
  sacuvano: 0,
  async save() {
    this.sacuvano += 1;
  }
});

test('broj se cuva odmah, bez koda i bez polja za potvrdu', async () => {
  const k = korisnik(undefined);

  const r = await new PhoneService().postaviBroj(k, '+381 60 123 4567');

  assert.equal(r.changed, true);
  assert.equal(k.phone.number, '+381601234567');
  assert.equal(k.phone.smsOptIn, true);
  assert.equal(k.phone.verificationCode, undefined);
  assert.equal(k.phone.isVerified, undefined);
  assert.equal(k.sacuvano, 1);
});

test('neispravan broj se odbija sa 400, nista se ne cuva', async () => {
  const k = korisnik(undefined);

  await assert.rejects(new PhoneService().postaviBroj(k, '0601234567'), (e) => e.statusCode === 400);
  assert.equal(k.sacuvano, 0);
});

test('isti broj nije promena; SMS preferenca ostaje', async () => {
  const k = korisnik({ number: '+381601234567', smsOptIn: false });

  const r = await new PhoneService().postaviBroj(k, '+381601234567');

  assert.equal(r.changed, false);
  assert.equal(k.phone.smsOptIn, false);
});

test('servis nema slanje koda, a ruta za potvrdu koda ne postoji', () => {
  const s = new PhoneService();

  assert.equal(typeof s.posaljiKod, 'undefined');
  assert.equal(typeof s.potvrdi, 'undefined');

  const rute = fs.readFileSync(path.join(__dirname, '../src/routes/users.js'), 'utf8');
  assert.doesNotMatch(rute, /phone\/verify|phone\/resend/);

  const registracija = fs.readFileSync(path.join(__dirname, '../src/routes/auth.js'), 'utf8');
  assert.doesNotMatch(registracija, /posaljiKod|SMSClient/);
});
