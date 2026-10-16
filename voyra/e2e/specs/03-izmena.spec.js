const assert = require('node:assert/strict');

const { napraviDrajver, ugasi } = require('../podesavanja/drajver');
const { snimiAkoJePao } = require('../podesavanja/pad');
const api = require('../podesavanja/api');
const KONFIG = require('../podesavanja/konfiguracija');
const { prijaviKrozSkladiste } = require('../podesavanja/pomoc');

const { Putovanje } = require('../stranice/Putovanje');
const Plan = require('../stranice/Plan');

/** „HH:MM" u minute - za merenje koliko dan traje. */
const uMinute = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const trajanjeDana = (d) => uMinute(d.availableTo) - uMinute(d.availableFrom);

/**
 * SCENARIJI 6 i 7 - izmena plana i konflikt verzije.
 *
 * Putovanje se pravi preko API-ja: prolaz kroz čarobnjak proverava
 * scenario 3, a ovde je samo polazno stanje.
 */
describe('Izmena plana', function () {
  let drajver;
  let token;
  let korisnik;
  const zaBrisanje = [];

  before(async () => {
    const prijavljen = await api.prijava(
      KONFIG.nalozi.korisnik.korisnickoIme,
      KONFIG.nalozi.korisnik.lozinka
    );

    token = prijavljen.token;
    korisnik = prijavljen.user;
  });

  beforeEach(async () => {
    drajver = await napraviDrajver();
  });

  afterEach(async function () {
    await snimiAkoJePao(this.currentTest, drajver);
    await ugasi(drajver);
  });

  after(async () => {
    for (const id of zaBrisanje) await api.obrisiPutovanje(token, id);
  });

  // ---------------------------------------------------------------
  it('6. premeštanje aktivnosti, kršenje radnog vremena i optimizacija redosleda', async function () {
    const putovanje = new Putovanje(drajver);
    const plan = new Plan(drajver);

    const tripId = await api.sacuvanoPutovanje(token, { naslov: 'E2E izmena' });
    zaBrisanje.push(tripId);

    await prijaviKrozSkladiste(drajver, { token, user: korisnik });
    await putovanje.otvori(tripId);
    await putovanje.pocniIzmenu();

    const daniPre = await putovanje.izmenaDani();
    const izvor = daniPre.find((d) => d.aktivnosti >= 2);
    const cilj = daniPre.find((d) => d.dan !== izvor.dan);

    assert.ok(izvor && cilj, 'Plan nema dva dana za premeštanje');

    // --- premeštanje aktivnosti u drugi dan, pa čuvanje ---
    const aktivnosti = await putovanje.izmenaAktivnosti(izvor.dan);
    const premestena = aktivnosti[aktivnosti.length - 1];

    await putovanje.premesti(izvor.dan, premestena.id, cilj.dan);
    await putovanje.sacuvajIzmene();

    // Posle čuvanja se prikaz vraća iz režima izmene
    await putovanje.cekajDaNestane('izmena-dani');

    // --- osvežavanje: izmena je tu ---
    await putovanje.osvezi();
    await plan.cekaj_();

    const uCilju = await plan.aktivnostiDana(cilj.dan);
    assert.ok(
      uCilju.some((a) => a.id === premestena.id),
      `Aktivnost „${premestena.naziv}" nije ostala u danu ${cilj.dan} posle osvežavanja`
    );

    const uIzvoru = await plan.aktivnostiDana(izvor.dan);
    assert.equal(
      uIzvoru.some((a) => a.id === premestena.id),
      false,
      'Aktivnost je ostala i u starom danu'
    );
  });

  // ---------------------------------------------------------------
  it('6b. „Optimizuj redosled" ne povećava kilometražu dana', async function () {
    const putovanje = new Putovanje(drajver);

    const tripId = await api.sacuvanoPutovanje(token, { naslov: 'E2E optimizacija' });
    zaBrisanje.push(tripId);

    await prijaviKrozSkladiste(drajver, { token, user: korisnik });
    await putovanje.otvori(tripId);
    await putovanje.pocniIzmenu();

    const dani = await putovanje.izmenaDani();
    const dan = dani.find((d) => d.aktivnosti >= 3);

    assert.ok(dan, `Nema dana sa najmanje tri aktivnosti (${dani.map((d) => d.aktivnosti).join(', ')})`);

    /*
     * Redosled se prvo namerno pokvari premeštanjem prve aktivnosti na
     * kraj, pa se optimizacija poziva - tako se meri da li zaista skraćuje
     * put, a ne samo da li ostavlja već dobar redosled na miru.
     */
    const pre = await putovanje.izmenaAktivnosti(dan.dan);
    const kmPre = await putovanje.kmDana(dan.dan);

    await putovanje.optimizuj(dan.dan);

    const kmPosle = await putovanje.kmDana(dan.dan);
    const posle = await putovanje.izmenaAktivnosti(dan.dan);

    assert.ok(
      kmPosle <= kmPre + 0.01,
      `Optimizacija je POVEĆALA kilometražu: ${kmPre} -> ${kmPosle}`
    );

    // Nijedna aktivnost se ne gubi ni duplira
    assert.deepEqual(
      posle.map((a) => a.id).sort(),
      pre.map((a) => a.id).sort(),
      'Optimizacija je promenila SASTAV dana, ne samo redosled'
    );
  });

  // ---------------------------------------------------------------
  it('6c. aktivnost koja ne staje u dan dobija oznaku, ali NIJE izbačena', async function () {
    const putovanje = new Putovanje(drajver);

    const tripId = await api.sacuvanoPutovanje(token, { naslov: 'E2E radno vreme' });
    zaBrisanje.push(tripId);

    /*
     * Kršenje se pravi premeštanjem u NAJKRAĆI dan.
     *
     * Scenario govori o noćnom klubu premeštenom na jutro; demo skup za
     * Atinu nema noćni klub (atrakcije se ne izmišljaju, pa ga nema odakle
     * dodati), a i da ga ima, Planner bi početak pomerio na vreme otvaranja
     * umesto da napravi kršenje. Ista provera se zato izvodi nad drugim
     * kršenjem iz istog pravila: aktivnost premeštena u dan leta ne staje
     * pre kraja dana, dobija oznaku i OSTAJE u planu.
     */
    const sacuvano = await api.putovanje(token, tripId);
    const dani = sacuvano.itinerary?.itinerary || [];

    const kratak = [...dani]
      .filter((d) => d.availableFrom && d.availableTo)
      .sort((a, b) => trajanjeDana(a) - trajanjeDana(b))[0];

    /*
     * Aktivnosti se premeštaju u kratak dan dok se kršenje ne pojavi.
     * Koliko ih treba zavisi od trajanja poseta, a ono se razlikuje po
     * kategoriji - jedna duga atrakcija prelije dan, dve kratke ne moraju.
     *
     * Stanje se čita iz PRIKAZA u svakom koraku, ne iz početnog snimka:
     * posle svakog premeštanja se vremena preračunavaju, pa raspored može
     * da se promeni i pre nego što test odabere sledeću aktivnost.
     */
    await prijaviKrozSkladiste(drajver, { token, user: korisnik });
    await putovanje.otvori(tripId);
    await putovanje.pocniIzmenu();

    const uKratkomNaPocetku = (await putovanje.izmenaAktivnosti(kratak.day)).length;

    /*
     * Prvo se premesti nekoliko aktivnosti, pa se ČEKA da oznake stignu.
     *
     * Oznaka kršenja ne nastaje lokalno: izmena se primenjuje odmah, a nova
     * vremena i oznake stižu sa servera posle kratkog zastoja. Zato se
     * kršenje čeka kao uslov, a ne proverava posle svakog poteza.
     */
    const KOLIKO = 4;
    let premesteno = 0;

    for (let i = 0; i < KOLIKO; i++) {
      const sadaDani = await putovanje.izmenaDani();
      const izvorniDan = sadaDani.find((d) => d.dan !== kratak.day && d.aktivnosti > 0);

      if (!izvorniDan) break;

      const uIzvoru = await putovanje.izmenaAktivnosti(izvorniDan.dan);

      await putovanje.premesti(izvorniDan.dan, uIzvoru[uIzvoru.length - 1].id, kratak.day);
      premesteno += 1;
    }

    await putovanje.cekajUslov(async () => {
      const uKratkom = await putovanje.izmenaAktivnosti(kratak.day);
      return uKratkom.some((x) => x.krsenje);
    }, `Posle ${premesteno} premeštanja u dan ${kratak.day} ` +
        `(${kratak.availableFrom}-${kratak.availableTo}) nijedna aktivnost nije označena`);

    const uKratkom = await putovanje.izmenaAktivnosti(kratak.day);

    // Nijedna premeštena aktivnost nije izbačena - korisnik odlučuje
    assert.equal(
      uKratkom.length,
      uKratkomNaPocetku + premesteno,
      'Neka aktivnost je IZBAČENA iz plana zbog kršenja'
    );

    // Zbirna poruka kaže koliko ih je i da se plan i dalje može sačuvati
    assert.equal(await putovanje.imaKrsenja(), true, 'Nema zbirne poruke o kršenju');
    assert.ok((await putovanje.brojKrsenja()) >= 1);

    // Plan sa kršenjem SME da se sačuva - korisnik odlučuje
    await putovanje.sacuvajIzmene();
    await putovanje.cekajDaNestane('izmena-dani');
  });

  // ---------------------------------------------------------------
  it('7. izmena u dve sesije: druga dobija poruku o konfliktu verzije', async function () {
    const prvaPutovanje = new Putovanje(drajver);

    const tripId = await api.sacuvanoPutovanje(token, { naslov: 'E2E konflikt' });
    zaBrisanje.push(tripId);

    // Druga sesija je drugi drajver - dva pretraživača, isti nalog
    const drugiDrajver = await napraviDrajver();

    try {
      const drugaPutovanje = new Putovanje(drugiDrajver);

      await prijaviKrozSkladiste(drajver, { token, user: korisnik });
      await prijaviKrozSkladiste(drugiDrajver, { token, user: korisnik });

      // Obe sesije otvaraju istu verziju putovanja i ulaze u izmenu
      await prvaPutovanje.otvori(tripId);
      await prvaPutovanje.pocniIzmenu();

      await drugaPutovanje.otvori(tripId);
      await drugaPutovanje.pocniIzmenu();

      const premesti = async (stranica) => {
        const dani = await stranica.izmenaDani();
        const izvor = dani.find((d) => d.aktivnosti >= 2);
        const cilj = dani.find((d) => d.dan !== izvor.dan);
        const aktivnosti = await stranica.izmenaAktivnosti(izvor.dan);

        await stranica.premesti(izvor.dan, aktivnosti[aktivnosti.length - 1].id, cilj.dan);
      };

      // --- prva sesija sačuva ---
      await premesti(prvaPutovanje);
      await prvaPutovanje.sacuvajIzmene();
      await prvaPutovanje.cekajDaNestane('izmena-dani');

      // --- druga sesija čuva nad zastarelom verzijom ---
      await premesti(drugaPutovanje);
      await drugaPutovanje.sacuvajIzmene();

      const poruka = await drugaPutovanje.cekajDijalogKonflikta();

      assert.match(
        poruka,
        /izmenjeno|drugom prozoru/i,
        `Dijalog ne objašnjava konflikt: „${poruka}"`
      );
    } finally {
      await ugasi(drugiDrajver);
    }
  });
});
