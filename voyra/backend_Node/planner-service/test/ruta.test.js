const test = require('node:test');
const assert = require('node:assert/strict');

const RouteOptimizer = require('../src/utils/RouteOptimizer');
const Distances = require('../src/utils/Distances');

const distances = new Distances();
const optimizer = new RouteOptimizer(distances);

/**
 * 2-opt nad redosledom obilaska (spec §6.4).
 *
 * Tacke se namerno postavljaju na pravu liniju: tada je najkraca putanja
 * poznata unapred, pa se moze tvrditi sta optimizacija mora da nadje, a ne
 * samo da je „krace od pocetnog".
 */

/** Tacka na `km` kilometara istocno od pocetne, na istoj sirini. */
const naIstok = (km, oznaka) => ({
  name: oznaka,
  lat: 45,
  lon: 20 + km / (111.32 * Math.cos((45 * Math.PI) / 180))
});

const A = naIstok(0, 'A');
const B = naIstok(5, 'B');
const C = naIstok(10, 'C');
const D = naIstok(15, 'D');

const oznake = (niz) => niz.map((t) => t.name).join('');

test('Distances — rastojanja nad tackama', async (t) => {
  await t.test('rastojanje izmedju dve tacke je u kilometrima', () => {
    // Ceo raspored vremena se racuna iz ovih vrednosti.
    assert.ok(Math.abs(distances.between(A, B) - 5) < 0.1, `dobijeno ${distances.between(A, B)}`);
  });

  await t.test('nedostajuca tacka daje nulu, ne gresku', () => {
    // Atrakcija bez koordinata postoji u admin unosu; racun ne sme da padne.
    assert.equal(distances.between(null, B), 0);
    assert.equal(distances.between(A, undefined), 0);
  });

  await t.test('duzina putanje je zbir uzastopnih rastojanja', () => {
    // Prikaz dana navodi ukupnu predjenu razdaljinu.
    assert.ok(Math.abs(distances.total([A, B, C]) - 10) < 0.2);
  });

  await t.test('putanja sa manje od dve tacke ima duzinu nula', () => {
    // Dan sa jednom atrakcijom nema putovanja izmedju atrakcija.
    assert.equal(distances.total([A]), 0);
    assert.equal(distances.total([]), 0);
    assert.equal(distances.total(null), 0);
  });

  await t.test('duzina ne zavisi od smera', () => {
    // Haversine je simetrican, pa i putanja i njen obrnuti oblik imaju istu duzinu.
    assert.ok(Math.abs(distances.total([A, B, C, D]) - distances.total([D, C, B, A])) < 0.001);
  });
});

test('2-opt nad otvorenom putanjom', async (t) => {
  await t.test('ispravlja preseceni redosled u putanju bez vracanja', () => {
    // A, C, B, D znaci da se izmedju C i B ide nazad; 2-opt to mora da ukloni.
    const r = optimizer.optimize([A, C, B, D]);

    assert.ok(distances.total(r) < distances.total([A, C, B, D]));
    assert.ok(Math.abs(distances.total(r) - 15) < 0.3, `duzina ${distances.total(r)}`);
  });

  await t.test('putanja koja je vec najkraca se ne menja', () => {
    // Prag od 10 m postoji da se ne prihvataju „poboljsanja" koja su numericki sum.
    assert.equal(oznake(optimizer.optimize([A, B, C, D])), 'ABCD');
  });

  await t.test('sve atrakcije ostaju u rezultatu, nijedna se ne gubi ni dupla', () => {
    // Izgubljena atrakcija bi nestala iz plana bez ijedne poruke korisniku.
    const r = optimizer.optimize([C, A, D, B]);

    assert.equal(r.length, 4);
    assert.deepEqual([...oznake(r)].sort().join(''), 'ABCD');
  });

  await t.test('putanja sa dve ili manje tacaka se vraca nepromenjena', () => {
    // Nema sta da se zameni; petlja bi radila u prazno.
    assert.deepEqual(optimizer.optimize([A, B]), [A, B]);
    assert.deepEqual(optimizer.optimize([A]), [A]);
    assert.deepEqual(optimizer.optimize([]), []);
    assert.deepEqual(optimizer.optimize(null), []);
  });

  await t.test('zamena koja dira poslednju tacku se racuna bez repne ivice', () => {
    // Putanja dana je OTVORENA: posle poslednje atrakcije se nikuda ne ide.
    // Kod zatvorene ture bi se tu racunao povratak na pocetak i rezultat bi bio drugi.
    const r = optimizer.optimize([A, B, D, C]);

    assert.equal(oznake(r), 'ABCD');
  });

  await t.test('broj iteracija je ogranicen', () => {
    // Bez granice bi patoloska ulazna tacka mogla da zavrti petlju bez kraja.
    optimizer.optimize([C, A, D, B], 1);

    assert.equal(optimizer.poslednjiBrojIteracija, 1);
  });
});

test('2-opt sa fiksnom polaznom tackom (spec §6.4 t.2)', async (t) => {
  const SMESTAJ = naIstok(-2, 'S');

  await t.test('polazna tacka nije u rezultatu i ne pomera se', () => {
    // Polazna tacka je smestaj; on nije aktivnost i uvek je prvi.
    const r = optimizer.optimizeOdPocetka([C, B, D], SMESTAJ);

    assert.equal(r.length, 3);
    assert.equal(oznake(r).includes('S'), false);
  });

  await t.test('redosled se uredjuje po udaljenosti od smestaja', () => {
    // Najkraca putanja od smestaja na zapadu ide redom prema istoku.
    assert.equal(oznake(optimizer.optimizeOdPocetka([D, B, C], SMESTAJ)), 'BCD');
  });

  await t.test('duzina se meri OD smestaja, ne od prve atrakcije', () => {
    // Inace bi plan mogao da pocne najdaljom atrakcijom, a da to ne vidi kao gubitak.
    const saSmestajem = optimizer._duzinaSaPocetkom([B, C, D], SMESTAJ);
    const bezSmestaja = optimizer._duzinaSaPocetkom([B, C, D], null);

    assert.ok(saSmestajem > bezSmestaja, `${saSmestajem} nije vece od ${bezSmestaja}`);
    assert.ok(Math.abs(saSmestajem - bezSmestaja - distances.between(SMESTAJ, B)) < 0.001);
  });

  await t.test('dodatni uslov moze da odbije krace resenje', () => {
    // Tako se odbacuje poboljsanje koje gura atrakciju van radnog vremena.
    const uvekOdbij = () => false;
    const r = optimizer.optimizeOdPocetka([D, B, C], SMESTAJ, uvekOdbij);

    assert.equal(oznake(r), 'DBC', 'uslov nije postovan');
  });

  await t.test('dodatni uslov koji sve prihvata daje isto kao bez uslova', () => {
    // Uslov sme da suzi izbor, ali ne i da promeni sam racun duzine.
    const sveProlazi = () => true;

    assert.equal(
      oznake(optimizer.optimizeOdPocetka([D, B, C], SMESTAJ, sveProlazi)),
      oznake(optimizer.optimizeOdPocetka([D, B, C], SMESTAJ))
    );
  });

  await t.test('jedna atrakcija ili nijedna se vracaju nepromenjeno', () => {
    // Nema sta da se preuredi.
    assert.deepEqual(optimizer.optimizeOdPocetka([B], SMESTAJ), [B]);
    assert.deepEqual(optimizer.optimizeOdPocetka([], SMESTAJ), []);
    assert.deepEqual(optimizer.optimizeOdPocetka(null, SMESTAJ), []);
  });

  await t.test('bez polazne tacke duzina pocinje od prve atrakcije', () => {
    // Dan bez smestaja (prvi dan pre prijave) i dalje mora da se uredi.
    const r = optimizer.optimizeOdPocetka([D, B, C], null);

    assert.equal(r.length, 3);
    assert.equal(optimizer._duzinaSaPocetkom([], null), 0);
  });

  await t.test('broj iteracija je ogranicen i ovde', () => {
    // Ista zastita kao kod otvorene putanje.
    optimizer.optimizeOdPocetka([D, B, C], SMESTAJ, null, 1);

    assert.equal(optimizer.poslednjiBrojIteracija, 1);
  });
});
