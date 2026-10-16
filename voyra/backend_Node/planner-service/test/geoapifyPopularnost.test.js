const test = require('node:test');
const assert = require('node:assert/strict');

const { popularnost, oceniAtrakcije, radnoVreme } = require('../src/services/FazaAtrakcije');
const { spoji, isteSu, normalizujNaziv, PRAG_ISTE_TACKE_KM } = require('../src/services/SpajanjeAtrakcija');

/**
 * Popularnost iz Geoapify-a u Fazi 3.
 *
 * Geoapify nema ocenu posetilaca, pa adapter ocenu izvodi iz veze ka
 * Wikipediji/Wikidati i ogranicava je na 4.5. Ovi testovi proveravaju da
 * Faza 3 te vrednosti pretvara u ocekivan doprinos oceni.
 */

const atrakcija = (izmene = {}) => ({
  id: 'GEO-1',
  name: 'Acropolis',
  categories: ['kultura'],
  lat: 37.9715,
  lon: 23.7257,
  source: 'geoapify',
  ...izmene
});

test('popularnost atrakcije svedena na [0, 1]', async (t) => {
  await t.test('ocena bez wiki veze (3.0) daje 0.6', () => {
    // To je osnovica koju Geoapify adapter daje objektu bez ikakvog signala.
    assert.equal(popularnost(atrakcija({ rating: 3.0 })), 0.6);
  });

  await t.test('ocena sa Wikipedijom (3.8) daje 0.76', () => {
    // Objekat o kome postoji clanak dobija merljivo vecu popularnost.
    assert.equal(popularnost(atrakcija({ rating: 3.8 })), 0.76);
  });

  await t.test('najvisa Geoapify ocena (4.5) daje 0.9, nikad 1.0', () => {
    // Gornja granica 4.5 je namerna: bez stvarnih ocena posetilaca 1.0 bi bilo obecanje
    // koje podaci ne pokrivaju.
    assert.equal(popularnost(atrakcija({ rating: 4.5 })), 0.9);
  });

  await t.test('atrakcija bez ocene dobija 0.5, ne 0', () => {
    // Odsustvo ocene nije losa ocena; nula bi atrakciju izbacila iz izbora.
    assert.equal(popularnost(atrakcija({ rating: undefined })), 0.5);
    assert.equal(popularnost(atrakcija({ rating: null })), 0.5);
    assert.equal(popularnost(atrakcija({ rating: 0 })), 0.5);
  });

  await t.test('besmislena ocena dobija 0.5', () => {
    // Izvor moze da posalje tekst; NaN bi se prosirio kroz ceo racun ocene.
    assert.equal(popularnost(atrakcija({ rating: 'nema' })), 0.5);
  });

  await t.test('ocena veca od 5 se odseca na 1', () => {
    // OpenTripMap i admin unosi mogu da odu iznad skale; racun ocene ocekuje [0, 1].
    assert.equal(popularnost(atrakcija({ rating: 7 })), 1);
  });

  await t.test('razlika izmedju Geoapify ocena se vidi u ukupnoj oceni', () => {
    // Bez toga bi popularnost bila mrtvo slovo i sve atrakcije bi bile jednake.
    const [slabija, jaca] = oceniAtrakcije(
      [atrakcija({ rating: 3.0 }), atrakcija({ id: 'GEO-2', rating: 4.5 })],
      ['kultura']
    );

    assert.ok(jaca.score > slabija.score, `${jaca.score} vs ${slabija.score}`);
    assert.ok(jaca.scoreBreakdown.popularnost > slabija.scoreBreakdown.popularnost);
  });

  await t.test('popularnost sama ne moze da pretekne poklapanje interesovanja', () => {
    // Interesovanja su izricit izbor korisnika; zato se izbor radi u dva prolaza.
    const [uInteresovanjima, van] = oceniAtrakcije(
      [
        atrakcija({ rating: 3.0, categories: ['kultura'] }),
        atrakcija({ id: 'GEO-2', rating: 4.5, categories: ['nocni_zivot'] })
      ],
      ['kultura']
    );

    assert.equal(uInteresovanjima.outsideInterests, false);
    assert.equal(van.outsideInterests, true);
  });
});

test('radno vreme iz Geoapify-a ima prednost nad procenom', async (t) => {
  await t.test('satnica iz izvora se ne oznacava kao procena', () => {
    // Kada izvor zna satnicu, procena po kategoriji je nepotrebna i losija.
    const r = radnoVreme(atrakcija({ openingHours: { open: '08:00', close: '19:30' } }));

    assert.deepEqual(r.openingHours, { open: '08:00', close: '19:30' });
    assert.equal(r.openingHoursEstimated, false);
  });

  await t.test('bez satnice se procenjuje po kategoriji i to se oznaci', () => {
    // Prikaz na osnovu te oznake ne predstavlja procenu kao podatak izvora.
    const r = radnoVreme(atrakcija());

    assert.ok(r.openingHours.open);
    assert.equal(r.openingHoursEstimated, true);
  });

  await t.test('nepotpuna satnica se racuna kao da je nema', () => {
    // Samo vreme otvaranja ne moze da uce u raspored dana.
    assert.equal(radnoVreme(atrakcija({ openingHours: { open: '09:00' } })).openingHoursEstimated, true);
  });
});

test('pravilo duplikata atrakcija — naziv ili manje od 150 m (spec §4.5)', async (t) => {
  await t.test('granica je 150 metara', () => {
    // Otprilike jedan gradski blok: koordinate istog objekta se kod razlicitih izvora razilaze,
    // a sire od toga bi spojilo dva susedna muzeja.
    assert.equal(PRAG_ISTE_TACKE_KM, 0.15);
  });

  await t.test('isti naziv znaci isto mesto i kada su koordinate daleko', () => {
    // Izvori mere razlicite tacke istog objekta (ulaz, srediste poligona).
    assert.equal(
      isteSu({ name: 'Akropolj', lat: 37.9715, lon: 23.7257 }, { name: 'Akropolj', lat: 37.99, lon: 23.75 }),
      true
    );
  });

  await t.test('rastojanje pod 150 m znaci isto mesto i kada su nazivi razliciti', () => {
    // Isto mesto nosi dva imena: „Partenon" i „Parthenon Temple".
    assert.equal(
      isteSu({ name: 'Partenon', lat: 37.9715, lon: 23.7257 }, { name: 'Parthenon Temple', lat: 37.9716, lon: 23.7258 }),
      true
    );
  });

  await t.test('rastojanje preko 150 m sa razlicitim nazivom nije duplikat', () => {
    // Dva susedna muzeja ne smeju da se spoje u jedan zapis.
    assert.equal(
      isteSu({ name: 'Muzej A', lat: 37.9715, lon: 23.7257 }, { name: 'Muzej B', lat: 37.9755, lon: 23.7257 }),
      false
    );
  });

  await t.test('naziv se poredi bez dijakritike, clanova i interpunkcije', () => {
    // „The Acropolis Museum" i „Acropolis Museum" su isti muzej.
    assert.equal(normalizujNaziv('The Acropolis Museum'), normalizujNaziv('Acropolis Museum'));
    assert.equal(normalizujNaziv('Đavolja varoš'), normalizujNaziv('Davolja Varos'));
    assert.equal(normalizujNaziv('Musée du Louvre'), normalizujNaziv('Musee du Louvre'));
  });

  await t.test('bez koordinata odlucuje samo naziv', () => {
    // Admin unos bez koordinata ne sme da se spoji sa svim sto nema koordinate.
    assert.equal(isteSu({ name: 'Kalemegdan' }, { name: 'Kalemegdan' }), true);
    assert.equal(isteSu({ name: 'Kalemegdan' }, { name: 'Skadarlija' }), false);
  });

  await t.test('prazan naziv ne spaja sve bezimeno', () => {
    // Inace bi dva objekta bez imena postala isto mesto.
    assert.equal(isteSu({ name: '' }, { name: '' }), false);
  });

  await t.test('naziv koji je ceo sastavljen od clanova se racuna kao prazan', () => {
    // Normalizacija brise clanove; „The" ostaje prazno i tada odlucuju koordinate.
    assert.equal(normalizujNaziv('The'), '');
    assert.equal(isteSu({ name: 'The' }, { name: 'The' }), false);
  });
});

test('spajanje atrakcija administratora sa eksternim (spec §4.5)', async (t) => {
  const admin = (izmene = {}) => ({
    name: 'Akropolj',
    lat: 37.9715,
    lon: 23.7257,
    source: 'admin',
    categories: ['kultura'],
    trajanjeMin: 120,
    ...izmene
  });

  const eksterna = (izmene = {}) => ({
    name: 'Acropolis of Athens',
    lat: 37.9716,
    lon: 23.7258,
    source: 'geoapify',
    image: 'https://slika.test/akropolj.jpg',
    imageCredit: 'Wikipedia',
    description: 'Tvrdjava iznad Atine',
    rating: 4.5,
    ...izmene
  });

  await t.test('bez administratorovih atrakcija lista ostaje nepromenjena', () => {
    // Najcesci slucaj: administrator nije uneo nista za taj grad.
    const r = spoji([eksterna()], []);

    assert.equal(r.spojene.length, 1);
    assert.equal(r.duplikata, 0);
  });

  await t.test('kod poklapanja ostaje zapis ADMINISTRATORA', () => {
    // Njega je neko proverio; spoljni izvor zna da ima pogresnu kategoriju ili trajanje.
    const r = spoji([eksterna()], [admin()]);

    assert.equal(r.spojene.length, 1);
    assert.equal(r.duplikata, 1);
    assert.equal(r.spojene[0].name, 'Akropolj');
    assert.equal(r.spojene[0].source, 'admin');
    assert.equal(r.spojene[0].trajanjeMin, 120);
  });

  await t.test('slika i opis se preuzimaju od spoljnog izvora', () => {
    // Rucni unos ne treba da bude siromasniji od automatskog.
    const r = spoji([eksterna()], [admin()]);

    assert.equal(r.spojene[0].image, 'https://slika.test/akropolj.jpg');
    assert.equal(r.spojene[0].description, 'Tvrdjava iznad Atine');
    assert.equal(r.spojene[0].rating, 4.5);
  });

  await t.test('sto je administrator uneo se NE prepisuje', () => {
    // Njegov opis i slika imaju prednost; spoljni izvor samo dopunjuje praznine.
    const r = spoji([eksterna()], [admin({ description: 'Moj opis', image: 'https://moja.test/s.jpg' })]);

    assert.equal(r.spojene[0].description, 'Moj opis');
    assert.equal(r.spojene[0].image, 'https://moja.test/s.jpg');
  });

  await t.test('spojeni zapis pamti iz kog izvora je dopunjen', () => {
    // Bez toga se ne bi znalo odakle su stigli slika i opis.
    assert.equal(spoji([eksterna()], [admin()]).spojene[0].spojenoSaIzvorom, 'geoapify');
  });

  await t.test('eksterna atrakcija bez para ostaje u listi', () => {
    // Administrator unosi samo pojedinacna mesta; ostalo mora da prodje dalje.
    const r = spoji([eksterna(), eksterna({ name: 'Agora', lat: 37.975, lon: 23.72 })], [admin()]);

    assert.equal(r.spojene.length, 2);
    assert.equal(r.duplikata, 1);
    assert.ok(r.spojene.some((a) => a.name === 'Agora'));
  });

  await t.test('administratorove atrakcije idu prve u listi', () => {
    // One su te koje ostaju kod poklapanja, pa moraju prve da potraze par.
    const r = spoji([eksterna({ name: 'Agora', lat: 37.975, lon: 23.72 })], [admin()]);

    assert.equal(r.spojene[0].source, 'admin');
  });

  await t.test('nijedna atrakcija se ne pojavljuje dvaput', () => {
    // Duplikat u planu znaci da bi korisnik isto mesto obisao dva puta.
    const r = spoji([eksterna(), eksterna({ name: 'Agora', lat: 37.975, lon: 23.72 })], [admin()]);
    const nazivi = r.spojene.map((a) => normalizujNaziv(a.name));

    assert.equal(new Set(nazivi).size, nazivi.length);
  });

  await t.test('prazan poziv ne rusi spajanje', () => {
    // Grad bez ikakvih atrakcija je moguc (mali grad bez ijednog OSM zapisa).
    assert.deepEqual(spoji([], []), { spojene: [], duplikata: 0 });
    assert.deepEqual(spoji(), { spojene: [], duplikata: 0 });
  });
});
