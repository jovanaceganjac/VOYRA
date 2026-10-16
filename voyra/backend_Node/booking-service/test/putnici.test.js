const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validirajPutnike,
  godineNa,
  TITULE,
  POLOVI,
  MAX_IME_PREZIME
} = require('../src/utils/putniciValidator');

/**
 * Pravila su iz zvanicne Duffel dokumentacije („Create an order", polja
 * `passengers.*`). Vazna posledica: srpska slova (č, ć, ž, š, đ) SU u
 * Latin Extended-A, pa su dozvoljena; cirilica nije.
 */

const putnik = (izmene = {}) => ({
  title: 'ms',
  givenName: 'Jovana',
  familyName: 'Ceganjac',
  gender: 'f',
  bornOn: '1999-05-20',
  email: 'jovana@primer.test',
  phoneNumber: '+381641234567',
  ...izmene
});

/** Datum povratka u buducnosti - punoletnost se racuna na taj dan. */
const POVRATAK = '2026-12-01';

const greske = (putnici, p = {}) => validirajPutnike(putnici, { datumPovratka: POVRATAK, ...p });
const jedan = (izmene, p) => greske([putnik(izmene)], p);

test('validacija putnika — osnovni slucaj', async (t) => {
  await t.test('ispravan putnik ne daje nijednu gresku', () => {
    // Pozitivan slucaj mora da prodje pre svih provera, inace testovi nista ne znace.
    assert.deepEqual(jedan(), []);
  });

  await t.test('prazna lista putnika se odbija', () => {
    // Bez putnika Duffel ne moze da kreira rezervaciju.
    assert.deepEqual(greske([]), ['Obavezni su podaci o putnicima']);
    assert.deepEqual(greske(null), ['Obavezni su podaci o putnicima']);
    assert.deepEqual(greske('Jovana'), ['Obavezni su podaci o putnicima']);
  });

  await t.test('vraca SVE greske odjednom, ne prvu', () => {
    // Korisnik popunjava formu jednom; poruka po poruku bi znacila vise pokusaja.
    const g = greske([{ givenName: 'A' }]);

    assert.ok(g.length >= 5, `ocekivano najmanje 5 gresaka, dobijeno ${g.length}`);
  });

  await t.test('greska nosi broj putnika na koga se odnosi', () => {
    // Sa vise putnika bez oznake se ne zna cije polje treba ispraviti.
    const g = greske([putnik(), putnik({ email: 'nije-email' })]);

    assert.equal(g.length, 1);
    assert.match(g[0], /^Putnik 2:/);
  });

  await t.test('prihvata i snake_case nazive polja', () => {
    // Duffel koristi `given_name`; frontend `givenName`. Oba oblika moraju da rade.
    const duffelStil = {
      title: 'mr',
      given_name: 'Marko',
      family_name: 'Markovic',
      gender: 'm',
      born_on: '1990-01-01',
      email: 'marko@primer.test',
      phone_number: '+381641234567'
    };

    assert.deepEqual(greske([duffelStil]), []);
  });
});

test('broj putnika mora da odgovara putovanju', async (t) => {
  await t.test('manje putnika od trazenog se odbija', () => {
    // Let je pretrazen za 3 putnika; rezervacija za 2 bi imala drugu cenu.
    const g = greske([putnik(), putnik()], { brojPutnika: 3 });

    assert.equal(g.length, 1);
    assert.match(g[0], /ima 3 putnika, a poslato je 2/);
  });

  await t.test('vise putnika od trazenog se odbija', () => {
    // Isti razlog u drugom smeru.
    assert.match(greske([putnik(), putnik()], { brojPutnika: 1 }).join(' '), /ima 1 putnika, a poslato je 2/);
  });

  await t.test('bez zadatog broja putnika provera se preskace', () => {
    // Sacuvano putovanje ne mora da nosi broj putnika.
    assert.deepEqual(greske([putnik()], { brojPutnika: undefined }), []);
  });
});

test('titula i pol', async (t) => {
  await t.test('prihvata svaku titulu koju Duffel navodi', () => {
    // Spisak je iz dokumentacije; svaka vrednost iz njega mora da prodje.
    for (const titula of TITULE) assert.deepEqual(jedan({ title: titula }), [], `pala ${titula}`);
  });

  await t.test('velicina slova u tituli se ne racuna', () => {
    // Frontend moze da posalje „Mr"; Duffel prima mala slova.
    assert.deepEqual(jedan({ title: 'MR' }), []);
  });

  await t.test('nepostojeca titula se odbija i navede dozvoljene', () => {
    // Korisnik iz poruke mora da vidi spisak, jer ga forma ne mora prikazati.
    const g = jedan({ title: 'gospodin' }).join(' ');

    assert.match(g, /titula mora biti jedna od/);
    assert.match(g, /miss/);
  });

  await t.test('titula je obavezna', () => {
    // Duffel je zahteva; bez nje kreiranje pada na strani izvora.
    assert.match(jedan({ title: '' }).join(' '), /titula je obavezna/);
  });

  await t.test('pol prihvata samo m i f', () => {
    // Duffel dozvoljava samo te dve vrednosti.
    for (const pol of POLOVI) assert.deepEqual(jedan({ gender: pol }), []);
    assert.match(jedan({ gender: 'x' }).join(' '), /pol mora biti "m" ili "f"/);
  });

  await t.test('pol nema podrazumevanu vrednost', () => {
    // Pogresan pol na karti je stvaran problem na aerodromu, pa se ne pretpostavlja.
    assert.match(jedan({ gender: '' }).join(' '), /pol je obavezan/);
  });
});

test('ime i prezime — dozvoljeni znakovi', async (t) => {
  await t.test('srpska latinica sa dijakritikom prolazi', () => {
    // Slova č, ć, ž, š, đ su u Latin Extended-A, koji Duffel prihvata.
    assert.deepEqual(jedan({ givenName: 'Đorđe', familyName: 'Čačić' }), []);
    assert.deepEqual(jedan({ givenName: 'Željko', familyName: 'Šuša' }), []);
  });

  await t.test('cirilica se odbija', () => {
    // Nije u dozvoljenim skupovima; ime u pasosu je latinicom.
    const g = jedan({ givenName: 'Јована' }).join(' ');

    assert.match(g, /unesite latinicom/);
  });

  await t.test('poruka trazi latinicu, a ne „bez dijakritike"', () => {
    // Poruka „uklonite dijakritiku" bila bi neistinita, jer je dijakritika dozvoljena.
    assert.equal(jedan({ givenName: 'Јована' }).join(' ').includes('dijakriti'), false);
  });

  await t.test('razmak, crtica i apostrof su dozvoljeni', () => {
    // Prezimena kao O'Brien i Anne-Marie moraju da prodju.
    assert.deepEqual(jedan({ givenName: 'Anne-Marie', familyName: "O'Brien" }), []);
    assert.deepEqual(jedan({ familyName: 'van der Berg' }), []);
  });

  await t.test('cifre i posebni znakovi se odbijaju', () => {
    // Ime sa cifrom ili znakom nije ime iz pasosa.
    assert.match(jedan({ givenName: 'Jovana2' }).join(' '), /unesite latinicom/);
    assert.match(jedan({ familyName: 'Ceganjac!' }).join(' '), /unesite latinicom/);
  });

  await t.test('izuzeci koje Duffel navodi se odbijaju iako su u Latin skupovima', () => {
    // Æ, æ, Ĳ, ĳ, Œ, œ, Þ i ð su izuzeti u dokumentaciji, pa opsezna provera nije dovoljna.
    for (const znak of ['Æ', 'æ', 'Ĳ', 'ĳ', 'Œ', 'œ', 'Þ', 'ð']) {
      assert.match(jedan({ givenName: `Ja${znak}na` }).join(' '), /unesite latinicom/, `prosao ${znak}`);
    }
  });

  await t.test('ime i prezime su obavezni', () => {
    // Bez njih karta ne moze da se izda.
    assert.match(jedan({ givenName: '' }).join(' '), /ime je obavezno/);
    assert.match(jedan({ familyName: '   ' }).join(' '), /prezime je obavezno/);
  });

  await t.test('jedno slovo je prekratko', () => {
    // Duffel preporucuje najmanje dva znaka po delu imena.
    assert.match(jedan({ givenName: 'J' }).join(' '), /bar 2 znaka/);
  });

  await t.test(`ime i prezime zajedno smeju imati ${MAX_IME_PREZIME} znakova`, () => {
    // Granica je Duffel-ova i vazi za zbir, ne za pojedinacna polja.
    const ime = 'A'.repeat(20);
    const prezime = 'B'.repeat(20);

    assert.deepEqual(jedan({ givenName: ime, familyName: prezime }), []);
    assert.match(
      jedan({ givenName: ime, familyName: `${prezime}C` }).join(' '),
      /zajedno smeju imati najviše 40/
    );
  });
});

test('datum rodjenja i punoletnost', async (t) => {
  await t.test('datum rodjenja je obavezan', () => {
    // Duffel ga zahteva za svakog putnika.
    assert.match(jedan({ bornOn: '' }).join(' '), /datum rođenja je obavezan/);
  });

  await t.test('trazi oblik GGGG-MM-DD', () => {
    // Drugi oblici se razlicito tumace po lokalizaciji, pa se odbijaju.
    assert.match(jedan({ bornOn: '20.05.1999' }).join(' '), /oblika GGGG-MM-DD/);
    assert.match(jedan({ bornOn: '1999-13-45' }).join(' '), /oblika GGGG-MM-DD/);
  });

  await t.test('datum rodjenja u buducnosti se odbija', () => {
    // Ocigledna greska u unosu, a Duffel bi vratio nejasnu poruku.
    const sutra = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    assert.match(jedan({ bornOn: sutra }).join(' '), /mora biti u prošlosti/);
  });

  await t.test('maloletnik se odbija sa objasnjenjem', () => {
    // Pretraga je radjena za odrasle putnike (`type: adult`), pa cena i pravila ne odgovaraju.
    const g = jedan({ bornOn: '2015-01-01' }).join(' ');

    assert.match(g, /rezervacija dece nije podržana/);
    assert.match(g, /odrasle putnike/);
  });

  await t.test('punoletnost se racuna na dan POVRATKA, ne na danas', () => {
    // Putnik koji puni 18 u toku putovanja se vraca kao odrasla osoba.
    const punoletanNaPovratku = `${Number(POVRATAK.slice(0, 4)) - 18}-11-30`;

    assert.deepEqual(jedan({ bornOn: punoletanNaPovratku }), []);
  });

  await t.test('bez datuma povratka punoletnost se ne proverava', () => {
    // Nema na koji dan da se izracuna; proveru radi izvor.
    assert.deepEqual(validirajPutnike([putnik({ bornOn: '2015-01-01' })], {}), []);
  });

  await t.test('godineNa racuna tacno i na sam rodjendan', () => {
    // Off-by-one na rodjendanu bi maloletnika pustio ili punoletnog odbio.
    assert.equal(godineNa('2008-06-15', '2026-06-15'), 18);
    assert.equal(godineNa('2008-06-15', '2026-06-14'), 17);
    assert.equal(godineNa('2008-06-15', '2026-06-16'), 18);
  });

  await t.test('godineNa vraca null za neispravan datum', () => {
    // Pozivalac tada preskace proveru umesto da poredi NaN.
    assert.equal(godineNa('juce', '2026-06-15'), null);
    assert.equal(godineNa('2008-06-15', 'nikad'), null);
  });
});

test('email i telefon putnika', async (t) => {
  await t.test('email je obavezan i mora imati oblik adrese', () => {
    // Na tu adresu stize potvrda rezervacije.
    assert.match(jedan({ email: '' }).join(' '), /email je obavezan/);
    assert.match(jedan({ email: 'jovana@' }).join(' '), /email nije ispravan/);
    assert.match(jedan({ email: 'jovana primer.test' }).join(' '), /email nije ispravan/);
  });

  await t.test('telefon mora biti u E.164 obliku', () => {
    // Duffel prima samo taj oblik; poruka nosi primer.
    assert.deepEqual(jedan({ phoneNumber: '+381641234567' }), []);
    assert.match(jedan({ phoneNumber: '0641234567' }).join(' '), /\+381641234567/);
    assert.match(jedan({ phoneNumber: '' }).join(' '), /telefon je obavezan/);
  });

  await t.test('pozivni broj ne moze poceti nulom', () => {
    // E.164 ne dozvoljava vodecu nulu u pozivnom broju.
    assert.match(jedan({ phoneNumber: '+0381641234567' }).join(' '), /\+381641234567/);
  });
});
