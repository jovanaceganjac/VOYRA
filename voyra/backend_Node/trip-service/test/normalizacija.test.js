const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizuj, obliciZaPretragu, udaljenostKm } = require('../src/utils/normalizacija');
const AtrakcijeService = require('../src/services/AtrakcijeService');
const CityService = require('../src/services/CityService');

const { MAX_UDALJENOST_KM } = AtrakcijeService;
const gradovi = new CityService();

test('normalizacija naziva grada', async (t) => {
  await t.test('skida dijakritiku, pa „münch" i „munch" nalaze isti grad', () => {
    // To je ceo smisao normalizacije: korisnik ne mora da ukuca umlaut.
    assert.equal(normalizuj('München'), 'munchen');
    assert.equal(normalizuj('munch'), 'munch');
    assert.equal(normalizuj('MÜNCH'), 'munch');
  });

  await t.test('prevodi slova koja Unicode dekompozicija ne razlaze', () => {
    // NFD ne razlaze đ, ł, ø, ß, æ - bez posebne tabele bi ostala neprepoznata.
    assert.equal(normalizuj('Đakovica'), 'djakovica');
    assert.equal(normalizuj('Kraków'), 'krakow');
    assert.equal(normalizuj('Łódź'), 'lodz');
    assert.equal(normalizuj('Tromsø'), 'tromso');
    assert.equal(normalizuj('Aßlar'), 'asslar');
    assert.equal(normalizuj('Ærøskøbing'), 'aeroskobing');
  });

  await t.test('srpska latinica se svodi na osnovna slova', () => {
    // Nazivi gradova iz naseg spiska nose dijakritiku, a korisnik je cesto ne kuca.
    assert.equal(normalizuj('Čačak'), 'cacak');
    assert.equal(normalizuj('Šid'), 'sid');
    assert.equal(normalizuj('Žitište'), 'zitiste');
  });

  await t.test('turska bezdotna i velika I se svode na i', () => {
    // „İstanbul" i „Istanbul" moraju da nadju isti grad.
    assert.equal(normalizuj('İstanbul'), 'istanbul');
    assert.equal(normalizuj('Iğdır'), 'igdir');
  });

  await t.test('interpunkcija postaje razmak, a visak razmaka se skida', () => {
    // „Frankfurt am Main" i „Frankfurt-am-Main" su isti grad.
    assert.equal(normalizuj('Frankfurt am Main'), 'frankfurt am main');
    assert.equal(normalizuj('  Frankfurt--am/Main  '), 'frankfurt am main');
    assert.equal(normalizuj("Val-d'Oise"), 'val d oise');
  });

  await t.test('cifre se cuvaju', () => {
    // Postoje nazivi sa brojem; brisanje cifara bi ih spojilo u isti oblik.
    assert.equal(normalizuj('Sector 7'), 'sector 7');
  });

  await t.test('prazna vrednost daje praznu nisku, ne gresku', () => {
    // Grad bez srpskog naziva ulazi u istu funkciju.
    assert.equal(normalizuj(null), '');
    assert.equal(normalizuj(undefined), '');
    assert.equal(normalizuj('   '), '');
  });

  await t.test('cirilica se svodi na prazno, jer nije latinica', () => {
    // Nazivi u bazi su latinicom; cirilican unos se ne nalazi i to je poznato ogranicenje.
    assert.equal(normalizuj('Београд'), '');
  });
});

test('oblici pod kojima se grad pronalazi', async (t) => {
  await t.test('uz ceo naziv pamti i prvu rec', () => {
    // Korisnik retko kuca ceo zvanican naziv; „frankfurt" mora da nadje grad.
    const o = obliciZaPretragu(['Frankfurt am Main']);

    assert.ok(o.includes('frankfurt am main'));
    assert.ok(o.includes('frankfurt'));
  });

  await t.test('kratka prva rec se ne pamti posebno', () => {
    // „La" ili „Le" bi kao oblik pogodilo stotine gradova.
    const o = obliciZaPretragu(['La Rochelle']);

    assert.equal(o.includes('la'), false);
    assert.ok(o.includes('la rochelle'));
  });

  await t.test('svi nazivi grada ulaze u isti spisak', () => {
    // Grad ima srpski, lokalni i engleski naziv; svaki mora da ga nadje.
    const o = obliciZaPretragu(['Minhen', 'München', 'Munich']);

    assert.ok(o.includes('minhen'));
    assert.ok(o.includes('munchen'));
    assert.ok(o.includes('munich'));
  });

  await t.test('isti oblik se ne ponavlja', () => {
    // Lista ide u indeks; duplikati bi ga bez potrebe uvecali.
    assert.deepEqual(obliciZaPretragu(['Bled', 'Bled', 'bled']), ['bled']);
  });

  await t.test('prazni nazivi se preskacu', () => {
    // Grad bez srpskog naziva dolazi sa `null` u spisku.
    assert.deepEqual(obliciZaPretragu(['Bled', null, '', undefined]), ['bled']);
  });
});

test('Haversine udaljenost', async (t) => {
  const BEOGRAD = { lat: 44.7866, lon: 20.4489 };
  const ATINA = { lat: 37.98376, lon: 23.72784 };

  await t.test('ista tacka je nula kilometara', () => {
    // Osnovni slucaj; sluzi i kao provera da formula ne daje NaN.
    assert.equal(udaljenostKm(BEOGRAD, BEOGRAD), 0);
  });

  await t.test('Beograd — Atina je oko 800 km', () => {
    // Poznata vrednost; veliki pomak bi znacio gresku u pretvaranju u radijane.
    const d = udaljenostKm(BEOGRAD, ATINA);

    assert.ok(d > 780 && d < 820, `dobijeno ${d.toFixed(1)} km`);
  });

  await t.test('rastojanje je simetricno', () => {
    // Formula ne sme da zavisi od redosleda tacaka.
    assert.equal(udaljenostKm(BEOGRAD, ATINA), udaljenostKm(ATINA, BEOGRAD));
  });

  await t.test('jedan stepen geografske sirine je oko 111 km', () => {
    // Nezavisna provera skale: meridijanski stepen je poznata vrednost.
    const d = udaljenostKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });

    assert.ok(d > 110 && d < 112, `dobijeno ${d.toFixed(2)} km`);
  });

  await t.test('stepen duzine se skuplja prema polu', () => {
    // Kosinus geografske sirine mora da ulazi u formulu, inace su severni gradovi predaleko.
    const naEkvatoru = udaljenostKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const naSezdesetom = udaljenostKm({ lat: 60, lon: 0 }, { lat: 60, lon: 1 });

    assert.ok(naSezdesetom < naEkvatoru * 0.55, `${naSezdesetom.toFixed(1)} vs ${naEkvatoru.toFixed(1)}`);
  });

  await t.test('radi i preko nulte meridijane', () => {
    // London je s obe strane nule; naivna razlika bi dala pogresan znak.
    const d = udaljenostKm({ lat: 51.5, lon: -0.2 }, { lat: 51.5, lon: 0.2 });

    assert.ok(d > 25 && d < 30, `dobijeno ${d.toFixed(1)} km`);
  });
});

test('granica od 50 km za atrakciju administratora (spec §4.5)', async (t) => {
  const ATINA = { lat: 37.98376, lon: 23.72784 };
  const PARIZ = { lat: 48.85341, lon: 2.3488 };
  const BLED = { lat: 46.3683, lon: 14.1146 };

  await t.test('granica je 50 km', () => {
    // Namerno siroka, da u opseg ulaze mesta koja se obilaze iz grada.
    assert.equal(MAX_UDALJENOST_KM, 50);
  });

  await t.test('centar grada prolazi', () => {
    // Forma nudi „preuzmi koordinate centra grada"; taj unos mora da prodje.
    assert.ok(udaljenostKm(ATINA, ATINA) <= MAX_UDALJENOST_KM);
  });

  await t.test('mesta iz obrazlozenja granice zaista prolaze', () => {
    // Dafni, Versaj i Vintgar su primeri navedeni u kodu; oni su i merilo granice.
    const dafni = { lat: 38.0119, lon: 23.6367 };
    const versaj = { lat: 48.8049, lon: 2.1204 };
    const vintgar = { lat: 46.3897, lon: 14.0906 };

    assert.ok(udaljenostKm(ATINA, dafni) < MAX_UDALJENOST_KM);
    assert.ok(udaljenostKm(PARIZ, versaj) < MAX_UDALJENOST_KM);
    assert.ok(udaljenostKm(BLED, vintgar) < MAX_UDALJENOST_KM);
  });

  await t.test('drugi grad pada van granice', () => {
    // Najcesca greska administratora: izabran pogresan grad uz tacne koordinate.
    assert.ok(udaljenostKm(ATINA, PARIZ) > MAX_UDALJENOST_KM);
  });

  await t.test('atrakcija na 60 km pada, na 40 km prolazi', () => {
    // Provera same granice, bez zavisnosti od stvarnih mesta.
    const naSeverKm = (km) => ({ lat: ATINA.lat + km / 111.2, lon: ATINA.lon });

    assert.ok(udaljenostKm(ATINA, naSeverKm(40)) < MAX_UDALJENOST_KM);
    assert.ok(udaljenostKm(ATINA, naSeverKm(60)) > MAX_UDALJENOST_KM);
  });
});

test('rangiranje rezultata pretrage gradova', async (t) => {
  const grad = (izmene) => ({
    stanovnika: 100000,
    pretragaGlavna: [],
    pretraga: [],
    ...izmene
  });

  await t.test('tacno poklapanje glavnog naziva je najbolje', () => {
    // Skala je 4/3/2/1: tacno, prefiks, alternativno tacno, alternativno po prefiksu.
    assert.equal(gradovi._ocena(grad({ pretragaGlavna: ['minhen'] }), 'minhen'), 4);
  });

  await t.test('prefiks glavnog naziva je iznad alternativnog naziva', () => {
    // Kucanje „minh" treba da vodi Minhenu, ne gradu cija alternativa je „minh...".
    assert.equal(gradovi._ocena(grad({ pretragaGlavna: ['minhen'] }), 'minh'), 3);
    assert.equal(gradovi._ocena(grad({ pretraga: ['minhen'] }), 'minhen'), 2);
    assert.equal(gradovi._ocena(grad({ pretraga: ['minhen'] }), 'minh'), 1);
  });

  await t.test('bez poklapanja ocena je nula', () => {
    // Takav grad ne treba da se pojavi u rezultatu.
    assert.equal(gradovi._ocena(grad({ pretraga: ['atina'] }), 'minh'), 0);
  });

  await t.test('„minh" vodi Minhenu, ne Münchensteinu', () => {
    // Ovo je primer iz koda: veliki grad sa slabijim poklapanjem mora da pretekne mali sa tacnim.
    const minhen = grad({
      stanovnika: 1500000,
      pretragaGlavna: ['minhen'],
      pretraga: ['minhen', 'munchen', 'munich']
    });

    const munchenstein = grad({
      stanovnika: 12000,
      pretragaGlavna: ['munchenstein'],
      pretraga: ['munchenstein']
    });

    assert.ok(
      gradovi._rang(minhen, 'minh') > gradovi._rang(munchenstein, 'minh'),
      'Münchenstein je pretekao Minhen'
    );
  });

  await t.test('kod istog poklapanja veci grad ide prvi', () => {
    // Korisnik gotovo uvek trazi veci grad istog imena.
    const veliki = grad({ stanovnika: 1000000, pretragaGlavna: ['pariz'] });
    const mali = grad({ stanovnika: 5000, pretragaGlavna: ['pariz'] });

    assert.ok(gradovi._rang(veliki, 'pariz') > gradovi._rang(mali, 'pariz'));
  });

  await t.test('grad sto puta veci dobija oko 3 boda — koliko vredi i bolje poklapanje', () => {
    // To je mera iz koda: zato veliki grad sa slabijim poklapanjem moze da pretekne
    // mali sa tacnim, ali samo kada je razlika u velicini bar toliko velika.
    const doprinos = (stanovnika) => gradovi._rang(grad({ stanovnika, pretragaGlavna: ['x'] }), 'x');

    assert.ok(Math.abs(doprinos(3000000) - doprinos(30000) - 3) < 0.01);
  });

  await t.test('svaki kandidat ima ocenu bar 1, pa velicina ne odlucuje sama', () => {
    // Upit trazi `pretraga` usidren na pocetak, pa grad koji se nikako ne poklapa
    // nikada nije kandidat. Ocena 0 postoji u funkciji, ali se u pretrazi ne pojavi.
    const poPrefiksu = grad({ pretraga: ['istanbul', 'carigrad'] });

    assert.ok(gradovi._ocena(poPrefiksu, 'ist') >= 1);
    assert.ok(gradovi._ocena(poPrefiksu, 'cari') >= 1);
    assert.equal(gradovi._ocena(poPrefiksu, 'bled'), 0);
  });

  await t.test('grad bez podatka o stanovnicima ne kvari racun', () => {
    // `log10(0)` bi bio -Infinity; kod uzima najmanje 1000 stanovnika.
    const r = gradovi._rang(grad({ stanovnika: 0, pretragaGlavna: ['bled'] }), 'bled');

    assert.ok(Number.isFinite(r), `dobijeno ${r}`);
  });
});

test('povezivanje aerodroma sa gradom po opstini', async (t) => {
  const spisak = [
    { pretraga: ['pariz', 'paris'] },
    { pretraga: ['istanbul'] },
    { pretraga: ['roissy en france'] }
  ];

  await t.test('opstina sa dodatkom u zagradi se razlaze na delove', () => {
    // OurAirports daje „Paris (Roissy-en-France, Val-d'Oise)".
    const g = gradovi._poOpstini(spisak, "Paris (Roissy-en-France, Val-d'Oise)");

    assert.deepEqual(g.pretraga, ['pariz', 'paris']);
  });

  await t.test('opstina iza zareza se takodje proba', () => {
    // „Pendik, Istanbul" - grad je u drugom delu.
    assert.deepEqual(gradovi._poOpstini(spisak, 'Pendik, Istanbul').pretraga, ['istanbul']);
  });

  await t.test('kratki delovi se preskacu', () => {
    // Delovi krace od tri znaka bi pogodili slucajan grad.
    assert.equal(gradovi._poOpstini(spisak, 'AB, CD'), null);
  });

  await t.test('bez opstine i bez poklapanja vraca null', () => {
    // Aerodrom tada ostaje bez grada i vezuje se po udaljenosti.
    assert.equal(gradovi._poOpstini(spisak, null), null);
    assert.equal(gradovi._poOpstini(spisak, 'Nepoznato Mesto'), null);
  });
});

test('escape korisnickog unosa za regularni izraz', async (t) => {
  await t.test('posebni znakovi se neutralisu', () => {
    // Unos ide u `RegExp`; bez toga bi „(" oborio upit greskom.
    assert.equal(gradovi._escape('a(b)c'), 'a\\(b\\)c');
    assert.equal(gradovi._escape('a.b*c+'), 'a\\.b\\*c\\+');
  });

  await t.test('obican tekst ostaje nepromenjen', () => {
    // Normalan unos ne treba da se izmeni.
    assert.equal(gradovi._escape('beograd'), 'beograd');
  });
});
