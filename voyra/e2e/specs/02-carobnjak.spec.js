const assert = require('node:assert/strict');

const { napraviDrajver, ugasi } = require('../podesavanja/drajver');
const { snimiAkoJePao } = require('../podesavanja/pad');
const api = require('../podesavanja/api');
const KONFIG = require('../podesavanja/konfiguracija');
const { DATUMI, ocistiSkladiste, prijaviKrozSkladiste } = require('../podesavanja/pomoc');

const Pocetna = require('../stranice/Pocetna');
const Carobnjak = require('../stranice/Carobnjak');
const Plan = require('../stranice/Plan');
const { Prijava } = require('../stranice/Nalog');
const { MojaPutovanja } = require('../stranice/Putovanje');

/** „HH:MM" u minute od početka dana - za poređenje vremena. */
const uMinute = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

describe('Čarobnjak', function () {
  let drajver;
  const zaBrisanje = [];

  beforeEach(async () => {
    drajver = await napraviDrajver();
    await ocistiSkladiste(drajver);
  });

  afterEach(async function () {
    await snimiAkoJePao(this.currentTest, drajver);
    await ugasi(drajver);
  });

  after(async () => {
    // Putovanja napravljena u testu se brišu, da lista ne raste bez granice
    if (zaBrisanje.length === 0) return;

    const token = await api.korisnikToken();
    for (const id of zaBrisanje) await api.obrisiPutovanje(token, id);
  });

  // ---------------------------------------------------------------
  it('3. gost prolazi kroz sva četiri koraka, grad bira samo tastaturom', async function () {
    const pocetna = new Pocetna(drajver);
    const carobnjak = new Carobnjak(drajver);
    const plan = new Plan(drajver);

    // --- početna: grad SAMO tastaturom (kucanje, strelica dole, Enter) ---
    await pocetna.otvori();

    /*
     * Strelica dole mora da pomeri aktivan predlog: komponenta po dolasku
     * rezultata sama aktivira prvi, pa se ovde prvo proverava da strelica
     * zaista radi, a onda se Enterom bira prvi (Atina).
     */
    const unos = await pocetna.otvoriListu('to', KONFIG.odredista.atina.upit);
    const prvi = await pocetna.aktivnaOpcija('to');
    assert.ok(prvi, 'Posle kucanja nijedan predlog nije aktivan (aria-activedescendant)');

    await unos.sendKeys(Pocetna.Key.ARROW_DOWN);
    const drugi = await pocetna.aktivnaOpcija('to');
    assert.notEqual(drugi, prvi, 'Strelica dole nije pomerila aktivan predlog');

    await unos.sendKeys(Pocetna.Key.ARROW_UP);
    assert.equal(await pocetna.aktivnaOpcija('to'), prvi, 'Strelica gore se nije vratila na prvi');

    // Enter bira aktivan predlog; lista se zatvara, a polje nosi naziv grada
    await unos.sendKeys(Pocetna.Key.ENTER);
    await pocetna.cekajDaNestane('grad-lista-to');

    const odrediste = await unos.getAttribute('value');
    assert.match(
      odrediste,
      new RegExp(KONFIG.odredista.atina.naziv, 'i'),
      `Tastatura nije izabrala grad (u polju je „${odrediste}")`
    );

    const polaziste = await pocetna.izaberiGradTastaturom('from', KONFIG.polaziste.upit);
    assert.match(polaziste, new RegExp(KONFIG.polaziste.naziv, 'i'));

    await pocetna.postaviVrednost('polje-polazak', DATUMI.polazak);
    await pocetna.postaviVrednost('polje-povratak', DATUMI.povratak);
    await pocetna.upisi('polje-putnika', 2);
    await pocetna.posalji();

    // --- korak 1: intenzivan tempo, kultura + muzeji ---
    await carobnjak.cekajKorak(1);
    await carobnjak.korak1Tempo('intenzivan');
    await carobnjak.korak1Interesovanja(['kultura', 'muzeji']);
    await carobnjak.korak1Dalje();

    // --- korak 2: promena prioriteta menja preporučeni let ---
    await carobnjak.cekajKorak(2);

    const ponude = await carobnjak.korak2Ponude();
    assert.ok(ponude.length >= 2, `Za probu su potrebne najmanje dve ponude (dobijeno ${ponude.length})`);

    await carobnjak.korak2PromeniPrioritet('najjeftinije');
    const najjeftinije = await carobnjak.korak2Preporucena();

    await carobnjak.korak2PromeniPrioritet('najbrze');
    const najbrze = await carobnjak.korak2Preporucena();

    assert.ok(najjeftinije, 'Nijedna ponuda nije označena kao preporučena');
    assert.notEqual(
      najjeftinije,
      najbrze,
      'Promena prioriteta nije promenila preporučeni let (§6.1)'
    );

    await carobnjak.korak2IzaberiPrvu();
    await carobnjak.korak2Dalje();

    // --- korak 3: filter „Hostel" ostavlja samo hostele ---
    await carobnjak.cekajKorak(3);

    const svi = await carobnjak.korak3Ponude();
    assert.ok(svi.length > 0, 'Nema ponuda smeštaja');
    assert.ok(
      new Set(svi.map((s) => s.tip)).size > 1,
      'Za probu filtera potrebne su ponude više tipova'
    );

    await carobnjak.korak3SamoTip('hostel');
    const hosteli = await carobnjak.korak3Ponude();

    assert.ok(hosteli.length > 0, 'Filter „Hostel" nije ostavio nijednu ponudu');
    assert.deepEqual(
      [...new Set(hosteli.map((s) => s.tip))],
      ['hostel'],
      `Filter je propustio i druge tipove: ${[...new Set(hosteli.map((s) => s.tip))].join(', ')}`
    );

    // Booking.com link nosi grad, datume i broj gostiju (spec §4.4)
    const link = await carobnjak.korak3BookingLink();
    assert.ok(link, 'Ponuda smeštaja nema Booking.com link');

    const url = new URL(link);
    assert.match(url.hostname, /booking\.com$/);
    assert.match(url.searchParams.get('ss') || '', /Athens|Atina/i);
    assert.equal(url.searchParams.get('checkin'), DATUMI.polazak);
    assert.equal(url.searchParams.get('checkout'), DATUMI.povratak);
    assert.equal(url.searchParams.get('group_adults'), '2');

    await carobnjak.korak3IzaberiPrvu();
    await carobnjak.korak3Dalje();

    // --- korak 4: satnica, prvi dan posle sletanja, ručak ---
    await carobnjak.cekajKorak(4);
    await carobnjak.korak4Cekaj();

    const dani = await plan.dani();
    assert.ok(dani.length >= 3, `Plan ima samo ${dani.length} dana`);

    for (const d of dani) {
      assert.ok(d.satnica, `Dan ${d.dan} nema satnicu`);
      assert.match(d.satnica, /\d{2}:\d{2}/);
    }

    // Prvi dan počinje POSLE sletanja - put od aerodroma je uračunat
    const sletanje = await plan.vremeSletanja();
    assert.ok(sletanje, 'Prvi dan ne prikazuje sletanje');

    const prvaAktivnost = (await plan.aktivnostiDana(dani[0].dan))[0];

    if (prvaAktivnost?.pocetak) {
      assert.ok(
        uMinute(prvaAktivnost.pocetak) > uMinute(sletanje),
        `Prva aktivnost (${prvaAktivnost.pocetak}) počinje pre sletanja (${sletanje})`
      );
    }

    // Ručak stoji u danu koji ima aktivnosti kroz podne
    const srednji = dani.find((d) => d.dan > 1 && d.dan < dani.length && d.aktivnosti >= 2);
    assert.ok(srednji, 'Nema srednjeg dana sa dovoljno aktivnosti');
    assert.equal(await plan.imaRucak(srednji.dan), true, `Dan ${srednji.dan} nema pauzu za ručak`);
  });

  // ---------------------------------------------------------------
  it('4. gost sačuva plan, prijavi se, i putovanje ima isti offerId i cenu', async function () {
    const carobnjak = new Carobnjak(drajver);
    const plan = new Plan(drajver);
    const prijava = new Prijava(drajver);
    const mojaPutovanja = new MojaPutovanja(drajver);

    // --- gost pravi plan ---
    await carobnjak.otvori(1);
    await carobnjak.korak1Popuni({ polazak: DATUMI.polazak, povratak: DATUMI.povratak, putnika: 2 });
    await carobnjak.korak1Dalje();

    await carobnjak.cekajKorak(2);
    const izabraniLet = await carobnjak.korak2IzaberiPrvu();
    await carobnjak.korak2Dalje();

    await carobnjak.cekajKorak(3);
    await carobnjak.korak3IzaberiPrvu();
    await carobnjak.korak3Dalje();

    await carobnjak.cekajKorak(4);
    await carobnjak.korak4Cekaj();

    const cenaUPlanu = await plan.cenaLeta();
    const offerIdUPlanu = await plan.offerIdLeta();

    assert.equal(offerIdUPlanu, izabraniLet, 'Plan prikazuje drugi let od izabranog');

    // --- „Sačuvaj" vodi na prijavu, pa se vraća na plan ---
    await carobnjak.korak4Sacuvaj();
    await carobnjak.cekajPutanju(/^\/prijava/);

    await prijava.popuniIPosalji(
      KONFIG.nalozi.korisnik.korisnickoIme,
      KONFIG.nalozi.korisnik.lozinka
    );

    // Posle prijave se vraća na korak 4 i čuva plan
    await carobnjak.cekajPutanju(/planiranje\/4/);
    await carobnjak.korak4Cekaj();

    const tripId = await carobnjak.korak4SacuvanId();
    assert.ok(tripId, 'Plan nije sačuvan posle prijave');
    zaBrisanje.push(tripId);

    // --- provera preko API-ja: isti offerId i ista cena ---
    const token = await api.korisnikToken();
    const sacuvano = await api.putovanje(token, tripId);

    assert.ok(sacuvano, 'Sačuvano putovanje se ne čita preko API-ja');

    const let_ = sacuvano.itinerary?.selectedFlight || sacuvano.itinerary?.flights?.[0];
    assert.equal(
      let_?.offerId,
      izabraniLet,
      'Sačuvano putovanje nosi drugi offerId od prikazanog plana'
    );

    const cenaSacuvana = Number(let_.priceEUR ?? let_.price);
    const cenaPrikazana = Number(String(cenaUPlanu).replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'));

    assert.ok(
      Math.abs(cenaSacuvana - cenaPrikazana) < 1,
      `Cena u planu (${cenaPrikazana}) i u sačuvanom putovanju (${cenaSacuvana}) se razlikuju`
    );

    // --- putovanje je u „Mojim putovanjima" ---
    await mojaPutovanja.otvori();
    const red = await mojaPutovanja.nadji(tripId);

    assert.ok(red, 'Sačuvano putovanje nije u listi');
    assert.equal(red.status, 'NACRT');
  });

  // ---------------------------------------------------------------
  it('5. osvežavanje stranice na koraku 3 zadržava parametre i izbor leta', async function () {
    const carobnjak = new Carobnjak(drajver);

    await carobnjak.otvori(1);
    await carobnjak.korak1Popuni({ polazak: DATUMI.polazak, povratak: DATUMI.povratak, putnika: 3 });
    await carobnjak.korak1Tempo('opusten');
    await carobnjak.korak1SamoInteresovanja(['priroda']);
    await carobnjak.korak1Dalje();

    await carobnjak.cekajKorak(2);
    const izabraniLet = await carobnjak.korak2IzaberiPrvu();
    await carobnjak.korak2Dalje();

    await carobnjak.cekajKorak(3);
    await carobnjak.korak3Cekaj();

    // --- osvežavanje ---
    await carobnjak.osvezi();

    await carobnjak.cekajKorak(3);
    await carobnjak.korak3Cekaj();

    // Parametri su preživeli: uvod koraka 3 nosi grad i broj gostiju
    const uvod = await carobnjak.tekst('korak3-uvod');
    assert.match(uvod, /Atina/i, `Uvod koraka 3 ne nosi odredište: „${uvod}"`);
    assert.match(uvod, /3\s+gost/i, `Uvod ne nosi broj gostiju: „${uvod}"`);

    // Izbor leta je preživeo - vidi se na koraku 2
    await carobnjak.otvori(2);
    await carobnjak.cekajKorak(2);

    assert.equal(
      await carobnjak.korak2Izabrana(),
      izabraniLet,
      'Izbor leta se izgubio posle osvežavanja'
    );

    // I preferencije sa koraka 1
    await carobnjak.otvori(1);
    await carobnjak.cekaj('korak1-forma');
    await carobnjak.korak1OtvoriPreferencije();

    assert.deepEqual(await carobnjak.korak1IzabranaInteresovanja(), ['priroda']);
    assert.equal(await carobnjak.vrednost('korak1-putnika'), '3');
  });
});
