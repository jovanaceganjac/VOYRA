const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

/*
 * Middleware cita tajnu i duzinu kesa iz okruzenja pri ucitavanju, pa se
 * one postavljaju PRE `require`. Kes je namerno ukljucen (60 s), jer se
 * bez njega ne moze proveriti ponasanje „token noviji od zapamcene
 * verzije".
 */
process.env.JWT_SECRET = 'tajna_samo_za_testove_0123456789';
process.env.TOKEN_VERSION_CACHE_MS = '60000';
process.env.INTERNAL_API_KEY = 'interni_kljuc_za_testove';

const axios = require('axios');
const { opozivTokena, ocistiKes, KES_MS } = require('../src/middleware/opozivTokena');

/**
 * Lazni User Service. Middleware jedini mrezni poziv radi preko
 * `axios.get`, pa se on zamenjuje - nijedan test ne otvara soket.
 */
const pravi = axios.get;
let odgovori = [];
let pozivi = [];

const laznoUserService = (redom) => {
  odgovori = Array.isArray(redom) ? [...redom] : [redom];
  pozivi = [];

  axios.get = async (url, opcije) => {
    pozivi.push({ url, opcije });
    const sledeci = odgovori.length > 1 ? odgovori.shift() : odgovori[0];

    if (sledeci instanceof Error) throw sledeci;

    return { data: sledeci };
  };
};

const postoji = (tokenVersion, status = 'odobren') => ({
  success: true,
  data: { tokenVersion, status }
});

const neNadjen = { success: false, error: 'NOT_FOUND' };

const token = (izmene = {}) =>
  jwt.sign({ id: 'korisnik1', korisnickoIme: 'demo', uloga: 'korisnik', ...izmene }, process.env.JWT_SECRET);

/** Minimalni req/res/next; res pamti status i telo, next samo da je pozvan. */
const pozovi = async (authHeader) => {
  const req = { headers: authHeader === undefined ? {} : { authorization: authHeader } };

  const rezultat = { prosao: false, status: null, telo: null };

  const res = {
    status(s) {
      rezultat.status = s;
      return this;
    },
    json(t) {
      rezultat.telo = t;
      return this;
    }
  };

  await opozivTokena(req, res, () => {
    rezultat.prosao = true;
  });

  return rezultat;
};

test('opoziv tokena na gateway-u', async (t) => {
  t.beforeEach(() => ocistiKes());
  t.after(() => {
    axios.get = pravi;
  });

  await t.test('zahtev bez tokena prolazi i ne pita User Service', async () => {
    // Gost mora da moze da planira; provera opoziva se odnosi samo na tokene.
    laznoUserService(postoji(0));
    const r = await pozovi(undefined);

    assert.equal(r.prosao, true);
    assert.equal(pozivi.length, 0);
  });

  await t.test('zaglavlje koje nije Bearer prolazi nepromenjeno', async () => {
    // Basic ili prazan Bearer nije nas token; odbijanje je posao zasticene rute.
    laznoUserService(postoji(0));

    assert.equal((await pozovi('Basic abcdef')).prosao, true);
    assert.equal((await pozovi('Bearer ')).prosao, true);
    assert.equal(pozivi.length, 0);
  });

  await t.test('poklapanje verzija propusta zahtev', async () => {
    // Osnovni slucaj: token je izdat posle poslednje promene naloga.
    laznoUserService(postoji(3));
    const r = await pozovi(`Bearer ${token({ tv: 3 })}`);

    assert.equal(r.prosao, true);
    assert.equal(r.status, null);
  });

  await t.test('starija verzija u tokenu daje 401 TOKEN_REVOKED', async () => {
    // Token izdat pre promene lozinke ili blokiranja prestaje da vazi odmah.
    laznoUserService(postoji(5));
    const r = await pozovi(`Bearer ${token({ tv: 4 })}`);

    assert.equal(r.prosao, false);
    assert.equal(r.status, 401);
    assert.equal(r.telo.error, 'TOKEN_REVOKED');
    assert.match(r.telo.message, /Prijavite se ponovo/);
  });

  await t.test('stariji token se odbija bez ponovnog pitanja servisa', async () => {
    // Gomila opozvanih tokena ne sme da zatrpa User Service pitanjima.
    laznoUserService(postoji(5));
    await pozovi(`Bearer ${token({ tv: 4 })}`);
    const posleJednog = pozivi.length;

    await pozovi(`Bearer ${token({ tv: 3 })}`);

    assert.equal(pozivi.length, posleJednog, 'drugi odbijeni token je izazvao nov poziv');
  });

  await t.test('token bez `tv` racuna se kao verzija 0', async () => {
    // Tokeni izdati ranije nemaju taj claim i moraju da nastave da rade.
    laznoUserService(postoji(0));

    assert.equal((await pozovi(`Bearer ${token()}`)).prosao, true);
  });

  await t.test('token bez `tv` se odbija kada je verzija korisnika vec uvecana', async () => {
    // Stari token posle blokiranja naloga ne sme da prodje samo zato sto nema claim.
    laznoUserService(postoji(1));
    const r = await pozovi(`Bearer ${token()}`);

    assert.equal(r.status, 401);
    assert.equal(r.telo.error, 'TOKEN_REVOKED');
  });

  await t.test('token NOVIJI od zapamcene verzije osvezava kes umesto da se odbije', async () => {
    // Odmah posle promene lozinke korisnik ima nov token, a gateway jos pamti staru verziju.
    laznoUserService(postoji(0));
    await pozovi(`Bearer ${token({ tv: 0 })}`); // kes pamti verziju 0

    laznoUserService(postoji(1)); // User Service je u medjuvremenu uvecao verziju
    const r = await pozovi(`Bearer ${token({ tv: 1 })}`);

    assert.equal(r.prosao, true, 'nov token je odbijen zbog zastarelog kesa');
    assert.equal(pozivi.length, 1, 'kes nije osvezen');
  });

  await t.test('obrisan nalog daje 401, a ne prolaz', async () => {
    // Token potpisan nasom tajnom ostaje validan i posle brisanja naloga.
    laznoUserService(neNadjen);
    const r = await pozovi(`Bearer ${token({ tv: 0 })}`);

    assert.equal(r.status, 401);
    assert.equal(r.telo.error, 'TOKEN_REVOKED');
    assert.match(r.telo.message, /vise ne postoji/);
  });

  await t.test('nalog koji nije odobren daje 401 i kada verzije odgovaraju', async () => {
    // Blokiran nalog se prepoznaje po statusu, i kada verzija tokena nije promenjena.
    laznoUserService(postoji(2, 'blokiran'));
    const r = await pozovi(`Bearer ${token({ tv: 2 })}`);

    assert.equal(r.status, 401);
    assert.match(r.telo.message, /nije aktivan/);
  });

  await t.test('User Service nedostupan daje 503, ne prolaz', async () => {
    // Propustanje bi vratilo sve blokirane naloge u igru bas kada je sistem najranjiviji.
    laznoUserService(new Error('connect ECONNREFUSED'));
    const r = await pozovi(`Bearer ${token({ tv: 0 })}`);

    assert.equal(r.prosao, false);
    assert.equal(r.status, 503);
    assert.equal(r.telo.error, 'AUTH_UNAVAILABLE');
  });

  await t.test('nevazeci i istekao token prolazi kroz ovaj middleware', async () => {
    // Opoziv se bavi samo vazecim tokenima; nevazece odbija `verifyToken` na ruti,
    // a javne rute ih tretiraju kao „nema tokena".
    laznoUserService(postoji(0));

    const tudji = jwt.sign({ id: 'x', tv: 0 }, 'druga_tajna');
    const istekao = jwt.sign({ id: 'korisnik1', tv: 0 }, process.env.JWT_SECRET, { expiresIn: '-1s' });

    assert.equal((await pozovi(`Bearer ${tudji}`)).prosao, true);
    assert.equal((await pozovi(`Bearer ${istekao}`)).prosao, true);
    assert.equal(pozivi.length, 0);
  });

  await t.test('token bez `id` prolazi, jer se ne zna koga bi proverio', async () => {
    // Takav token nijedna zasticena ruta ne prihvata, pa ovde nema sta da se odbije.
    laznoUserService(postoji(0));
    const bezId = jwt.sign({ korisnickoIme: 'demo', tv: 0 }, process.env.JWT_SECRET);

    assert.equal((await pozovi(`Bearer ${bezId}`)).prosao, true);
    assert.equal(pozivi.length, 0);
  });

  await t.test('drugi zahtev istog korisnika ide iz kesa', async () => {
    // Bez kesa bi svaka ruta dodala mrezni poziv; planiranje ih napravi i desetak.
    laznoUserService(postoji(0));
    await pozovi(`Bearer ${token({ tv: 0 })}`);
    await pozovi(`Bearer ${token({ tv: 0 })}`);

    assert.equal(pozivi.length, 1);
  });

  await t.test('poziv nosi interni kljuc u zaglavlju', async () => {
    // Interna ruta User Service-a odbija zahtev bez njega, pa bi provera pala na 503.
    laznoUserService(postoji(0));
    await pozovi(`Bearer ${token({ tv: 0 })}`);

    assert.equal(pozivi[0].opcije.headers['X-Internal-Key'], 'interni_kljuc_za_testove');
    assert.match(pozivi[0].url, /\/token-version$/);
  });

  await t.test('duzina kesa se cita iz TOKEN_VERSION_CACHE_MS', async () => {
    // Probe je postavljaju na 0 da provera bude trenutna; podrazumevano je 30 s
    // (kompromis: blokiranje deluje najkasnije za pola minuta).
    assert.equal(KES_MS, 60_000);
  });

  await t.test('ocistiKes za jednog korisnika ne brise ostale', async () => {
    // Probe brisu samo nalog koji menjaju; brisanje celog kesa bi krilo greske u kesiranju.
    laznoUserService(postoji(0));
    await pozovi(`Bearer ${token({ tv: 0 })}`);
    await pozovi(`Bearer ${jwt.sign({ id: 'korisnik2', tv: 0 }, process.env.JWT_SECRET)}`);
    assert.equal(pozivi.length, 2);

    ocistiKes('korisnik1');
    await pozovi(`Bearer ${token({ tv: 0 })}`);
    await pozovi(`Bearer ${jwt.sign({ id: 'korisnik2', tv: 0 }, process.env.JWT_SECRET)}`);

    assert.equal(pozivi.length, 3, 'korisnik2 je nepotrebno ponovo proveren');
  });
});
