const test = require('node:test');
const assert = require('node:assert/strict');

const Trip = require('../src/models/Trip');
const DestinacijeService = require('../src/services/DestinacijeService');

const { STATUSI, PRELAZI, jeDozvoljenPrelaz } = Trip;
const { PROZOR_DANA, TEZINA_SACUVANIH, MIN_PRETRAGA } = DestinacijeService;

const destinacije = new DestinacijeService();

test('prelazi statusa putovanja (spec §4.9)', async (t) => {
  await t.test('nacrt se rezervise ili otkazuje', () => {
    // To su dve stvari koje korisnik moze da uradi sa sacuvanim planom.
    assert.equal(jeDozvoljenPrelaz('NACRT', 'REZERVISANO'), true);
    assert.equal(jeDozvoljenPrelaz('NACRT', 'OTKAZANO'), true);
  });

  await t.test('rezervisano se otkazuje ili zavrsava', () => {
    // Zavrsavanje radi pozadinski posao kada prodje datum povratka.
    assert.equal(jeDozvoljenPrelaz('REZERVISANO', 'OTKAZANO'), true);
    assert.equal(jeDozvoljenPrelaz('REZERVISANO', 'ZAVRSENO'), true);
  });

  await t.test('nacrt ne moze pravo u zavrseno', () => {
    // Putovanje koje nije rezervisano nije ni obavljeno.
    assert.equal(jeDozvoljenPrelaz('NACRT', 'ZAVRSENO'), false);
  });

  await t.test('otkazano i zavrseno su konacna stanja', () => {
    // Bez toga bi se otkazano putovanje vratilo u REZERVISANO iako let vise nije rezervisan.
    for (const konacno of ['OTKAZANO', 'ZAVRSENO']) {
      for (const cilj of STATUSI) {
        assert.equal(jeDozvoljenPrelaz(konacno, cilj), false, `prosao ${konacno} -> ${cilj}`);
      }
    }
  });

  await t.test('nijedan status ne moze da se vrati u NACRT', () => {
    // Rezervisan let se ne „vraca u nacrt"; putovanje se otkazuje.
    for (const s of STATUSI) assert.equal(jeDozvoljenPrelaz(s, 'NACRT'), false, `prosao ${s}`);
  });

  await t.test('isti status u isti nije dozvoljen prelaz', () => {
    // Za razliku od statusa naloga, ovde se ponovna rezervacija mora odbiti sa 409.
    for (const s of STATUSI) assert.equal(jeDozvoljenPrelaz(s, s), false, `prosao ${s} -> ${s}`);
  });

  await t.test('nepoznat pocetni status ne dozvoljava nista', () => {
    // Stara vrednost (`draft`, `saved`, `booked`) do migracije ne sme tiho da prodje.
    assert.equal(jeDozvoljenPrelaz('draft', 'REZERVISANO'), false);
    assert.equal(jeDozvoljenPrelaz(undefined, 'OTKAZANO'), false);
  });

  await t.test('tabela PRELAZI pokriva svaki status iz enuma', () => {
    // Status bez unosa bio bi stanje iz koga se ne moze izaci, a da to nigde ne pise.
    assert.deepEqual(Object.keys(PRELAZI).sort(), [...STATUSI].sort());
  });

  await t.test('statusi su velikim slovima, kao u specifikaciji', () => {
    // Migracija sa starih malih vrednosti postoji upravo zato; test je cuva.
    assert.deepEqual(STATUSI, ['NACRT', 'REZERVISANO', 'OTKAZANO', 'ZAVRSENO']);
  });
});

test('skor popularnih destinacija (spec §4.1)', async (t) => {
  await t.test('sacuvano putovanje vredi tri pretrage', () => {
    // Pretraga je radoznalost, sacuvano putovanje odluka - prosao je sva cetiri koraka.
    assert.equal(TEZINA_SACUVANIH, 3);
  });

  await t.test('prozor je 30 dana', () => {
    // „Popularno" mora da prati sezonu; siri prozor bi vukao stare pretrage.
    assert.equal(PROZOR_DANA, 30);
  });

  await t.test('ispod tri pretrage grad ne ulazi u listu', () => {
    // Jedna pretraga ne cini destinaciju popularnom, a lista bi bila puna slucajnih gradova.
    assert.equal(MIN_PRETRAGA, 3);
  });

  await t.test('formula je pretrage + 3 × sacuvana', () => {
    // Ista formula stoji u agregaciji; ovde se proverava njen ishod na primerima.
    const skor = (pretraga, sacuvanih) => pretraga + TEZINA_SACUVANIH * sacuvanih;

    assert.equal(skor(10, 0), 10);
    assert.equal(skor(10, 2), 16);
    // Tri sacuvana putovanja vrede kao devet pretraga
    assert.equal(skor(0, 3), skor(9, 0));
  });

  await t.test('jedno sacuvano putovanje ne moze samo da odnese grad u vrh', () => {
    // Faktor 3 je izabran tako da vredi kao mala grupa pretraga, ne kao desetine.
    const skor = (pretraga, sacuvanih) => pretraga + TEZINA_SACUVANIH * sacuvanih;

    assert.ok(skor(20, 0) > skor(0, 1));
  });
});

test('isti trazilac istog dana se broji jednom', async (t) => {
  await t.test('otisak je stabilan za istog korisnika', () => {
    // Da bi se ponovljena pretraga prepoznala, otisak mora da bude isti svaki put.
    assert.equal(
      destinacije.otisak({ userId: 'korisnik1' }),
      destinacije.otisak({ userId: 'korisnik1' })
    );
  });

  await t.test('dva korisnika imaju razlicite otiske', () => {
    // Inace bi se dva korisnika racunala kao jedan i popularnost bi bila niza.
    assert.notEqual(
      destinacije.otisak({ userId: 'korisnik1' }),
      destinacije.otisak({ userId: 'korisnik2' })
    );
  });

  await t.test('otisak nije sam identifikator korisnika', () => {
    // U bazi ne sme da stoji nista cime bi se gost prepoznao izvan ove statistike.
    const o = destinacije.otisak({ sessionId: 'sesija-abc' });

    assert.equal(o.includes('sesija-abc'), false);
    assert.match(o, /^[0-9a-f]{16}$/);
  });

  await t.test('prijavljeni korisnik ima prednost nad sesijom', () => {
    // Isti korisnik iz dva pretrazivaca ne treba da se broji dvaput.
    assert.equal(
      destinacije.otisak({ userId: 'korisnik1', sessionId: 'sesija-a' }),
      destinacije.otisak({ userId: 'korisnik1', sessionId: 'sesija-b' })
    );
  });

  await t.test('bez korisnika i bez sesije otisak je null', () => {
    // Tada se ne moze proveriti da li je isti trazilac, pa se zapis broji - poznata granica.
    assert.equal(destinacije.otisak({}), null);
    assert.equal(destinacije.otisak(), null);
  });
});
