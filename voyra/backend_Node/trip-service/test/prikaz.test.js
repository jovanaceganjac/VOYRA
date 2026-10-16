const test = require('node:test');
const assert = require('node:assert/strict');

const CityService = require('../src/services/CityService');
const AtrakcijeService = require('../src/services/AtrakcijeService');

const gradovi = new CityService();
const atrakcije = new AtrakcijeService();

const { PRAG_BEZ_AERODROMA_KM, MAX_UDALJENOST_KM } = CityService;

const grad = (izmene = {}) => ({
  _id: '792680',
  naziv: 'Beograd',
  nazivSr: 'Beograd',
  nazivEn: 'Belgrade',
  drzava: 'RS',
  drzavaNaziv: 'Srbija',
  lat: 44.7866,
  lon: 20.4489,
  stanovnika: 1273651,
  aerodromi: [{ iata: 'BEG', naziv: 'Beograd Nikola Tesla', udaljenostKm: 18 }],
  ...izmene
});

test('oblik grada koji ide klijentu (spec §4.2)', async (t) => {
  await t.test('srpski naziv se prikazuje, lokalni ostaje uz njega', () => {
    // Nazivi su preuzeti iz ranijeg spiska i ne izmisljaju se; oba su korisna u prikazu.
    const g = gradovi.zaPrikaz(grad({ naziv: 'München', nazivSr: 'Minhen', nazivEn: 'Munich' }));

    assert.equal(g.naziv, 'Minhen');
    assert.equal(g.nazivLokalni, 'München');
    assert.equal(g.nazivEn, 'Munich');
  });

  await t.test('grad bez srpskog naziva prikazuje se lokalnim', () => {
    // Pet gradova iz spiska ostaje bez para; prazno polje bi dalo prikaz bez imena.
    const g = gradovi.zaPrikaz(grad({ nazivSr: undefined, naziv: 'Tromsø', nazivEn: undefined }));

    assert.equal(g.naziv, 'Tromsø');
    assert.equal(g.nazivEn, 'Tromsø');
  });

  await t.test('najblizi aerodrom je prvi u listi', () => {
    // Lista je vec sortirana pri uvozu; prikaz uzima prvi kao glavni.
    const g = gradovi.zaPrikaz(
      grad({
        aerodromi: [
          { iata: 'BEG', udaljenostKm: 18 },
          { iata: 'INI', udaljenostKm: 200 }
        ]
      })
    );

    assert.equal(g.aerodrom.iata, 'BEG');
    assert.equal(g.aerodromi.length, 2);
  });

  await t.test('aerodrom bliži od 30 km znaci „grad sa aerodromom"', () => {
    // Granica odlucuje da li prikaz uz grad pise napomenu o transferu.
    assert.equal(PRAG_BEZ_AERODROMA_KM, 30);
    assert.equal(gradovi.zaPrikaz(grad()).bezAerodroma, false);
  });

  await t.test('aerodrom dalji od 30 km oznacava grad kao „bez aerodroma"', () => {
    // Bled leti preko Ljubljane; korisnik to mora da vidi pre nego sto izabere grad.
    const g = gradovi.zaPrikaz(grad({ aerodromi: [{ iata: 'LJU', udaljenostKm: 45 }] }));

    assert.equal(g.bezAerodroma, true);
    assert.equal(g.bezLeta, false, 'let je i dalje moguc');
  });

  await t.test('aerodrom dalji od 150 km znaci da leta nema', () => {
    // Kijev nema nijedan aerodrom u dometu, pa se plan pravi bez leta.
    assert.equal(MAX_UDALJENOST_KM, 150);

    const g = gradovi.zaPrikaz(grad({ aerodromi: [{ iata: 'RZE', udaljenostKm: 200 }] }));

    assert.equal(g.bezLeta, true);
    assert.equal(g.bezAerodroma, true);
  });

  await t.test('grad bez ijednog aerodroma je i bez aerodroma i bez leta', () => {
    // Prazna lista ne sme da se protumaci kao „ima aerodrom na 0 km".
    for (const bez of [[], undefined]) {
      const g = gradovi.zaPrikaz(grad({ aerodromi: bez }));

      assert.equal(g.aerodrom, null);
      assert.equal(g.bezAerodroma, true);
      assert.equal(g.bezLeta, true);
    }
  });

  await t.test('kod grada sa vise aerodroma prenosi se i kod grada', () => {
    // London, Pariz i Milano se traze preko koda grada, da pretraga pokrije sve aerodrome.
    const g = gradovi.zaPrikaz(grad({ iataGrada: 'LON' }));

    assert.equal(g.iataGrada, 'LON');
  });

  await t.test('identifikator je niska, kakav ga frontend ocekuje', () => {
    // `_id` je `geonameId`; broj u JSON-u bi se u poredjenjima razlikovao od niske.
    assert.equal(typeof gradovi.zaPrikaz(grad({ _id: 792680 })).id, 'string');
  });
});

test('atrakcija administratora u oblik koji Planner ocekuje (spec §4.5)', async (t) => {
  const zapis = (izmene = {}) => ({
    _id: 'a1',
    naziv: 'Kalemegdan',
    opis: 'Tvrdjava iznad usca',
    gradId: '792680',
    lat: 44.8225,
    lon: 20.4506,
    kategorije: ['kultura', 'priroda'],
    trajanjeMin: 90,
    ...izmene
  });

  await t.test('kljucevi su isti kao kod spoljnog izvora', () => {
    // Faza 3 ne mora da zna odakle atrakcija dolazi; jedino `source` ostaje kao oznaka.
    const a = atrakcije.zaPlanner(zapis());

    for (const k of ['id', 'name', 'description', 'lat', 'lon', 'categories', 'category', 'duration', 'price', 'rating', 'source']) {
      assert.ok(k in a, `nema polja ${k}`);
    }

    assert.equal(a.source, 'admin');
    assert.equal(a.name, 'Kalemegdan');
    assert.equal(a.duration, 90);
  });

  await t.test('oznaka nosi prefiks ADM_, da se ne pomesa sa spoljnom', () => {
    // Spoljne atrakcije nose `GEO-` ili `OTM-`; prefiks razdvaja izvore u planu.
    assert.equal(atrakcije.zaPlanner(zapis()).id, 'ADM_a1');
  });

  await t.test('prva kategorija je glavna', () => {
    // Po njoj se procenjuje trajanje i radno vreme kada ih zapis ne nosi.
    assert.equal(atrakcije.zaPlanner(zapis()).category, 'kultura');
  });

  await t.test('atrakcija administratora NEMA izmisljenu ocenu', () => {
    // Zapis je proveren, ali ocena posetilaca ne postoji; Faza 3 je svodi na sredinu skale.
    assert.equal(atrakcije.zaPlanner(zapis()).rating, null);
  });

  await t.test('bez cene ulaznice cena je nula, ne null', () => {
    // Racun budzeta zbraja cene; `null` bi dao NaN.
    assert.equal(atrakcije.zaPlanner(zapis()).price, 0);
    assert.equal(atrakcije.zaPlanner(zapis({ cenaUlaznice: 12 })).price, 12);
  });

  await t.test('cena ulaznice 0 se ne pretvara u podrazumevanu', () => {
    // Besplatna atrakcija je stvaran podatak, ne odsustvo podatka.
    assert.equal(atrakcije.zaPlanner(zapis({ cenaUlaznice: 0 })).price, 0);
  });

  await t.test('radno vreme se prenosi samo kada je potpuno', () => {
    // Nepotpuna satnica ne moze da ude u raspored dana; Planner tada procenjuje.
    assert.deepEqual(
      atrakcije.zaPlanner(zapis({ radnoVreme: { open: '10:00', close: '18:00' } })).openingHours,
      { open: '10:00', close: '18:00' }
    );
    assert.equal('openingHours' in atrakcije.zaPlanner(zapis({ radnoVreme: { open: '10:00' } })), false);
    assert.equal('openingHours' in atrakcije.zaPlanner(zapis()), false);
  });

  await t.test('slika se prenosi sa potpisom izvora', () => {
    // Potpis je obavezan uz sliku; bez njega se slika ne bi smela prikazati.
    const a = atrakcije.zaPlanner(
      zapis({ slika: { url: 'https://s.test/k.jpg', sourceUrl: 'https://izvor.test', credit: 'Wikipedia' } })
    );

    assert.equal(a.image, 'https://s.test/k.jpg');
    assert.equal(a.imageSource, 'https://izvor.test');
    assert.equal(a.imageCredit, 'Wikipedia');
  });

  await t.test('bez slike sva tri polja su null', () => {
    // Prikaz tada stavlja ikonicu kategorije.
    const a = atrakcije.zaPlanner(zapis());

    assert.equal(a.image, null);
    assert.equal(a.imageSource, null);
    assert.equal(a.imageCredit, null);
  });

  await t.test('oblik za prikaz u panelu nosi izvor i stanje', () => {
    // Administrator u listi mora da vidi da li je atrakcija aktivna.
    const a = atrakcije.zaPrikaz(zapis());

    assert.equal(a.izvor, 'admin');
    assert.equal(a.aktivna, true);
    assert.equal(atrakcije.zaPrikaz(zapis({ aktivna: false })).aktivna, false);
  });
});
