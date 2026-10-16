const assert = require('node:assert/strict');
const fs = require('node:fs');

const { napraviDrajver, ugasi } = require('../podesavanja/drajver');
const { snimiAkoJePao } = require('../podesavanja/pad');
const api = require('../podesavanja/api');
const KONFIG = require('../podesavanja/konfiguracija');
const {
  prijaviKrozSkladiste,
  pripremiPreuzimanja,
  cekajPdf,
  pocetakFajla
} = require('../podesavanja/pomoc');

const { Putovanje } = require('../stranice/Putovanje');
const Rezervacija = require('../stranice/Rezervacija');

/**
 * SCENARIJI 8, 9 i 10 - rezervacija leta, istekla ponuda, otkazivanje.
 *
 * Granični slučajevi se izazivaju nastavkom oznake mock ponude
 * (`_pricechange`, `_expired`), pa se ceo tok iz §4.8 proverava bez pravih
 * ključeva i bez stvarne kupovine.
 */
describe('Rezervacija leta', function () {
  let drajver;
  let token;
  let korisnik;
  const zaBrisanje = [];

  /** Ispravni podaci putnika; pojedinačni testovi kvare po jedno polje. */
  const PUTNIK = (izmene = {}) => ({
    titula: 'ms',
    pol: 'f',
    ime: 'Jovana',
    prezime: 'Ceganjac',
    rodjen: '1995-04-12',
    email: 'jovana@primer.test',
    telefon: '+381601234567',
    ...izmene
  });

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
  it('8. promenjena cena, provera putnika, PNR i PDF potvrda', async function () {
    const rezervacija = new Rezervacija(drajver);
    const putovanje = new Putovanje(drajver);

    const tripId = await api.putovanjeSaPonudom(token, {
      offerId: api.mockOfferId({ nastavak: '_pricechange' }),
      naslov: 'E2E rezervacija sa promenom cene'
    });
    zaBrisanje.push(tripId);

    const preuzimanja = pripremiPreuzimanja();

    await prijaviKrozSkladiste(drajver, { token, user: korisnik });
    await rezervacija.otvori(tripId);

    // --- korak 1: cena se promenila, „Dalje" je zaključano ---
    assert.equal(await rezervacija.cenaPromenjena(), true, 'Ponuda `_pricechange` nije promenila cenu');
    assert.equal(
      await rezervacija.daljeJeOmoguceno(),
      false,
      '„Dalje" je otvoreno pre nego što je nova cena prihvaćena'
    );

    await rezervacija.prihvatiCenu();

    assert.equal(
      await rezervacija.daljeJeOmoguceno(),
      true,
      '„Dalje" je ostalo zaključano i posle prihvatanja cene'
    );

    await rezervacija.daljeNaPutnike();

    // --- korak 2: ćirilično ime se odbija ---
    assert.equal(await rezervacija.brojPutnika(), 2, 'Forma ne traži oba putnika');

    await rezervacija.popuniPutnika(1, PUTNIK({ ime: 'Јована' }));
    await rezervacija.popuniPutnika(2, PUTNIK({ ime: 'Marko', prezime: 'Markovic', pol: 'm', titula: 'mr' }));

    /*
     * Ćirilica se zaustavlja VEĆ na klijentu: isto pravilo stoji i u
     * `putnik.validator.ts` i u `putniciValidator.js`, pa se forma ne šalje i
     * poruka stoji uz polje.
     */
    const greskaCirilica = await rezervacija.cekajGreskuPolja('givenName');
    assert.match(
      greskaCirilica,
      /latinic/i,
      `Ćirilično ime nije odbijeno porukom o latinici: „${greskaCirilica}"`
    );
    // Dugme ostaje otvoreno (greške se pokazuju posle pokušaja), ali korak se NE menja
    await rezervacija.daljeNaPregled();
    assert.equal(await rezervacija.korak(), 2, 'Forma je prošla sa ćiriličnim imenom');

    // --- pol je obavezan ---
    await rezervacija.popuniPutnika(1, PUTNIK({ pol: '' }));

    const greskaPol = await rezervacija.cekajGreskuPolja('gender');
    assert.match(greskaPol, /pol|obavezan/i, `Nedostatak pola nije prijavljen: „${greskaPol}"`);

    // --- latinica sa č/ć/ž/š/đ prolazi (Latin Extended-A) ---
    await rezervacija.popuniPutnika(1, PUTNIK({ ime: 'Đurđa', prezime: 'Čačić' }));

    assert.equal(await rezervacija.greskaPolja('givenName'), null, 'Srpska latinica je odbijena');
    assert.equal(await rezervacija.greskaPolja('gender'), null);

    await rezervacija.daljeNaPregled();
    await rezervacija.cekaj('rez-potvrda-test', { ms: KONFIG.cekanjePlanMs });

    // --- korak 3: potvrda ---
    await rezervacija.potvrdiTestRezim();
    await rezervacija.potvrdi();
    await rezervacija.cekajUspeh();

    const pnr = await rezervacija.pnr();
    assert.match(pnr, /\S{5,}/, `Kod rezervacije ne izgleda ispravno: „${pnr}"`);
    assert.equal(await rezervacija.statusPutovanja(), 'REZERVISANO');

    // --- PDF potvrda se preuzima kao fajl ---
    await rezervacija.preuzmiPotvrdu();

    const pdf = await cekajPdf(drajver);
    const velicina = fs.statSync(pdf).size;

    assert.ok(velicina > 0, `PDF je prazan (${pdf})`);
    assert.equal(pocetakFajla(pdf), '%PDF', `Fajl nije PDF (počinje sa „${pocetakFajla(pdf)}")`);
    assert.ok(pdf.startsWith(preuzimanja), 'PDF nije u folderu za preuzimanja');

    // --- status putovanja je REZERVISANO i na stranici putovanja ---
    await putovanje.otvori(tripId);
    await putovanje.cekajStatus('REZERVISANO');

    assert.equal(await putovanje.imaRezervaciju(), true, 'Stranica putovanja ne prikazuje rezervaciju');
    assert.equal(await putovanje.pnr(), pnr, 'PNR na stranici putovanja se razlikuje');
  });

  // ---------------------------------------------------------------
  it('9. istekla ponuda se osvežava i tok se nastavlja', async function () {
    const rezervacija = new Rezervacija(drajver);

    const tripId = await api.putovanjeSaPonudom(token, {
      offerId: api.mockOfferId({ nastavak: '_expired' }),
      naslov: 'E2E istekla ponuda'
    });
    zaBrisanje.push(tripId);

    await prijaviKrozSkladiste(drajver, { token, user: korisnik });
    await rezervacija.otvori(tripId);

    /*
     * Istekla ponuda ne zaustavlja tok: aplikacija sama traži isti let
     * ponovo. Ishod je ili cena (ista ili nova), ili spisak
     * alternativa kada isti let više ne postoji.
     */
    let ishod = await rezervacija.ishodKoraka1();

    if (ishod === 'alternative') {
      await rezervacija.izaberiPrvuAlternativu();
      ishod = await rezervacija.ishodKoraka1();
    }

    assert.ok(
      ['cena-promena', 'cena-potvrdjena'].includes(ishod),
      `Posle istekle ponude korak 1 je završio u stanju „${ishod}"`
    );

    if (ishod === 'cena-promena') await rezervacija.prihvatiCenu();

    // Tok se nastavlja do koraka sa putnicima
    await rezervacija.daljeNaPutnike();
    assert.equal(await rezervacija.korak(), 2, 'Tok se nije nastavio na korak sa putnicima');
  });

  // ---------------------------------------------------------------
  it('10. rezervisano putovanje se otkazuje i prelazi u OTKAZANO', async function () {
    const rezervacija = new Rezervacija(drajver);
    const putovanje = new Putovanje(drajver);

    const tripId = await api.putovanjeSaPonudom(token, {
      offerId: api.mockOfferId({ flightId: 2 }),
      naslov: 'E2E otkazivanje'
    });
    zaBrisanje.push(tripId);

    await prijaviKrozSkladiste(drajver, { token, user: korisnik });

    // --- rezervacija (cena se ne menja, pa ide pravo dalje) ---
    await rezervacija.otvori(tripId);
    await rezervacija.daljeNaPutnike();

    await rezervacija.popuniPutnika(1, PUTNIK());
    await rezervacija.popuniPutnika(2, PUTNIK({ ime: 'Marko', prezime: 'Markovic', pol: 'm', titula: 'mr' }));
    await rezervacija.daljeNaPregled();

    await rezervacija.potvrdiTestRezim();
    await rezervacija.potvrdi();
    await rezervacija.cekajUspeh();

    // --- otkazivanje sa stranice putovanja ---
    await putovanje.otvori(tripId);
    await putovanje.cekajStatus('REZERVISANO');

    await putovanje.otkazi();
    await putovanje.cekajStatus('OTKAZANO');

    // Status je promenjen i u bazi, ne samo u prikazu
    const sacuvano = await api.putovanje(token, tripId);
    assert.equal(sacuvano.status, 'OTKAZANO');
  });
});
