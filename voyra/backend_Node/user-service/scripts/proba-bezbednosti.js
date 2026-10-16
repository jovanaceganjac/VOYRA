/**
 * Integracione provere: promena lozinke, opoziv tokena i
 * zastita prijave.
 *
 *   npm run proba:bezbednost
 *
 * Trazi POKRENUTE servise (gateway 4000, user 4001, admin 4005,
 * notification 4007). Pravi svoje probne naloge i brise ih na kraju.
 *
 * NAPOMENA O TRAJANJU: gateway pamti verziju tokena 30 s (podesivo preko
 * `TOKEN_VERSION_CACHE_MS`). Provere koje zavise od isteka tog kesa zato
 * cekaju toliko - proba traje oko minut i po.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const USERS_DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/users_db';
const NOTIF_DB = process.env.MONGODB_NOTIF_DB || 'mongodb://localhost:27017/notifications_db';
const ADMIN_DB = process.env.MONGODB_ADMIN_DB || 'mongodb://localhost:27017/admin_db';

const PREFIKS = 't21';
const LOZINKA = 'ProbaLoz1!';
const NOVA_LOZINKA = 'NovaProba2@';

let pali = 0;

const jednako = (sta, dobio, ocekivano) => {
  const ok = JSON.stringify(dobio) === JSON.stringify(ocekivano);
  console.log(`${ok ? 'OK  ' : 'PAD '} ${sta}: ${JSON.stringify(dobio)}`);
  if (!ok) {
    console.log(`     ocekivano: ${JSON.stringify(ocekivano)}`);
    pali += 1;
  }
};

const tacno = (sta, uslov, opis = '') => {
  console.log(`${uslov ? 'OK  ' : 'PAD '} ${sta}${opis ? `: ${opis}` : ''}`);
  if (!uslov) pali += 1;
};

const naslov = (tekst) => console.log(`\n--- ${tekst} ---`);

const cekaj = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poziv kroz gateway; nikad ne baca, uvek vraca status i telo. */
const poziv = async (metod, putanja, telo = null, token = null) => {
  const odgovor = await fetch(`${GATEWAY}${putanja}`, {
    method: metod.toUpperCase(),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: telo ? JSON.stringify(telo) : undefined
  });

  const tekst = await odgovor.text();

  let sadrzaj = {};
  try {
    sadrzaj = tekst ? JSON.parse(tekst) : {};
  } catch {
    sadrzaj = { sirovo: tekst.slice(0, 120) };
  }

  return { status: odgovor.status, telo: sadrzaj, zaglavlja: odgovor.headers };
};

/**
 * Koliko gateway pamti verziju tokena.
 *
 * Prvo iz OKRUZENJA: test stek (`npm run test:sve`) gateway pokrece sa
 * `TOKEN_VERSION_CACHE_MS=0`, pa bi citanje samo iz `.env` fajla dalo 30 s i
 * proba bi bez potrebe cekala pola minuta.
 * Kada promenljive nema, cita se `.env` gateway-a.
 */
const kesGatewaya = () => {
  const izOkruzenja = parseInt(process.env.TOKEN_VERSION_CACHE_MS, 10);
  if (Number.isFinite(izOkruzenja) && izOkruzenja >= 0) return izOkruzenja;

  try {
    const putanja = path.join(__dirname, '..', '..', 'api-gateway', '.env');
    const sadrzaj = fs.readFileSync(putanja, 'utf8');
    const red = sadrzaj.split('\n').find((l) => l.startsWith('TOKEN_VERSION_CACHE_MS='));

    if (!red) return 30000;

    const vrednost = parseInt(red.split('=')[1], 10);
    return Number.isFinite(vrednost) && vrednost >= 0 ? vrednost : 30000;
  } catch {
    return 30000;
  }
};

(async () => {
  const veza = await mongoose.createConnection(USERS_DB).asPromise();
  const notif = await mongoose.createConnection(NOTIF_DB).asPromise();
  const adminDb = await mongoose.createConnection(ADMIN_DB).asPromise();

  const korisnici = veza.db.collection('users');
  const KES_MS = kesGatewaya();

  console.log(`[PROBA] Kes verzije tokena u gateway-u: ${KES_MS} ms\n`);

  /** Pravi nalog kroz REGISTRACIJU, pa ga odobrava u bazi. */
  const napraviNalog = async (ime, uloga = 'korisnik') => {
    const korisnickoIme = `${PREFIKS}_${ime}`;
    const email = `${korisnickoIme}@voyra.test`;

    await korisnici.deleteMany({ $or: [{ korisnickoIme }, { email }] });

    const r = await poziv('post', '/api/users/register', {
      ime: 'Proba',
      prezime: 'Bezbednost',
      email,
      korisnickoIme,
      lozinka: LOZINKA,
      lozinkaConfirm: LOZINKA
    });

    if (r.status >= 400) throw new Error(`Registracija ${korisnickoIme}: ${JSON.stringify(r.telo)}`);

    await korisnici.updateOne({ korisnickoIme }, { $set: { status: 'odobren', uloga } });

    return { korisnickoIme, email };
  };

  const prijava = async (korisnickoIme, lozinka) => {
    const r = await poziv('post', '/api/users/login', { korisnickoIme, lozinka });

    return { status: r.status, token: r.telo?.token || null, telo: r.telo, zaglavlja: r.zaglavlja };
  };

  try {
    // ============================================================
    // 1. Promena lozinke
    // ============================================================
    naslov('1. Promena lozinke (§4.10)');

    const a = await napraviNalog('lozinka');
    const prvaPrijava = await prijava(a.korisnickoIme, LOZINKA);

    jednako('prijava prolazi', prvaPrijava.status, 200);
    const stariToken = prvaPrijava.token;

    const tv = JSON.parse(Buffer.from(stariToken.split('.')[1], 'base64url').toString()).tv;
    jednako('token nosi claim `tv`', tv, 0);

    const pogresna = await poziv(
      'put',
      '/api/users/me/password',
      { trenutnaLozinka: 'PogresnaLoz1!', novaLozinka: NOVA_LOZINKA },
      stariToken
    );

    jednako('pogresna trenutna lozinka -> 400', pogresna.status, 400);
    jednako('kod greske', pogresna.telo?.error, 'WRONG_PASSWORD');

    const slaba = await poziv(
      'put',
      '/api/users/me/password',
      { trenutnaLozinka: LOZINKA, novaLozinka: 'slaba' },
      stariToken
    );

    jednako('slaba nova lozinka -> 400', slaba.status, 400);

    // Joi validator vraca listu u `message`; `errors` koriste servisi
    // koji sami sklapaju gresku (Trip Service)
    const praviloPoruke = []
      .concat(slaba.telo?.message || [], slaba.telo?.errors || [])
      .map(String);

    tacno(
      'greska navodi pravila',
      praviloPoruke.some((g) => g.includes('8 karaktera') || g.includes('VELIKA')),
      JSON.stringify(praviloPoruke)
    );

    const ista = await poziv(
      'put',
      '/api/users/me/password',
      { trenutnaLozinka: LOZINKA, novaLozinka: LOZINKA },
      stariToken
    );

    jednako('ista kao stara -> 400', ista.status, 400);
    jednako('kod greske', ista.telo?.error, 'SAME_PASSWORD');

    const uspeh = await poziv(
      'put',
      '/api/users/me/password',
      { trenutnaLozinka: LOZINKA, novaLozinka: NOVA_LOZINKA },
      stariToken
    );

    jednako('promena prolazi', uspeh.status, 200);
    tacno('odgovor nosi nov token', Boolean(uspeh.telo?.token));

    const noviToken = uspeh.telo.token;
    const noviTv = JSON.parse(Buffer.from(noviToken.split('.')[1], 'base64url').toString()).tv;

    jednako('nov token ima vecu verziju', noviTv, 1);

    /*
     * Nov token radi ODMAH: gateway vidi da je noviji od zapamcene
     * verzije, pa osvezi kes umesto da odbije zahtev. Taj isti poziv
     * osvezi kes, pa stari token odmah posle toga pada - bez cekanja.
     */
    const saNovim = await poziv('get', '/api/users/me', null, noviToken);
    jednako('nov token radi odmah', saNovim.status, 200);

    const saStarim = await poziv('get', '/api/users/me', null, stariToken);
    jednako('stari token -> 401', saStarim.status, 401);
    jednako('kod greske', saStarim.telo?.error, 'TOKEN_REVOKED');

    await cekaj(1200);

    const pismo = await notif.db
      .collection('notifications')
      .findOne({ 'recipient.email': a.email, type: 'PASSWORD_CHANGED' }, { sort: { _id: -1 } });

    tacno('obavestenje PASSWORD_CHANGED je u redu', Boolean(pismo), pismo?.subject || 'nema');

    const zapis = await adminDb.db
      .collection('audit_logs')
      .findOne({ action: 'CHANGE_PASSWORD' }, { sort: { timestamp: -1 } });

    tacno('audit CHANGE_PASSWORD postoji', Boolean(zapis));
    tacno(
      'audit ne sadrzi nista o lozinki',
      !JSON.stringify(zapis || {})
        .toLowerCase()
        .replace(/change_password/g, '')
        .match(/lozink|passw|\$2[aby]\$/),
      'polja: ' + Object.keys(zapis || {}).join(', ')
    );

    // ============================================================
    // 2. Ogranicenje pokusaja pri promeni lozinke
    // ============================================================
    naslov('2. Pet pogresnih trenutnih lozinki -> 429');

    const b = await napraviNalog('limit');
    const tokenB = (await prijava(b.korisnickoIme, LOZINKA)).token;

    let poslednji = null;
    let zakljucanoNa = 0;

    for (let i = 1; i <= 7; i++) {
      poslednji = await poziv(
        'put',
        '/api/users/me/password',
        { trenutnaLozinka: 'NijeTacna1!', novaLozinka: NOVA_LOZINKA },
        tokenB
      );

      if (poslednji.status === 429) {
        zakljucanoNa = i;
        break;
      }
    }

    // Peti promasaj popunjava kvotu, pa on sam vec vraca 429
    jednako('zakljucano na petom pogresnom pokusaju', zakljucanoNa, 5);
    jednako('odgovor je 429', poslednji.status, 429);
    tacno(
      'zaglavlje Retry-After postoji',
      Boolean(poslednji.zaglavlja.get('retry-after')),
      `Retry-After: ${poslednji.zaglavlja.get('retry-after')}`
    );
    tacno('telo nosi retryAfter', Number(poslednji.telo?.retryAfter) > 0);

    // I tacna lozinka se sada odbija, dok zakljucavanje traje
    const dokTraje = await poziv(
      'put',
      '/api/users/me/password',
      { trenutnaLozinka: LOZINKA, novaLozinka: NOVA_LOZINKA },
      tokenB
    );

    jednako('i tacna lozinka ceka istek zakljucavanja', dokTraje.status, 429);

    // ============================================================
    // 3. Blokiranje korisnika
    // ============================================================
    naslov('3. Blokiranje odjavljuje postojecu sesiju');

    const c = await napraviNalog('blokiran');
    const tokenC = (await prijava(c.korisnickoIme, LOZINKA)).token;

    jednako('token radi pre blokiranja', (await poziv('get', '/api/users/me', null, tokenC)).status, 200);

    await korisnici.updateOne(
      { korisnickoIme: c.korisnickoIme },
      { $set: { status: 'blokiran' }, $inc: { tokenVersion: 1 } }
    );

    console.log(`     (cekam ${KES_MS} ms da istekne kes gateway-a)`);
    await cekaj(KES_MS + 1500);

    const posleBlokiranja = await poziv('get', '/api/users/me', null, tokenC);

    jednako('token posle blokiranja -> 401', posleBlokiranja.status, 401);
    jednako('kod greske', posleBlokiranja.telo?.error, 'TOKEN_REVOKED');

    const prijavaBlokiranog = await prijava(c.korisnickoIme, LOZINKA);

    jednako('prijava blokiranog -> 403', prijavaBlokiranog.status, 403);
    tacno(
      'poruka govori o blokiranom nalogu',
      String(prijavaBlokiranog.telo?.message || '').toLowerCase().includes('blokiran'),
      prijavaBlokiranog.telo?.message
    );

    // ============================================================
    // 4. Promena uloge
    // ============================================================
    naslov('4. Promena uloge trazi novu prijavu');

    const d = await napraviNalog('uloga');
    const tokenD = (await prijava(d.korisnickoIme, LOZINKA)).token;

    const preUnapredjenja = await poziv('get', '/api/admin/users', null, tokenD);
    jednako('obican korisnik nema admin pristup', preUnapredjenja.status, 403);

    await korisnici.updateOne(
      { korisnickoIme: d.korisnickoIme },
      { $set: { uloga: 'admin' }, $inc: { tokenVersion: 1 } }
    );

    console.log(`     (cekam ${KES_MS} ms da istekne kes gateway-a)`);
    await cekaj(KES_MS + 1500);

    const stariPosleUloge = await poziv('get', '/api/users/me', null, tokenD);
    jednako('stari token posle promene uloge -> 401', stariPosleUloge.status, 401);

    const novaPrijava = await prijava(d.korisnickoIme, LOZINKA);
    const adminPristup = await poziv('get', '/api/admin/users', null, novaPrijava.token);

    jednako('nova prijava daje admin pristup', adminPristup.status, 200);

    // ============================================================
    // 5. User Service nije dostupan
    // ============================================================
    naslov('5. Ponasanje kada User Service ne odgovara');

    /*
     * Servis se ne gasi - middleware se poziva direktno, sa adresom na
     * kojoj niko ne slusa. Tako se proverava bas grana koja odlucuje, a
     * proba ne dira pokrenute servise.
     */
    const stariUrl = process.env.USER_SERVICE_URL;
    process.env.USER_SERVICE_URL = 'http://127.0.0.1:59999';
    process.env.TOKEN_VERSION_CACHE_MS = '0';

    delete require.cache[require.resolve('../../api-gateway/src/middleware/opozivTokena')];
    const { opozivTokena } = require('../../api-gateway/src/middleware/opozivTokena');

    const laznoOdgovori = () => {
      const stanje = { status: null, telo: null };

      return {
        res: {
          status(s) {
            stanje.status = s;
            return this;
          },
          json(t) {
            stanje.telo = t;
            return this;
          }
        },
        stanje
      };
    };

    const tokenZaProbu = (await prijava(a.korisnickoIme, NOVA_LOZINKA)).token;

    const saTokenom = laznoOdgovori();
    let proslo = false;

    await opozivTokena(
      { headers: { authorization: `Bearer ${tokenZaProbu}` } },
      saTokenom.res,
      () => {
        proslo = true;
      }
    );

    jednako('zahtev sa tokenom -> 503', saTokenom.stanje.status, 503);
    tacno('zahtev nije propusten dalje', proslo === false);

    const bezTokena = laznoOdgovori();
    let prosloBez = false;

    await opozivTokena({ headers: {} }, bezTokena.res, () => {
      prosloBez = true;
    });

    tacno('zahtev bez tokena prolazi', prosloBez === true);

    process.env.USER_SERVICE_URL = stariUrl;

    // Javna ruta bez tokena i dalje radi kroz pokrenuti gateway
    const javna = await poziv('get', '/v1/cities?q=beo');
    jednako('javna ruta bez tokena radi', javna.status, 200);

    // ============================================================
    // 6. Stari token bez claim-a `tv`
    // ============================================================
    naslov('6. Token izdat ranije (bez `tv`)');

    const e = await napraviNalog('stari');
    const zapisE = await korisnici.findOne({ korisnickoIme: e.korisnickoIme });

    // Token bez `tv` - tacno onakav kakav je sistem izdavao ranije
    const tokenBezTv = jwt.sign(
      {
        id: String(zapisE._id),
        korisnickoIme: e.korisnickoIme,
        email: e.email,
        uloga: 'korisnik'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    jednako(
      'stari token radi dok je verzija 0',
      (await poziv('get', '/api/users/me', null, tokenBezTv)).status,
      200
    );

    await korisnici.updateOne({ _id: zapisE._id }, { $inc: { tokenVersion: 1 } });

    console.log(`     (cekam ${KES_MS} ms da istekne kes gateway-a)`);
    await cekaj(KES_MS + 1500);

    const posleVerzije = await poziv('get', '/api/users/me', null, tokenBezTv);

    jednako('posle promene verzije -> 401', posleVerzije.status, 401);
    jednako('kod greske', posleVerzije.telo?.error, 'TOKEN_REVOKED');

    // ============================================================
    // 7. Zastita prijave
    // ============================================================
    naslov('7. Ogranicenje pokusaja prijave (§4)');

    const f = await napraviNalog('prijava');

    const nepostojeci = await prijava(`${PREFIKS}_nema_me`, 'BiloSta1!');
    const pogresnaLozinka = await prijava(f.korisnickoIme, 'PogresnaLoz1!');

    jednako('nepostojeci korisnik -> 401', nepostojeci.status, 401);
    jednako('pogresna lozinka -> 401', pogresnaLozinka.status, 401);
    jednako(
      'ISTA poruka za oba slucaja',
      nepostojeci.telo?.message,
      pogresnaLozinka.telo?.message
    );

    // Vec su dva promasaja - do petog ostaju tri
    let zakljucanaPrijava = null;
    let promasaja = 1; // vec je bio jedan promasaj za ovaj nalog

    for (let i = 2; i <= 7; i++) {
      zakljucanaPrijava = await prijava(f.korisnickoIme, 'PogresnaLoz1!');
      promasaja = i;

      if (zakljucanaPrijava.status === 429) break;
    }

    jednako('zakljucano na petom promasaju', promasaja, 5);
    jednako('odgovor je 429', zakljucanaPrijava.status, 429);
    tacno(
      'zaglavlje Retry-After postoji',
      Boolean(zakljucanaPrijava.zaglavlja.get('retry-after')),
      `Retry-After: ${zakljucanaPrijava.zaglavlja.get('retry-after')}`
    );

    // Tacna lozinka dok zakljucavanje traje takodje ceka
    const tacnaDokTraje = await prijava(f.korisnickoIme, LOZINKA);
    jednako('i tacna lozinka ceka', tacnaDokTraje.status, 429);

    // Uspesna prijava brise brojac - proverava se na drugom nalogu
    const g = await napraviNalog('brojac');

    await prijava(g.korisnickoIme, 'PogresnaLoz1!');
    await prijava(g.korisnickoIme, 'PogresnaLoz1!');

    const uspesna = await prijava(g.korisnickoIme, LOZINKA);
    jednako('uspesna prijava prolazi', uspesna.status, 200);

    const kolekcijaPokusaja = veza.db.collection('login_attempts');
    const ostalo = await kolekcijaPokusaja.countDocuments({
      korisnickoIme: g.korisnickoIme
    });

    jednako('uspesna prijava brise brojac', ostalo, 0);

    naslov('Rezultat');
  } finally {
    await korisnici.deleteMany({ korisnickoIme: new RegExp(`^${PREFIKS}_`) });
    await veza.db.collection('login_attempts').deleteMany({ korisnickoIme: new RegExp(`^${PREFIKS}_`) });
    await notif.db
      .collection('notifications')
      .deleteMany({ 'recipient.email': new RegExp(`^${PREFIKS}_`) })
      .catch(() => {});

    await veza.close();
    await notif.close();
    await adminDb.close();
  }

  if (pali > 0) {
    console.log(`\nPALO PROVERA: ${pali}`);
    process.exit(1);
  }

  console.log('\nSVE PROVERE PROLAZE');
})().catch(async (err) => {
  console.error('\nPROBA PREKINUTA:', err.message);
  process.exit(1);
});
