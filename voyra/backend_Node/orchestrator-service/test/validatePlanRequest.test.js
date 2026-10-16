const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validatePlanRequest,
  validirajPreferencije,
  validirajFiltere,
  MAX_TRAJANJE_DANA
} = require('../src/utils/validatePlanRequest');

/** Datum za `n` dana od danas, u obliku YYYY-MM-DD. */
const zaDana = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Ispravan zahtev; pojedinacni testovi kvare po jedno polje. */
const ispravan = (izmene = {}) => ({
  from: 'BEG',
  to: 'ATH',
  checkIn: zaDana(30),
  checkOut: zaDana(35),
  passengers: 2,
  ...izmene
});

const greske = (telo, schema = null) => validatePlanRequest(telo, schema).errors;

test('validatePlanRequest — osnovni oblik zahteva', async (t) => {
  await t.test('ispravan zahtev prolazi i vraca normalizovanu vrednost', () => {
    // Prolaz mora da vrati `value`, jer orchestrator dalje radi sa njim, ne sa telom zahteva.
    const r = validatePlanRequest(ispravan());

    assert.equal(r.valid, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.value.from, 'BEG');
    assert.equal(r.value.passengers, 2);
  });

  await t.test('IATA kod se normalizuje na velika slova i bez praznina', () => {
    // Korisnik kod moze da unese malim slovima; Duffel prihvata samo velika.
    const r = validatePlanRequest(ispravan({ from: ' beg ', to: 'ath' }));

    assert.equal(r.valid, true);
    assert.equal(r.value.from, 'BEG');
    assert.equal(r.value.to, 'ATH');
  });

  await t.test('odbija IATA kod koji nije tri slova', () => {
    // Trocifreni broj ili dva slova nisu IATA kod, a Duffel bi vratio nejasnu gresku.
    assert.match(greske(ispravan({ from: 'BE' })).join(' '), /from mora biti IATA/);
    assert.match(greske(ispravan({ to: '123' })).join(' '), /to mora biti IATA/);
  });

  await t.test('vraca SVE greske odjednom, ne prvu', () => {
    // Korisnik ispravlja formu jednom; poruka po poruku bi znacila vise pokusaja.
    const g = greske({ from: 'X', to: 'X', checkIn: 'ne-datum', passengers: 0 });

    assert.ok(g.length >= 4, `ocekivano najmanje 4 greske, dobijeno ${g.length}: ${g.join(' | ')}`);
  });

  await t.test('grad se moze zadati preko fromCityId/toCityId bez IATA koda', () => {
    // Sada odrediste je bilo koji grad u Evropi, pa mnogi nemaju svoj IATA kod.
    const r = validatePlanRequest({
      fromCityId: '792680',
      toCityId: '3186886',
      checkIn: zaDana(10),
      checkOut: zaDana(13)
    });

    assert.equal(r.valid, true, r.errors.join(' | '));
    assert.equal(r.value.toCityId, '3186886');
  });

  await t.test('odbija isto polaziste i odrediste, po oba nacina zadavanja', () => {
    // Plan za put iz grada u isti grad nema smisla, pa se odbija pre poziva Planner-a.
    assert.match(greske(ispravan({ from: 'BEG', to: 'BEG' })).join(' '), /razliciti/);
    assert.match(
      greske({ fromCityId: '1', toCityId: '1', checkIn: zaDana(5), checkOut: zaDana(7) }).join(' '),
      /razliciti/
    );
  });
});

test('validatePlanRequest — datumi i trajanje (spec §4.2)', async (t) => {
  await t.test('odbija datum polaska u proslosti', () => {
    // Let u proslost se ne moze rezervisati; greska pre poziva izvora je jasnija.
    assert.match(greske(ispravan({ checkIn: zaDana(-1) })).join(' '), /proslosti/);
  });

  await t.test('danasnji datum polaska je dozvoljen', () => {
    // Granica je ponoc danasnjeg dana, pa polazak istog dana mora da prodje.
    assert.equal(validatePlanRequest(ispravan({ checkIn: zaDana(0), checkOut: zaDana(3) })).valid, true);
  });

  await t.test('odbija povratak pre ili istog dana kao polazak', () => {
    // Boravak od nula dana nije putovanje, a Planner bi dobio prazan raspored.
    assert.match(greske(ispravan({ checkOut: zaDana(30) })).join(' '), /posle checkIn/);
    assert.match(greske(ispravan({ checkOut: zaDana(29) })).join(' '), /posle checkIn/);
  });

  await t.test(`dozvoljava tacno ${MAX_TRAJANJE_DANA} dana`, () => {
    // Granica iz specifikacije je ukljuciva; dan dolaska i dan povratka se broje.
    const r = validatePlanRequest(ispravan({ checkIn: zaDana(10), checkOut: zaDana(10 + MAX_TRAJANJE_DANA - 1) }));

    assert.equal(r.valid, true, r.errors.join(' | '));
  });

  await t.test(`odbija ${MAX_TRAJANJE_DANA + 1} dana i kaze koliko je trazeno`, () => {
    // Poruka mora da sadrzi trazeni broj dana da korisnik zna koliko da skrati.
    const g = greske(ispravan({ checkIn: zaDana(10), checkOut: zaDana(10 + MAX_TRAJANJE_DANA) })).join(' ');

    assert.match(g, new RegExp(`najvise ${MAX_TRAJANJE_DANA} dana`));
    assert.match(g, new RegExp(`trazeno ${MAX_TRAJANJE_DANA + 1}`));
  });
});

test('validatePlanRequest — putnici i budzet', async (t) => {
  await t.test('bez polja passengers podrazumeva jednog putnika', () => {
    // Pretraga sa pocetne strane ne trazi broj putnika, pa mora da radi i bez njega.
    assert.equal(validatePlanRequest({ ...ispravan(), passengers: undefined }).value.passengers, 1);
  });

  await t.test('putnika nema gornje granice (spec §4.2)', () => {
    // Ogranicenje na 9 putnika vazi za REZERVACIJU (§4.8), ne za planiranje.
    const r = validatePlanRequest(ispravan({ passengers: 40 }));

    assert.equal(r.valid, true, r.errors.join(' | '));
    assert.equal(r.value.passengers, 40);
  });

  await t.test('odbija nula, negativan i decimalan broj putnika', () => {
    // Putnik je celina; pola putnika ili nula njih ne postoje.
    for (const n of [0, -1, 2.5]) {
      assert.match(greske(ispravan({ passengers: n })).join(' '), /passengers/, `prosao ${n}`);
    }
  });

  await t.test('budzet je opcion, ali ako postoji mora biti veci od nule', () => {
    // Bez budzeta plan se pravi bez ogranicenja; budzet 0 bi znacio da nista ne staje.
    assert.equal(validatePlanRequest(ispravan({ budget: undefined })).valid, true);
    assert.equal(validatePlanRequest(ispravan({ budget: null })).valid, true);
    assert.match(greske(ispravan({ budget: 0 })).join(' '), /budget/);
    assert.match(greske(ispravan({ budget: -100 })).join(' '), /budget/);
  });

  await t.test('broj gostiju prati broj putnika kada nije zadat', () => {
    // Smestaj se trazi za isti broj ljudi koji leti, osim kada se izricito razlikuje.
    assert.equal(validatePlanRequest(ispravan({ passengers: 3 })).value.guests, 3);
    assert.equal(validatePlanRequest(ispravan({ passengers: 3, guests: 2 })).value.guests, 2);
  });
});

test('validirajPreferencije — dozvoljene vrednosti dolaze iz Planner-a', async (t) => {
  const SCHEMA = {
    pace: ['relaksirano', 'umeren', 'intenzivno'],
    interests: ['kultura', 'muzeji', 'priroda'],
    accommodationTypes: ['hotel', 'apartman'],
    transportPriority: ['najjeftinije', 'najkrace']
  };

  await t.test('bez preferencija nema gresaka', () => {
    // Preferencije su opcione; plan se pravi sa podrazumevanim vrednostima Planner-a.
    assert.deepEqual(validirajPreferencije(undefined, SCHEMA), []);
    assert.deepEqual(validirajPreferencije(null, SCHEMA), []);
  });

  await t.test('odbija vrednost koje nema u schema listi i navede dozvoljene', () => {
    // Poruka mora da nabroji dozvoljene vrednosti, jer ih frontend ne mora znati.
    const g = validirajPreferencije({ pace: 'brzo' }, SCHEMA).join(' ');

    assert.match(g, /pace mora biti jedno od/);
    assert.match(g, /relaksirano/);
  });

  await t.test('bez schema provera pripadnosti se preskace', () => {
    // Kada Planner nije dostupan, orchestrator ne drzi svoju kopiju liste koja bi zastarela.
    assert.deepEqual(validirajPreferencije({ pace: 'nepoznato' }, null), []);
  });

  await t.test('nepoznata interesovanja se prijavljuju sva, ne samo prvo', () => {
    // Korisnik mora da vidi sve pogresne vrednosti odjednom.
    const g = validirajPreferencije({ interests: ['kultura', 'skijanje', 'ronjenje'] }, SCHEMA).join(' ');

    assert.match(g, /skijanje/);
    assert.match(g, /ronjenje/);
  });

  await t.test('minAccommodationRating mora biti izmedju 1 i 5, ili null', () => {
    // Ocena smestaja je na skali 1-5; null znaci "bez ogranicenja".
    assert.deepEqual(validirajPreferencije({ minAccommodationRating: null }, SCHEMA), []);
    assert.deepEqual(validirajPreferencije({ minAccommodationRating: 4.5 }, SCHEMA), []);
    assert.equal(validirajPreferencije({ minAccommodationRating: 0.5 }, SCHEMA).length, 1);
    assert.equal(validirajPreferencije({ minAccommodationRating: 6 }, SCHEMA).length, 1);
  });

  await t.test('dan mora biti u obliku HH:MM i kraj posle pocetka', () => {
    // Raspored se pravi unutar tog intervala; obrnut interval bi dao nula aktivnosti.
    assert.deepEqual(validirajPreferencije({ dayStart: '09:00', dayEnd: '20:00' }, SCHEMA), []);
    assert.match(validirajPreferencije({ dayStart: '9h' }, SCHEMA).join(' '), /HH:MM/);
    assert.match(validirajPreferencije({ dayStart: '20:00', dayEnd: '09:00' }, SCHEMA).join(' '), /posle dayStart/);
    assert.match(validirajPreferencije({ dayStart: '09:00', dayEnd: '09:00' }, SCHEMA).join(' '), /posle dayStart/);
  });

  await t.test('preferencije moraju biti objekat, ne lista ni niska', () => {
    // Lista bi tiho prosla kroz `typeof === object`, pa se proverava posebno.
    assert.match(validirajPreferencije(['kultura'], SCHEMA).join(' '), /mora biti objekat/);
    assert.match(validirajPreferencije('kultura', SCHEMA).join(' '), /mora biti objekat/);
  });
});

test('validirajFiltere — filteri leta (spec §4.3)', async (t) => {
  await t.test('bez filtera nema gresaka', () => {
    // Filteri su opcioni; bez njih se uzimaju sve ponude.
    assert.deepEqual(validirajFiltere(undefined), []);
    assert.deepEqual(validirajFiltere(null), []);
  });

  await t.test('maxStops 0 znaci samo direktan let i mora da prodje', () => {
    // Nula je ispravna vrednost, a naivna provera `if (!maxStops)` bi je odbacila.
    assert.deepEqual(validirajFiltere({ maxStops: 0 }), []);
  });

  await t.test('odbija negativan i decimalan maxStops', () => {
    // Broj presedanja je ceo i nenegativan.
    assert.equal(validirajFiltere({ maxStops: -1 }).length, 1);
    assert.equal(validirajFiltere({ maxStops: 1.5 }).length, 1);
  });

  await t.test('vreme polaska mora biti HH:MM', () => {
    // Filter se poredi sa vremenom iz ponude kao niska, pa oblik mora biti tacan.
    assert.deepEqual(validirajFiltere({ departureFrom: '06:00', departureTo: '23:59' }), []);
    assert.match(validirajFiltere({ departureFrom: '6:00 AM' }).join(' '), /HH:MM/);
    assert.match(validirajFiltere({ departureTo: '24:00' }).join(' '), /HH:MM/);
  });
});
