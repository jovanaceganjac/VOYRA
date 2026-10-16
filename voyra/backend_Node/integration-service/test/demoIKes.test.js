const test = require('node:test');
const assert = require('node:assert/strict');

const { demoLetovi, demoSmestaj, seme, minutiIzKm } = require('../src/utils/demoGenerator');
const { ponudeSuUpotrebljive, jeTacno, MIN_PREOSTALO_MS } = require('../src/utils/ponude');

const BEOGRAD = { lat: 44.7866, lon: 20.4489 };
const ATINA = { lat: 37.98376, lon: 23.72784 };

const upit = (izmene = {}) => ({
  from: 'BEG',
  to: 'ATH',
  checkIn: '2026-11-10',
  checkOut: '2026-11-15',
  passengers: 2,
  odKoordinate: BEOGRAD,
  doKoordinate: ATINA,
  ...izmene
});

test('deterministicno seme', async (t) => {
  await t.test('isti tekst daje isti niz brojeva', () => {
    // Bez toga bi se plan menjao izmedju dva otvaranja istog putovanja.
    const a = seme('BEG-ATH-2026-11-10');
    const b = seme('BEG-ATH-2026-11-10');

    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  });

  await t.test('razlicit tekst daje razlicit niz', () => {
    // Inace bi sve rute imale iste cene i ista vremena poletanja.
    assert.notEqual(seme('BEG-ATH')(), seme('BEG-CDG')());
  });

  await t.test('brojevi su u opsegu [0, 1)', () => {
    // Koriste se za pomeraje i mnozioce; vrednost van opsega bi dala besmislene cene.
    const r = seme('proba');

    for (let i = 0; i < 50; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `dobijeno ${v}`);
    }
  });
});

test('demo letovi (bez ijednog kljuca)', async (t) => {
  /** Rok vazenja se racuna od trenutka poziva, pa se iz poredjenja izuzima. */
  const bezRoka = (letovi) => letovi.map(({ expiresAt, ...ostalo }) => ostalo);

  await t.test('isti upit uvek daje isti izlaz', () => {
    // Korisnik koji ponovo otvori sacuvano putovanje mora da vidi istu ponudu.
    assert.deepEqual(bezRoka(demoLetovi(upit())), bezRoka(demoLetovi(upit())));
  });

  await t.test('jedino rok vazenja zavisi od trenutka poziva', () => {
    // Demo ponuda mora da ima rok kao i prava, inace se tok rezervacije ne bi mogao proci.
    const a = demoLetovi(upit());
    const b = demoLetovi(upit());

    for (let i = 0; i < a.length; i++) {
      assert.ok(new Date(a[i].expiresAt).getTime() > Date.now(), 'rok nije u buducnosti');
      assert.equal(a[i].offerId, b[i].offerId);
    }
  });

  await t.test('kompanija je „Demo Air", da se ne pomesa sa pravom ponudom', () => {
    // Na odbrani mora da bude jasno koje su ponude izmisljene.
    for (const l of demoLetovi(upit())) assert.equal(l.airline, 'Demo Air');
  });

  await t.test('oznaka ponude kaze da je demo i nosi ceo upit', () => {
    // Ruta polju `source` dodaje „mock"; sama oznaka ponude je drugi, nezavisan znak.
    for (const l of demoLetovi(upit())) {
      assert.match(l.offerId, /^off_demo_/);
      assert.match(l.offerId, /BEGATH_2026-11-10_2026-11-15/);
    }
  });

  await t.test('daje najmanje tri ponude, da rangiranje ima sta da radi', () => {
    // Sa jednom ponudom se ne vidi ni rangiranje ni izbor leta u carobnjaku.
    assert.ok(demoLetovi(upit()).length >= 3);
  });

  await t.test('ponude su sortirane po ceni', () => {
    // Prva ponuda je najjeftinija, kao i kod pravog izvora.
    const cene = demoLetovi(upit()).map((l) => l.price);

    assert.deepEqual(cene, [...cene].sort((a, b) => a - b));
  });

  await t.test('duza ruta je skuplja i duze traje', () => {
    // Cena i trajanje se racunaju iz udaljenosti, pa moraju da rastu sa njom.
    const kratka = demoLetovi(upit());
    const duga = demoLetovi(upit({ to: 'LIS', doKoordinate: { lat: 38.7223, lon: -9.1393 } }));

    assert.ok(duga[0].price > kratka[0].price, `${duga[0].price} vs ${kratka[0].price}`);
    assert.ok(duga[0].duration > kratka[0].duration);
  });

  await t.test('drugi datum daje drugu ponudu', () => {
    // Datum ulazi u seme, pa dve pretrage istog grada nisu istovetne.
    assert.notDeepEqual(demoLetovi(upit()), demoLetovi(upit({ checkIn: '2026-12-01' })));
  });

  await t.test('radi i bez koordinata, sa srednjom evropskom rutom', () => {
    // Generator se koristi i u probama gde koordinate ne stizu.
    const l = demoLetovi(upit({ odKoordinate: null, doKoordinate: null }));

    assert.ok(l.length >= 3);
    assert.ok(l[0].price > 0);
    assert.ok(l[0].duration > 0);
  });

  await t.test('trajanje iz udaljenosti nosi i reziju poletanja i sletanja', () => {
    // Cisto vreme krstarenja bi bilo krace od stvarnog trajanja leta.
    assert.ok(minutiIzKm(800) > (800 / 800) * 60, 'nema rezije');
    assert.ok(minutiIzKm(1600) > minutiIzKm(800));
  });
});

test('demo smestaj', async (t) => {
  const smestaj = (izmene = {}) =>
    demoSmestaj({ city: 'Atina', lat: ATINA.lat, lon: ATINA.lon, checkIn: '2026-11-10', checkOut: '2026-11-15', guests: 2, ...izmene });

  await t.test('isti upit uvek daje isti izlaz', () => {
    // Ista ponuda pri ponovnom otvaranju plana.
    assert.deepEqual(smestaj(), smestaj());
  });

  await t.test('naziv kaze da je demo i za koji grad', () => {
    // Na odbrani se odmah vidi da ponuda nije iz pravog izvora.
    for (const s of smestaj()) {
      assert.match(s.name, /^Demo smeštaj/);
      assert.match(s.name, /Atina/);
    }
  });

  await t.test('ponude su rasute oko centra grada', () => {
    // Plan racuna rutu od smestaja; sve na istoj tacki bi dalo nerealnu rutu.
    const koordinate = smestaj().map((s) => `${s.lat},${s.lon}`);

    assert.equal(new Set(koordinate).size, koordinate.length);
  });

  await t.test('bez koordinata grada smestaj ostaje bez koordinata', () => {
    // Bolje prazno polje nego izmisljena tacka na nultom meridijanu.
    for (const s of smestaj({ lat: null, lon: null })) {
      assert.equal(s.lat, null);
      assert.equal(s.lon, null);
    }
  });

  await t.test('drugi grad daje druge cene', () => {
    // Grad ulazi u seme.
    assert.notDeepEqual(smestaj().map((s) => s.price), smestaj({ city: 'Porto' }).map((s) => s.price));
  });

  await t.test('ponude su sortirane po ceni', () => {
    // Isti redosled kao kod pravog izvora.
    const cene = smestaj().map((s) => s.price);

    assert.deepEqual(cene, [...cene].sort((a, b) => a - b));
  });
});

test('pravilo kesa: ponuda koja istice za manje od dva minuta se ne koristi', async (t) => {
  const zaMinuta = (m) => new Date(Date.now() + m * 60_000).toISOString();

  await t.test('granica je dva minuta', () => {
    // Dok korisnik prodje kroz proveru cene i unos putnika, kraca ponuda vec nestane.
    assert.equal(MIN_PREOSTALO_MS, 120_000);
  });

  await t.test('ponuda koja vazi jos deset minuta se koristi', () => {
    // Osnovni slucaj upotrebljivog zapisa iz kesa.
    assert.equal(ponudeSuUpotrebljive([{ expiresAt: zaMinuta(10) }]), true);
  });

  await t.test('ponuda koja istice za jedan minut cini zapis neupotrebljivim', () => {
    // Zapis se odbacuje i radi se nova pretraga.
    assert.equal(ponudeSuUpotrebljive([{ expiresAt: zaMinuta(1) }]), false);
  });

  await t.test('istekla ponuda cini zapis neupotrebljivim', () => {
    // Inace bi korisnik dobio ponudu koju izvor vise ne poznaje.
    assert.equal(ponudeSuUpotrebljive([{ expiresAt: zaMinuta(-5) }]), false);
  });

  await t.test('dovoljna je JEDNA kratka ponuda da se ceo zapis odbaci', () => {
    // Kes cuva celu listu; delimicno vazeca lista bi korisniku nudila mrtve ponude.
    assert.equal(ponudeSuUpotrebljive([{ expiresAt: zaMinuta(20) }, { expiresAt: zaMinuta(1) }]), false);
  });

  await t.test('ponuda bez roka se racuna kao vazeca', () => {
    // Demo podaci ne moraju da imaju rok; odbacivanje bi ih ucinilo neupotrebljivim.
    assert.equal(ponudeSuUpotrebljive([{ id: 'demo' }]), true);
  });

  await t.test('neispravan rok se racuna kao vazeci', () => {
    // Bolje pustiti izvor da odbije ponudu nego odbaciti ceo kes zbog lose niske.
    assert.equal(ponudeSuUpotrebljive([{ expiresAt: 'juce' }]), true);
  });

  await t.test('prazna lista i lista koja nije lista su upotrebljive', () => {
    // Kes za atrakcije i kurseve ne cuva ponude; pravilo se na njih ne odnosi.
    assert.equal(ponudeSuUpotrebljive([]), true);
    assert.equal(ponudeSuUpotrebljive(null), true);
    assert.equal(ponudeSuUpotrebljive(undefined), true);
  });
});

test('citanje logicke vrednosti iz upita', async (t) => {
  await t.test('„true" u upitu znaci tacno', () => {
    // Parametri upita su niske; `Boolean('false')` bi bio tacan, pa se poredi tekst.
    assert.equal(jeTacno('true'), true);
    assert.equal(jeTacno('TRUE'), true);
    assert.equal(jeTacno(true), true);
  });

  await t.test('sve ostalo je netacno', () => {
    // Osvezavanje kesa se pali samo izricito.
    assert.equal(jeTacno('false'), false);
    assert.equal(jeTacno('1'), false);
    assert.equal(jeTacno(undefined), false);
    assert.equal(jeTacno(null), false);
  });
});
