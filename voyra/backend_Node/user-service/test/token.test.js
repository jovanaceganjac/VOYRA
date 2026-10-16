const test = require('node:test');
const assert = require('node:assert/strict');
const jwtLib = require('jsonwebtoken');

// Token se potpisuje tajnom iz okruzenja; test je postavlja pre `require`.
process.env.JWT_SECRET = 'tajna_samo_za_testove_0123456789';

const { generateToken, verifyToken } = require('../src/utils/jwt');
const PokusajiPrijave = require('../src/services/PokusajiPrijave');

const { MAX_POKUSAJA, PROZOR_MIN } = PokusajiPrijave;

test('JWT token i claim `tv`', async (t) => {
  await t.test('token nosi id, korisnicko ime, email, ulogu i verziju', () => {
    // Ostali servisi iz tokena citaju ko je poslao zahtev, bez poziva User Service-u.
    const t1 = generateToken('abc123', 'demo', 'demo@voyra.local', 'admin', 7);
    const p = verifyToken(t1);

    assert.equal(p.id, 'abc123');
    assert.equal(p.korisnickoIme, 'demo');
    assert.equal(p.email, 'demo@voyra.local');
    assert.equal(p.uloga, 'admin');
    assert.equal(p.tv, 7);
  });

  await t.test('bez zadate uloge token je obican korisnik', () => {
    // Podrazumevana uloga ne sme da bude admin ni kada je poziv nepotpun.
    assert.equal(verifyToken(generateToken('id', 'demo', 'a@b.rs')).uloga, 'korisnik');
  });

  await t.test('verzija tokena bez vrednosti je 0', () => {
    // Nalozi napravljeni ranije nemaju `tokenVersion`; 0 ih ostavlja ispravnim.
    assert.equal(verifyToken(generateToken('id', 'demo', 'a@b.rs', 'korisnik')).tv, 0);
    assert.equal(verifyToken(generateToken('id', 'demo', 'a@b.rs', 'korisnik', undefined)).tv, 0);
    assert.equal(verifyToken(generateToken('id', 'demo', 'a@b.rs', 'korisnik', null)).tv, 0);
  });

  await t.test('verzija iz niske se pretvara u broj', () => {
    // Mongoose ume da vrati broj kao nisku; gateway poredi brojeve, pa tip mora biti tacan.
    assert.strictEqual(verifyToken(generateToken('id', 'demo', 'a@b.rs', 'korisnik', '3')).tv, 3);
  });

  await t.test('lozinka nikada nije u tokenu', () => {
    // Token putuje kroz pretrazivac; sve u njemu je citljivo svakome ko ga ima.
    const p = verifyToken(generateToken('id', 'demo', 'a@b.rs', 'korisnik', 1));

    assert.deepEqual(Object.keys(p).sort(), ['email', 'exp', 'iat', 'id', 'korisnickoIme', 'tv', 'uloga']);
  });

  await t.test('token potpisan drugom tajnom se odbija, bez izuzetka', () => {
    // Pozivaoci proveravaju `null`; bacen izuzetak bi rusio zahtev umesto da vrati 401.
    const tudji = jwtLib.sign({ id: 'x', uloga: 'admin', tv: 0 }, 'druga_tajna');

    assert.equal(verifyToken(tudji), null);
  });

  await t.test('istekao token se odbija', () => {
    // Istek je jedina zastita za tokene koji su izmakli kontroli.
    const istekao = jwtLib.sign({ id: 'x', uloga: 'korisnik', tv: 0 }, process.env.JWT_SECRET, {
      expiresIn: '-1s'
    });

    assert.equal(verifyToken(istekao), null);
  });

  await t.test('besmislena niska se odbija', () => {
    // `Authorization` zaglavlje moze da nosi bilo sta.
    assert.equal(verifyToken('nije-token'), null);
    assert.equal(verifyToken(''), null);
  });
});

test('brojac pokusaja prijave', async (t) => {
  const p = new PokusajiPrijave();

  await t.test('granice su 5 pokusaja u 15 minuta', () => {
    // Vrednosti su iz specifikacije; test ih drzi da se ne promene slucajno.
    assert.equal(MAX_POKUSAJA, 5);
    assert.equal(PROZOR_MIN, 15);
  });

  await t.test('kljuc spaja korisnicko ime i IP adresu', () => {
    // Brojanje po paru: napad na jedan nalog sa vise adresa se ne zbraja u jedno zakljucavanje.
    assert.equal(p._kljuc('demo', '10.0.0.1'), 'demo|10.0.0.1');
  });

  await t.test('velicina slova u korisnickom imenu se ne racuna', () => {
    // Inace bi „Demo" i „demo" imali odvojene brojace, pa bi granica bila dvostruka.
    assert.equal(p._kljuc('DEMO', '10.0.0.1'), p._kljuc('demo', '10.0.0.1'));
  });

  await t.test('IP adresa razlikuje dva brojaca za isti nalog', () => {
    // Vlasnik naloga sa svoje adrese ne treba da bude zakljucan zbog napada sa druge.
    assert.notEqual(p._kljuc('demo', '10.0.0.1'), p._kljuc('demo', '10.0.0.2'));
  });

  await t.test('nepoznata IP adresa dobija svoj kljuc, ne prazan', () => {
    // Prazan deo kljuca bi spojio sve zahteve bez adrese u jedan brojac.
    assert.equal(p._kljuc('demo', undefined), 'demo|nepoznat');
    assert.equal(p._kljuc('demo', null), 'demo|nepoznat');
  });

  await t.test('odgovor 429 nosi Retry-After u sekundama i poruku u minutima', () => {
    // Klijent ceka po sekundama, a korisnik cita minute - odgovor nosi oba.
    const o = p.odgovor429(900);

    assert.equal(o.statusCode, 429);
    assert.equal(o.error, 'RATE_LIMIT');
    assert.equal(o.retryAfter, 900);
    assert.match(o.message, /15 minuta/);
  });

  await t.test('poruka koristi jedninu za jedan minut', () => {
    // „za 1 minuta" bi bilo neispravno; padez se bira po broju.
    assert.match(p.odgovor429(60).message, /1 minut$/);
    assert.match(p.odgovor429(120).message, /2 minuta$/);
  });

  await t.test('cekanje krace od minuta se prikazuje kao jedan minut', () => {
    // „za 0 minuta" bi znacilo da moze odmah, a ne moze.
    assert.match(p.odgovor429(5).message, /1 minut$/);
    assert.match(p.odgovor429(0).message, /1 minut$/);
  });

  await t.test('poruka ne kaze da li nalog postoji', () => {
    // Razlicite poruke za postojeci i nepostojeci nalog bi odale spisak korisnickih imena.
    assert.equal(p.odgovor429(300).message.includes('nalog'), false);
  });
});
