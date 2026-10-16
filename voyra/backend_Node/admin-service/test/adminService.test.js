const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'tajna_samo_za_testove_0123456789';

const AdminService = require('../src/services/AdminService');
const { verifyAdmin } = require('../src/middleware/auth');

const servis = new AdminService();

/** Greska kakvu axios napravi kada ciljni servis odgovori statusom >= 400. */
const odgovorServisa = (status, telo) => {
  const e = new Error(`Request failed with status code ${status}`);
  e.response = { status, data: telo };
  return e;
};

test('prosledjivanje greske iz drugog servisa', async (t) => {
  await t.test('status greske se prenosi, ne postaje 500', () => {
    // Admin panel po statusu razlikuje „nedozvoljen prelaz" od „servis je pao".
    const e = servis._greska(odgovorServisa(409, { error: 'LAST_ADMIN', message: 'Poslednji admin' }), 'Podrazumevana');

    assert.equal(e.statusCode, 409);
    assert.equal(e.code, 'LAST_ADMIN');
    assert.equal(e.message, 'Poslednji admin');
  });

  await t.test('CELO telo greske se prenosi, ne samo poruka', () => {
    // Bez toga bi spisak `errors` nestao i korisnik bi video samo „Nije ispravno".
    const e = servis._greska(
      odgovorServisa(400, {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Nije ispravno',
        statusCode: 400,
        errors: ['naziv je obavezan', 'lat mora biti broj']
      }),
      'Podrazumevana'
    );

    assert.deepEqual(e.upstream, { errors: ['naziv je obavezan', 'lat mora biti broj'] });
  });

  await t.test('polja koja su vec preneta se ne dupliraju u `upstream`', () => {
    // `message`, `error`, `statusCode` i `success` stoje na samoj gresci.
    const e = servis._greska(
      odgovorServisa(429, { success: false, error: 'RATE_LIMIT', message: 'Previse', statusCode: 429, retryAfter: 900 }),
      'Podrazumevana'
    );

    assert.deepEqual(e.upstream, { retryAfter: 900 });
  });

  await t.test('bez dodatnih polja `upstream` se ne postavlja', () => {
    // Prazan objekat u odgovoru bi zbunio frontend koji proverava postojanje polja.
    const e = servis._greska(odgovorServisa(404, { error: 'NOT_FOUND', message: 'Nema ga' }), 'Podrazumevana');

    assert.equal(e.upstream, undefined);
  });

  await t.test('telo bez poruke uzima podrazumevanu poruku', () => {
    // Neki servisi vracaju prazno telo na 500; korisnik ipak mora nesto da vidi.
    const e = servis._greska(odgovorServisa(500, {}), 'Neuspesna promena statusa korisnika');

    assert.equal(e.message, 'Neuspesna promena statusa korisnika');
    assert.equal(e.code, 'SERVICE_ERROR');
    assert.equal(e.statusCode, 500);
  });

  await t.test('odgovor bez tela ne rusi prevodjenje greske', () => {
    // `err.response.data` moze da bude `null` kada servis ne posalje JSON.
    const e = servis._greska(odgovorServisa(502, null), 'Podrazumevana');

    assert.equal(e.statusCode, 502);
    assert.equal(e.message, 'Podrazumevana');
  });

  await t.test('servis koji ne odgovara daje 503, ne 500', () => {
    // Bez `err.response` nije bilo odgovora; to je nedostupnost, a ne greska u zahtevu.
    const e = servis._greska(new Error('connect ECONNREFUSED'), 'Podrazumevana');

    assert.equal(e.statusCode, 503);
    assert.equal(e.code, 'SERVICE_UNAVAILABLE');
    assert.match(e.message, /nije dostupan/);
  });
});

test('zaglavlja internog poziva', async (t) => {
  await t.test('nosi marker admin zahteva i prosledjen token', () => {
    // Servisi iza i dalje verifikuju token; marker sam po sebi nije dokaz.
    const h = servis._headers('token123');

    assert.equal(h['X-Admin-Request'], 'true');
    assert.equal(h.Authorization, 'Bearer token123');
    assert.equal(h['Content-Type'], 'application/json');
  });
});

test('provera uloge (verifyAdmin)', async (t) => {
  /** Minimalni req/res/next; res pamti status i telo. */
  const pozovi = (authHeader) => {
    const req = { headers: authHeader === undefined ? {} : { authorization: authHeader } };
    const r = { prosao: false, status: null, telo: null, user: null };

    const res = {
      status(s) {
        r.status = s;
        return this;
      },
      json(t2) {
        r.telo = t2;
        return this;
      }
    };

    verifyAdmin(req, res, () => {
      r.prosao = true;
      r.user = req.user;
    });

    return r;
  };

  const token = (uloga) => jwt.sign({ id: 'a1', korisnickoIme: 'admin', uloga }, process.env.JWT_SECRET);

  await t.test('administrator prolazi i dobija payload na zahtevu', () => {
    // Rute iz `req.user` citaju ko je doneo odluku, za revizioni zapis.
    const r = pozovi(`Bearer ${token('admin')}`);

    assert.equal(r.prosao, true);
    assert.equal(r.user.korisnickoIme, 'admin');
  });

  await t.test('bez tokena je 401, ne 403', () => {
    // 401 znaci „nisi se predstavio", 403 „predstavio si se, ali ne smes" - razlika je bitna.
    const r = pozovi(undefined);

    assert.equal(r.status, 401);
    assert.equal(r.telo.error, 'UNAUTHORIZED');
  });

  await t.test('zaglavlje koje nije Bearer je 401', () => {
    // Drugi oblik autorizacije nije podrzan.
    assert.equal(pozovi('Basic abcdef').status, 401);
  });

  await t.test('nevazeci token je 401 INVALID_TOKEN', () => {
    // Potpis drugom tajnom znaci da token nije nas.
    const r = pozovi(`Bearer ${jwt.sign({ uloga: 'admin' }, 'druga_tajna')}`);

    assert.equal(r.status, 401);
    assert.equal(r.telo.error, 'INVALID_TOKEN');
  });

  await t.test('istekao token je 401', () => {
    // Istek je jedina zastita za token koji je izmakao kontroli.
    const istekao = jwt.sign({ uloga: 'admin' }, process.env.JWT_SECRET, { expiresIn: '-1s' });

    assert.equal(pozovi(`Bearer ${istekao}`).status, 401);
  });

  await t.test('obican korisnik sa vazecim tokenom je 403', () => {
    // Prijavljen je, ali admin panel nije za njega.
    const r = pozovi(`Bearer ${token('korisnik')}`);

    assert.equal(r.status, 403);
    assert.equal(r.telo.error, 'FORBIDDEN');
  });

  await t.test('token bez uloge je 403', () => {
    // Nedostatak uloge se ne sme tumaciti kao admin.
    const bezUloge = jwt.sign({ id: 'a1' }, process.env.JWT_SECRET);

    assert.equal(pozovi(`Bearer ${bezUloge}`).status, 403);
  });

  await t.test('uloga „Admin" velikim slovom NE prolazi', () => {
    // Poredjenje je tacno; User Service upisuje samo `korisnik` i `admin`.
    assert.equal(pozovi(`Bearer ${token('Admin')}`).status, 403);
  });
});
