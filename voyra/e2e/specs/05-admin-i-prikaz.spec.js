const assert = require('node:assert/strict');

const { napraviDrajver, ugasi, mobilnaSirina } = require('../podesavanja/drajver');
const { snimiAkoJePao } = require('../podesavanja/pad');
const api = require('../podesavanja/api');
const KONFIG = require('../podesavanja/konfiguracija');
const { DATUMI, prijaviKrozSkladiste, ocistiSkladiste } = require('../podesavanja/pomoc');

const Pocetna = require('../stranice/Pocetna');
const Carobnjak = require('../stranice/Carobnjak');
const Plan = require('../stranice/Plan');
const Admin = require('../stranice/Admin');
const { Profil, Prijava, Zaglavlje } = require('../stranice/Nalog');

/**
 * SCENARIJI 11, 12, 14 i 15 - profil, admin sadržaj, mobilna širina, /docs.
 */
describe('Admin sadržaj, profil i prikaz', function () {
  let drajver;
  let adminToken;

  /** Stanje napravljeno preko API-ja; briše se u `after`. */
  const napravljeno = { destinacije: [], atrakcije: [] };

  /** Istaknuta destinacija iz `before` - proverava je zadnji test. */
  let solun = null;
  let solunDestId = null;

  before(async () => {
    adminToken = await api.adminToken();

    /*
     * Istaknuta destinacija se pravi ODMAH, a proverava u zadnjem testu.
     *
     * `/v1/destinations/featured` ima keš od 60 s (početna se otvara često),
     * pa bi provera neposredno posle pravljenja zahtevala da test čeka da
     * keš istekne. Ovako keš istekne sam, dok se izvršavaju ostali testovi.
     */
    const gradovi = await api.get('/v1/cities?q=solun&limit=1');
    solun = gradovi.telo?.data?.[0];

    if (!solun) return;

    const postojece = await api.get('/api/admin/destinations', { token: adminToken });
    const vecIstaknut = (postojece.telo?.data || []).find((d) => d.gradId === solun.id);

    if (vecIstaknut) {
      solunDestId = vecIstaknut.id;
      return;
    }

    const nova = await api.post(
      '/api/admin/destinations',
      { gradId: solun.id, opis: 'Istaknuta destinacija iz E2E probe' },
      { token: adminToken }
    );

    if (nova.status === 200) {
      solunDestId = nova.telo.data.id;
      napravljeno.destinacije.push(solunDestId);
    }
  });

  beforeEach(async () => {
    drajver = await napraviDrajver();
  });

  afterEach(async function () {
    await snimiAkoJePao(this.currentTest, drajver);
    await ugasi(drajver);
  });

  after(async () => {
    for (const id of napravljeno.destinacije) {
      await api.delete(`/api/admin/destinations/${id}`, { token: adminToken });
    }
    for (const id of napravljeno.atrakcije) {
      await api.delete(`/api/admin/attractions/${id}`, { token: adminToken });
    }
  });

  // ---------------------------------------------------------------
  it('12b. atrakcija administratora ulazi u plan sa oznakom „Preporuka Voyre"', async function () {
    const carobnjak = new Carobnjak(drajver);
    const plan = new Plan(drajver);

    const gradovi = await api.get('/v1/cities?q=atina&limit=1');
    const atina = gradovi.telo?.data?.[0];
    assert.ok(atina, 'Atina nije u bazi gradova');

    /*
     * Atrakcija se unosi na koordinate Akropolja.
     *
     * Spajanje (spec §4.5) isto mesto iz dva izvora vodi kao JEDAN zapis, i
     * to zapis administratora. Akropolj je najbolje ocenjena atrakcija i
     * uvek ulazi u plan, pa je ovo najpouzdaniji način da se proveri da
     * oznaka stiže do prikaza - bez izmišljanja atrakcija.
     */
    const nova = await api.post(
      '/api/admin/attractions',
      {
        naziv: 'Akropolj (provera Voyre)',
        opis: 'Atrakcija uneta u E2E probi',
        gradId: atina.id,
        lat: 37.9715,
        lon: 23.7257,
        kategorije: ['kultura'],
        trajanjeMin: 90,
        radnoVreme: { open: '08:00', close: '20:00' },
        cenaUlaznice: 20
      },
      { token: adminToken }
    );

    assert.equal(nova.status, 200, `Atrakcija nije napravljena: ${JSON.stringify(nova.telo)}`);
    napravljeno.atrakcije.push(nova.telo.data.id);

    // --- nov plan mora da je nosi, sa oznakom ---
    await ocistiSkladiste(drajver);
    await carobnjak.otvori(1);
    await carobnjak.korak1Popuni({ polazak: DATUMI.polazak, povratak: DATUMI.povratak, putnika: 2 });
    await carobnjak.korak1SamoInteresovanja(['kultura']);
    await carobnjak.korak1Dalje();

    await carobnjak.cekajKorak(2);
    await carobnjak.korak2IzaberiPrvu();
    await carobnjak.korak2Dalje();

    await carobnjak.cekajKorak(3);
    await carobnjak.korak3IzaberiPrvu();
    await carobnjak.korak3Dalje();

    await carobnjak.cekajKorak(4);
    await carobnjak.korak4Cekaj();

    const dani = await plan.dani();
    const sve = [];

    for (const d of dani) sve.push(...(await plan.aktivnostiDana(d.dan)));

    const adminska = sve.find((a) => a.izvor === 'admin');

    assert.ok(
      adminska,
      `Nijedna aktivnost u planu ne dolazi od administratora (izvori: ${[...new Set(sve.map((a) => a.izvor))].join(', ')})`
    );

    assert.equal(
      await plan.imaOznakuVoyre(),
      true,
      'Atrakcija administratora nije označena sa „Preporuka Voyre"'
    );
  });

  // ---------------------------------------------------------------
  it('12c. blokiran korisnik se odjavljuje pri sledećem zahtevu', async function () {
    const zaglavlje = new Zaglavlje(drajver);
    const prijava = new Prijava(drajver);

    const nalog = await api.odobrenNalog('e2e12c');
    const { token, user } = await api.prijava(nalog.korisnickoIme, nalog.lozinka);

    await prijaviKrozSkladiste(drajver, { token, user });
    await prijava.idiNa('/moja-putovanja');
    assert.equal(await zaglavlje.jePrijavljen(), true, 'Nalog nije prijavljen pre blokiranja');

    // --- administrator blokira nalog ---
    await api.postaviStatus(nalog.korisnickoIme, 'blokiran');

    /*
     * Gateway opoziv proverava sa kešom (`TOKEN_VERSION_CACHE_MS`, podrazumevano
     * 30 s), pa se zahtev ponavlja najduže toliko. Test stek iz Dela 5
     * postavlja keš na 0, pa deluje iz prvog pokušaja.
     */
    const odjavljen = await zaglavlje.cekajOdjavu(
      parseInt(process.env.E2E_OPOZIV_MS, 10) || 40000
    );

    assert.equal(odjavljen, true, 'Blokiran korisnik je ostao prijavljen i posle isteka keša opoziva');

    assert.equal(await prijava.izSkladista('voyra_token'), null, 'Token blokiranog naloga nije obrisan');
  });

  // ---------------------------------------------------------------
  it('11. promena lozinke odjavljuje DRUGU sesiju', async function () {
    const profil = new Profil(drajver);
    const prvoZaglavlje = new Zaglavlje(drajver);

    const nalog = await api.odobrenNalog('e2e11');
    const prvi = await api.prijava(nalog.korisnickoIme, nalog.lozinka);
    const drugi = await api.prijava(nalog.korisnickoIme, nalog.lozinka);

    const drugiDrajver = await napraviDrajver();

    try {
      const drugoZaglavlje = new Zaglavlje(drugiDrajver);
      const drugaPrijava = new Prijava(drugiDrajver);

      await prijaviKrozSkladiste(drajver, prvi);
      await prijaviKrozSkladiste(drugiDrajver, drugi);

      await drugaPrijava.idiNa('/moja-putovanja');
      assert.equal(await drugoZaglavlje.jePrijavljen(), true, 'Druga sesija nije prijavljena');

      // --- prva sesija menja lozinku ---
      const novaLozinka = 'VoyraNova2!';

      await profil.otvori();
      await profil.promeniLozinku(nalog.lozinka, novaLozinka);

      // Sopstvena sesija OSTAJE prijavljena - dobija nov token
      await profil.cekajUslov(
        async () => (await profil.izSkladista('voyra_token')) !== prvi.token,
        'Prva sesija nije dobila nov token posle promene lozinke'
      );
      assert.equal(await prvoZaglavlje.jePrijavljen(), true, 'Prva sesija je odjavljena');

      // --- druga sesija se odjavljuje pri sledećem zahtevu ---
      const odjavljena = await drugoZaglavlje.cekajOdjavu(
        parseInt(process.env.E2E_OPOZIV_MS, 10) || 40000
      );

      assert.equal(odjavljena, true, 'Druga sesija je ostala prijavljena posle promene lozinke');

      const putanja = await drugaPrijava.putanja();
      assert.match(putanja, /^\/prijava/, `Druga sesija nije odvedena na prijavu (adresa: ${putanja})`);
    } finally {
      await ugasi(drugiDrajver);
    }
  });

  // ---------------------------------------------------------------
  it('14. na 360x740 nema horizontalnog skrola ni na jednoj stranici', async function () {
    /*
     * Prikaz se emulira na postojećem drajveru (CDP), umesto da se pravi nov
     * ili menja veličina prozora: pokretanje drugog Chrome-a i `setRect`
     * usred dugog skupa davali su „Timed out receiving message from
     * renderer", a širina prikaza je jedino što ovaj scenario proverava.
     */
    await mobilnaSirina(drajver);

    const mobilni = drajver;
    const carobnjak = new Carobnjak(mobilni);
    const admin = new Admin(mobilni);

    // --- gost: početna i koraci 1-4 ---
    const pocetna = new Pocetna(mobilni);
    await ocistiSkladiste(mobilni);
    await pocetna.otvori();

    const proveri = async (opis, stranica) => {
      const { scrollWidth, innerWidth } = await stranica.sirine();

      assert.ok(
        scrollWidth <= innerWidth,
        `${opis}: horizontalni skrol (scrollWidth ${scrollWidth} > innerWidth ${innerWidth})`
      );
    };

    await proveri('početna', pocetna);

    await carobnjak.otvori(1);
    await carobnjak.cekaj('korak1-forma');
    await proveri('korak 1', carobnjak);

    await carobnjak.korak1Popuni({ polazak: DATUMI.polazak, povratak: DATUMI.povratak, putnika: 2 });
    await carobnjak.korak1Dalje();

    await carobnjak.cekajKorak(2);
    await carobnjak.korak2Cekaj();
    await proveri('korak 2', carobnjak);

    await carobnjak.korak2IzaberiPrvu();
    await carobnjak.korak2Dalje();
    await carobnjak.cekajKorak(3);
    await carobnjak.korak3Cekaj();
    await proveri('korak 3', carobnjak);

    await carobnjak.korak3IzaberiPrvu();
    await carobnjak.korak3Dalje();
    await carobnjak.cekajKorak(4);
    await carobnjak.korak4Cekaj();
    await proveri('korak 4', carobnjak);

    // --- prijavljen korisnik: stranica putovanja ---
    const korisnik = await api.prijava(
      KONFIG.nalozi.korisnik.korisnickoIme,
      KONFIG.nalozi.korisnik.lozinka
    );

    const tripId = await api.sacuvanoPutovanje(korisnik.token, { naslov: 'E2E mobilni' });

    try {
      await prijaviKrozSkladiste(mobilni, korisnik);

      const { Putovanje } = require('../stranice/Putovanje');
      const putovanje = new Putovanje(mobilni);

      await putovanje.otvori(tripId);
      await proveri('stranica putovanja', putovanje);

      // --- administrator: pregled ---
      const adminKorisnik = await api.prijava(
        KONFIG.nalozi.admin.korisnickoIme,
        KONFIG.nalozi.admin.lozinka
      );

      await prijaviKrozSkladiste(mobilni, adminKorisnik);
      await admin.otvoriPregled();
      await proveri('admin pregled', admin);
    } finally {
      await api.obrisiPutovanje(korisnik.token, tripId);
    }
  });

  // ---------------------------------------------------------------
  it('15. /docs na gateway-u se učitava i sadrži /v1/plan', async function () {
    const stranica = new Pocetna(drajver);

    await drajver.get(`${KONFIG.api}/docs`);

    // Swagger UI popunjava stranicu tek posle preuzimanja šeme
    await stranica.cekajUslov(
      async () => {
        const tekst = await drajver.executeScript('return document.body.innerText || "";');
        return tekst.includes('/v1/plan');
      },
      'Stranica /docs ne prikazuje rutu /v1/plan'
    );

    // Sirova šema takođe mora da je nosi
    const sema = await api.get('/docs/openapi.json');

    assert.equal(sema.status, 200, 'Sirova šema nije dostupna');
    assert.ok(sema.telo?.paths?.['/v1/plan'], 'Šema ne dokumentuje /v1/plan');
    assert.match(sema.telo.openapi || '', /^3\./, 'Šema nije OpenAPI 3.x');
  });
  // ---------------------------------------------------------------
  it('12. istaknuta destinacija se pojavljuje na početnoj i vodi u čarobnjak', async function () {
    const pocetna = new Pocetna(drajver);
    const carobnjak = new Carobnjak(drajver);

    assert.ok(solun, 'Grad Solun nije u bazi - je li pokrenut `import:gradovi`?');
    assert.ok(solunDestId, 'Istaknuta destinacija nije napravljena u pripremi');

    // Keš od 60 s je mogao još da ne istekne - čeka se da se pojavi u odgovoru
    await pocetna.cekajUslov(async () => {
      const r = await api.get('/v1/destinations/featured');
      return (r.telo?.data || []).some((d) => d.gradId === solun.id);
    }, 'Nova destinacija se nije pojavila u /v1/destinations/featured', 70000);

    // --- početna prikazuje destinaciju ---
    await ocistiSkladiste(drajver);
    await pocetna.otvori();

    assert.equal(await pocetna.imaIstaknute(), true, 'Početna ne prikazuje istaknute destinacije');

    const naslovi = await pocetna.nasloviIstaknutih();
    assert.ok(
      naslovi.some((n) => new RegExp(solun.naziv, 'i').test(n)),
      `Nova destinacija nije na početnoj (prikazano: ${naslovi.join(', ')})`
    );

    // --- klik vodi u čarobnjak sa tim gradom ---
    await pocetna.klikNaIstaknutu(solun.id);
    await carobnjak.cekajPutanju(/planiranje/);
    await carobnjak.cekaj('korak1-forma');

    const odrediste = await carobnjak.vrednost('grad-unos-to');
    assert.match(
      odrediste,
      new RegExp(solun.naziv, 'i'),
      `Čarobnjak nije popunio odredište (u polju: „${odrediste}")`
    );
  });
});
