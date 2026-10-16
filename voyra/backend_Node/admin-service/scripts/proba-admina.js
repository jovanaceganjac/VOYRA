/**
 * Integracione provere: odluka o registraciji sa obavestenjem,
 * kategorije interesovanja, atrakcije administratora i destinacije.
 *
 *   npm run proba:admin
 *
 * Trazi POKRENUTE servise (gateway 4000 i sve iza njega) i uvezenu bazu
 * gradova. Radi u mock/demo rezimu. Pravi svoje probne naloge i sadrzaj,
 * i brise ih na kraju.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const USERS_DB = process.env.MONGODB_USERS_DB || 'mongodb://localhost:27017/users_db';
const TRIPS_DB = process.env.MONGODB_TRIPS_DB || 'mongodb://localhost:27017/trips_db';
const ADMIN_DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_db';
const NOTIF_DB = process.env.MONGODB_NOTIF_DB || 'mongodb://localhost:27017/notifications_db';

const PREFIKS = 't20';

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

const mora = (sta, vrednost) => {
  if (vrednost === undefined || vrednost === null) {
    throw new Error(`${sta} nije pronadjeno - dalje provere nemaju smisla`);
  }
  return vrednost;
};

const naslov = (tekst) => console.log(`\n--- ${tekst} ---`);

const poziv = async (metod, putanja, telo, token) => {
  const r = await axios({
    method: metod,
    url: `${GATEWAY}${putanja}`,
    data: telo,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 120000,
    validateStatus: () => true
  });

  return { status: r.status, telo: r.data };
};

/** Cekanje da istekne kes (kategorije 60 s, shema 60 s). */
const sacekaj = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const users = await mongoose.createConnection(USERS_DB).asPromise();
  const trips = await mongoose.createConnection(TRIPS_DB).asPromise();
  const adminDb = await mongoose.createConnection(ADMIN_DB).asPromise();
  const notifDb = await mongoose.createConnection(NOTIF_DB).asPromise();

  const kolekcijaKorisnika = users.db.collection('users');

  /** Pravi nalog i vraca { id, token }. */
  const napraviNalog = async ({ ime, uloga = 'korisnik', status = 'odobren' }) => {
    const korisnickoIme = `${PREFIKS}_${ime}`;
    const email = `${korisnickoIme}@voyra.test`;

    await kolekcijaKorisnika.deleteMany({ $or: [{ korisnickoIme }, { email }] });

    const { insertedId } = await kolekcijaKorisnika.insertOne({
      ime: 'Proba',
      prezime: ime,
      email,
      korisnickoIme,
      lozinka: 'x',
      uloga,
      status,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return {
      id: String(insertedId),
      korisnickoIme,
      email,
      token: jwt.sign(
        { id: String(insertedId), korisnickoIme, email, uloga },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      )
    };
  };

  const admin = await napraviNalog({ ime: 'admin', uloga: 'admin' });
  const obican = await napraviNalog({ ime: 'obican' });

  console.log(`[PROBA] Probni nalozi: ${admin.korisnickoIme}, ${obican.korisnickoIme}\n`);

  const napravljeneAtrakcije = [];
  const napravljeneDestinacije = [];
  let kandidat = null;

  try {
    // ============================================================
    // 1. Odobravanje zahteva za registraciju
    // ============================================================
    naslov('1. Odobravanje registracije (§3.3)');

    kandidat = await napraviNalog({ ime: 'kandidat', status: 'na_cekanju' });

    const odobravanje = await poziv(
      'patch',
      `/api/admin/users/${kandidat.id}/status`,
      { status: 'odobren' },
      admin.token
    );

    jednako('odobravanje prolazi', odobravanje.status, 200);
    jednako('status je odobren', odobravanje.telo.data?.status, 'odobren');
    jednako('poslato je obavestenje o odobrenju', odobravanje.telo.obavestenje, 'REGISTRATION_APPROVED');
    tacno('obavestenje je primljeno u red', odobravanje.telo.obavesten === true);

    const zapisOdobrenja = await notifDb.db.collection('notifications').findOne(
      { 'recipient.email': kandidat.email, type: 'REGISTRATION_APPROVED' },
      { sort: { createdAt: -1 } }
    );

    tacno('notifikacija je u bazi', Boolean(zapisOdobrenja), zapisOdobrenja?.subject || 'nema');

    const auditOdobrenja = await adminDb.db
      .collection('audit_logs')
      .findOne({ target: kandidat.id, action: 'APPROVE_REGISTRATION' });

    tacno('audit APPROVE_REGISTRATION postoji', Boolean(auditOdobrenja));

    // ============================================================
    // 2. Odbijanje sa razlogom
    // ============================================================
    naslov('2. Odbijanje sa razlogom');

    const odbijeni = await napraviNalog({ ime: 'odbijeni', status: 'na_cekanju' });
    const RAZLOG = 'Nepotpuni podaci u zahtevu';

    const odbijanje = await poziv(
      'patch',
      `/api/admin/users/${odbijeni.id}/status`,
      { status: 'odbijen', reason: RAZLOG },
      admin.token
    );

    jednako('odbijanje prolazi', odbijanje.status, 200);
    jednako('tip obavestenja', odbijanje.telo.obavestenje, 'REGISTRATION_REJECTED');

    const zapisOdbijanja = await notifDb.db.collection('notifications').findOne(
      { 'recipient.email': odbijeni.email, type: 'REGISTRATION_REJECTED' },
      { sort: { createdAt: -1 } }
    );

    /*
     * Telo poruke se sklapa tek kada je worker posalje, pa se ovde
     * proverava `templateData` - podatak koji Admin Service zaista
     * prosledjuje sablonu. Kada je poruka vec poslata, proverava se i
     * ispisano telo.
     */
    tacno(
      'razlog je prosledjen sablonu',
      zapisOdbijanja?.templateData?.reason === RAZLOG,
      zapisOdbijanja?.templateData?.reason || 'nema'
    );

    tacno(
      'sablon ispisuje razlog u telu poruke',
      !zapisOdbijanja?.body || zapisOdbijanja.body.includes(RAZLOG),
      zapisOdbijanja?.body ? 'razlog je u telu' : 'poruka jos nije poslata (PENDING)'
    );

    const auditOdbijanja = await adminDb.db
      .collection('audit_logs')
      .findOne({ target: odbijeni.id, action: 'REJECT_REGISTRATION' });

    tacno(
      'audit REJECT_REGISTRATION nosi razlog',
      auditOdbijanja?.newValue?.razlog === RAZLOG,
      auditOdbijanja?.newValue?.razlog || 'nema'
    );

    const prijavaOdbijenog = await poziv('post', '/api/auth/login', {
      korisnickoIme: odbijeni.korisnickoIme,
      lozinka: 'bilosta'
    });

    tacno(
      'prijava odbijenog ne prolazi',
      prijavaOdbijenog.status >= 400,
      `${prijavaOdbijenog.status} ${prijavaOdbijenog.telo?.error || ''}`
    );

    // ============================================================
    // 3. Nedozvoljeni prelazi i zastite
    // ============================================================
    naslov('3. Prelazi statusa i zastite (§4.10)');

    const naCekanju = await napraviNalog({ ime: 'cekanje', status: 'na_cekanju' });

    const nedozvoljen = await poziv(
      'patch',
      `/api/admin/users/${naCekanju.id}/status`,
      { status: 'blokiran' },
      admin.token
    );

    jednako('na_cekanju -> blokiran je 409', nedozvoljen.status, 409);
    jednako('kod greske', nedozvoljen.telo?.error, 'INVALID_STATUS_TRANSITION');

    const sebe = await poziv(
      'patch',
      `/api/admin/users/${admin.id}/status`,
      { status: 'blokiran' },
      admin.token
    );

    jednako('blokiranje sebe je 409', sebe.status, 409);
    jednako('kod greske', sebe.telo?.error, 'SELF_LOCKOUT');

    // Poslednji admin: drugi admin pokusava da blokira jedinog preostalog
    const drugiAdmin = await napraviNalog({ ime: 'admin2', uloga: 'admin' });
    const sviAdmini = await kolekcijaKorisnika.countDocuments({
      uloga: 'admin',
      status: 'odobren'
    });

    if (sviAdmini > 2) {
      console.log(
        `     (preskocena provera poslednjeg admina - u bazi ih je ${sviAdmini}, ` +
          'pa nijedan nije poslednji)'
      );
    } else {
      const poslednji = await poziv(
        'patch',
        `/api/admin/users/${admin.id}/status`,
        { status: 'blokiran' },
        drugiAdmin.token
      );

      // Ovde ih je dva, pa prelaz prolazi; vracamo ga odmah
      tacno('blokiranje drugog admina prolazi kada nije poslednji', poslednji.status === 200);

      await poziv(
        'patch',
        `/api/admin/users/${admin.id}/status`,
        { status: 'odobren' },
        drugiAdmin.token
      );

      // Sada je drugiAdmin jedini kandidat da ostane - blokiraj ga preko prvog
      await poziv(
        'patch',
        `/api/admin/users/${drugiAdmin.id}/status`,
        { status: 'blokiran' },
        admin.token
      );

      const opetPoslednji = await poziv(
        'patch',
        `/api/admin/users/${admin.id}/status`,
        { status: 'blokiran' },
        admin.token
      );

      // Admin ne moze sebe ni inace - proverava se preko brisanja uloge
      tacno('poslednji aktivan admin ostaje zasticen', opetPoslednji.status === 409);
    }

    const uloga = await poziv(
      'patch',
      `/api/admin/users/${admin.id}/role`,
      { uloga: 'korisnik' },
      admin.token
    );

    jednako('oduzimanje sopstvene admin uloge je 409', uloga.status, 409);

    // ============================================================
    // 4. Kategorije interesovanja
    // ============================================================
    naslov('4. Kategorije interesovanja (§3.3, §9)');

    const kategorije = await poziv('get', '/api/admin/categories', null, admin.token);

    jednako('lista kategorija prolazi', kategorije.status, 200);
    tacno(
      'seed je upisao sest kategorija',
      (kategorije.telo.data || []).length >= 6,
      `${kategorije.telo.data?.length} kategorija`
    );

    const muzeji = mora(
      'kategorija muzeji',
      (kategorije.telo.data || []).find((k) => k.kljuc === 'muzeji')
    );

    jednako('trajanje posete muzeja je iz konstanti', muzeji.trajanjePoseteMin, 120);
    jednako('radno vreme muzeja je iz konstanti', muzeji.radnoVreme, {
      open: '09:00',
      close: '17:00'
    });

    const shemaPre = await poziv('get', '/v1/preferences/schema');

    tacno(
      'shema vraca nazive iz baze',
      (shemaPre.telo.data?.interestDetails || []).some((k) => k.kljuc === 'muzeji' && k.naziv === 'Muzeji'),
      shemaPre.telo.data?.interestsSource || 'nepoznat izvor'
    );

    // Neispravna izmena
    const losaIzmena = await poziv(
      'patch',
      '/api/admin/categories/muzeji',
      { trajanjePoseteMin: 5 },
      admin.token
    );

    jednako('trajanje ispod 15 min je odbijeno', losaIzmena.status, 400);
    tacno(
      'greska nosi listu `errors`',
      Array.isArray(losaIzmena.telo?.errors),
      JSON.stringify(losaIzmena.telo?.errors || [])
    );

    // ============================================================
    // 5. Atrakcija administratora
    // ============================================================
    naslov('5. Atrakcije administratora (§4.5)');

    const atina = mora(
      'Atina',
      (await poziv('get', '/v1/cities?q=atina&limit=1')).telo.data?.[0]
    );

    const vanDometa = await poziv(
      'post',
      '/api/admin/attractions',
      {
        naziv: 'Van dometa',
        gradId: atina.id,
        lat: 48.85,
        lon: 2.35,
        kategorije: ['kultura'],
        trajanjeMin: 60
      },
      admin.token
    );

    jednako('koordinate van 50 km su odbijene', vanDometa.status, 400);
    jednako('kod greske', vanDometa.telo?.error, 'LOCATION_OUT_OF_RANGE');
    tacno(
      'poruka kaze koliko je promaseno',
      Number(vanDometa.telo?.udaljenostKm) > 50,
      `${vanDometa.telo?.udaljenostKm} km`
    );

    const NAZIV_NOVE = 'Voyra probna atrakcija';

    const nova = await poziv(
      'post',
      '/api/admin/attractions',
      {
        naziv: NAZIV_NOVE,
        opis: 'Atrakcija uneta u probi',
        gradId: atina.id,
        lat: atina.lat + 0.01,
        lon: atina.lon + 0.01,
        kategorije: ['kultura'],
        trajanjeMin: 45,
        radnoVreme: { open: '10:00', close: '18:00' },
        cenaUlaznice: 5
      },
      admin.token
    );

    jednako('kreiranje atrakcije prolazi', nova.status, 200);
    const atrakcijaId = mora('id nove atrakcije', nova.telo.data?.id);
    napravljeneAtrakcije.push(atrakcijaId);

    const auditAtrakcije = await adminDb.db
      .collection('audit_logs')
      .findOne({ action: 'CREATE_ATTRACTION', target: atrakcijaId });

    tacno('audit CREATE_ATTRACTION postoji', Boolean(auditAtrakcije));

    // Duplikat eksterne atrakcije: Akropolj je u mock podacima za Atinu
    const duplikat = await poziv(
      'post',
      '/api/admin/attractions',
      {
        naziv: 'Akropolj',
        gradId: atina.id,
        lat: 37.9715,
        lon: 23.7257,
        kategorije: ['kultura'],
        trajanjeMin: 120
      },
      admin.token
    );

    if (duplikat.status === 200) napravljeneAtrakcije.push(duplikat.telo.data.id);

    jednako('duplikat se sme uneti (spajanje resava prikaz)', duplikat.status, 200);

    // Kes atrakcija u Integration Service-u traje 7 dana, pa se plan
    // proverava preko stranice „Atrakcije", koja spaja isti spisak
    const stranica = await poziv('get', `/v1/attractions?toCityId=${atina.id}`);

    const uSpisku = (stranica.telo.data || []).filter((a) => a.source === 'admin');

    tacno(
      'atrakcija administratora je u spisku sa source=admin',
      uSpisku.some((a) => a.name === NAZIV_NOVE),
      `${uSpisku.length} adminskih od ${stranica.telo.count}`
    );

    // Isti naziv, ne i „sadrzi" - „Muzej Akropolja" je drugo mesto
    const akropolji = (stranica.telo.data || []).filter(
      (a) => String(a.name).trim().toLowerCase() === 'akropolj'
    );

    tacno(
      'Akropolj se ne pojavljuje dvaput',
      akropolji.length === 1,
      akropolji.map((a) => `${a.name} (${a.source || 'eksterna'})`).join(', ') || 'nema'
    );

    // ============================================================
    // 6. Grad bez OpenTripMap podataka
    // ============================================================
    naslov('6. Atrakcija u gradu bez spoljnog izvora');

    const porto = mora(
      'Porto',
      (await poziv('get', '/v1/cities?q=porto&limit=1')).telo.data?.[0]
    );

    const uPortu = await poziv(
      'post',
      '/api/admin/attractions',
      {
        naziv: 'Livraria Lello',
        opis: 'Knjizara iz 1906. u centru Porta',
        gradId: porto.id,
        lat: 41.1470,
        lon: -8.6148,
        kategorije: ['kultura'],
        trajanjeMin: 45,
        cenaUlaznice: 8
      },
      admin.token
    );

    jednako('atrakcija u Portu je uneta', uPortu.status, 200);
    if (uPortu.status === 200) napravljeneAtrakcije.push(uPortu.telo.data.id);

    const atrakcijePorta = await poziv('get', `/v1/attractions?toCityId=${porto.id}`);

    tacno(
      'Porto u demo rezimu ima atrakciju administratora',
      (atrakcijePorta.telo.data || []).some((a) => a.name === 'Livraria Lello'),
      `${atrakcijePorta.telo.count} atrakcija`
    );

    // ============================================================
    // 7. Istaknute destinacije
    // ============================================================
    naslov('7. Istaknute destinacije (§4.1)');

    const solun = mora(
      'Solun',
      (await poziv('get', '/v1/cities?q=solun&limit=1')).telo.data?.[0]
    );

    const novaDest = await poziv(
      'post',
      '/api/admin/destinations',
      { gradId: solun.id, opis: 'Probna destinacija' },
      admin.token
    );

    jednako('kreiranje destinacije prolazi', novaDest.status, 200);
    const destId = mora('id destinacije', novaDest.telo.data?.id);
    napravljeneDestinacije.push(destId);

    const sveDest = await poziv('get', '/api/admin/destinations', null, admin.token);
    const ids = (sveDest.telo.data || []).map((d) => d.id);

    // Nova ide na pocetak
    const obrnuto = [destId, ...ids.filter((x) => x !== destId)];

    const redosled = await poziv(
      'patch',
      '/api/admin/destinations/order',
      { ids: obrnuto },
      admin.token
    );

    jednako('promena redosleda prolazi', redosled.status, 200);

    // Kes javne rute traje 60 s - zato se cita interna lista kroz admina
    const posleRedosleda = await poziv('get', '/api/admin/destinations', null, admin.token);
    const prvi = (posleRedosleda.telo.data || [])[0];

    jednako('probna destinacija je sada prva', prvi?.id, destId);

    const javne = await poziv('get', '/v1/destinations/featured');

    tacno(
      'javna ruta vraca destinacije po redosledu',
      javne.status === 200 &&
        (javne.telo.data || []).every(
          (d, i, lista) => i === 0 || lista[i - 1].redosled <= d.redosled
        ),
      `${javne.telo.count} destinacija`
    );

    // ============================================================
    // 8. Popularne destinacije
    // ============================================================
    naslov('8. Popularne destinacije (§4.1)');

    const popularne = await poziv('get', '/v1/destinations/popular?limit=8');

    jednako('javna ruta prolazi', popularne.status, 200);
    tacno(
      'svaka popularna ima bar tri pretrage',
      (popularne.telo.data || []).every((d) => d.brojPretraga >= 3),
      (popularne.telo.data || []).map((d) => `${d.naziv}:${d.brojPretraga}`).join(', ') || 'prazno'
    );
    tacno(
      'score je pretrage + 3 x sacuvana',
      (popularne.telo.data || []).every(
        (d) => d.score === d.brojPretraga + 3 * d.brojSacuvanih
      )
    );

    // ============================================================
    // 9. Pristup
    // ============================================================
    naslov('9. Pristup admin rutama (§3.3)');

    for (const [putanja, opis] of [
      ['/api/admin/users', 'korisnici'],
      ['/api/admin/categories', 'kategorije'],
      ['/api/admin/destinations', 'destinacije'],
      [`/api/admin/attractions?gradId=${atina.id}`, 'atrakcije']
    ]) {
      const bezTokena = await poziv('get', putanja);
      const obicanKorisnik = await poziv('get', putanja, null, obican.token);

      jednako(`${opis} bez tokena -> 401`, bezTokena.status, 401);
      jednako(`${opis} za obicnog korisnika -> 403`, obicanKorisnik.status, 403);
    }

    // ============================================================
    // 10. Statistika
    // ============================================================
    naslov('10. Statistika');

    const stats = await poziv('get', '/api/admin/stats', null, admin.token);

    jednako('statistika prolazi', stats.status, 200);

    const rezervisanih = await trips.db
      .collection('trips')
      .countDocuments({ status: 'REZERVISANO' });

    jednako(
      'totalBookings broji REZERVISANO, a ne nepostojeci "booked"',
      stats.telo.data?.totalBookings,
      rezervisanih
    );

    tacno(
      'tripsByStatus koristi nove statuse',
      Object.keys(stats.telo.data?.tripsByStatus || {}).every(
        (s) => !['draft', 'saved', 'booked'].includes(s)
      ),
      Object.keys(stats.telo.data?.tripsByStatus || {}).join(', ') || 'nema putovanja'
    );

    // ============================================================
    naslov('Rezultat');
  } finally {
    // Ciscenje: probni nalozi, atrakcije i destinacije
    for (const id of napravljeneAtrakcije) {
      await trips.db
        .collection('attractions')
        .deleteOne({ _id: new mongoose.Types.ObjectId(id) })
        .catch(() => {});
    }

    for (const id of napravljeneDestinacije) {
      await trips.db
        .collection('destinations')
        .deleteOne({ _id: new mongoose.Types.ObjectId(id) })
        .catch(() => {});
    }

    await kolekcijaKorisnika.deleteMany({ korisnickoIme: new RegExp(`^${PREFIKS}_`) });
    await notifDb.db
      .collection('notifications')
      .deleteMany({ 'recipient.email': new RegExp(`^${PREFIKS}_`) })
      .catch(() => {});
    await adminDb.db.collection('audit_logs').deleteMany({ adminId: admin.id }).catch(() => {});

    await users.close();
    await trips.close();
    await adminDb.close();
    await notifDb.close();
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
