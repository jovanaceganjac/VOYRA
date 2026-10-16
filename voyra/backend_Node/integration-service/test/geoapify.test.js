const test = require('node:test');
const assert = require('node:assert/strict');

const { procitajRadnoVreme } = require('../src/utils/radnoVreme');
const GeoapifyPlacesAdapter = require('../src/adapters/GeoapifyPlacesAdapter');
const krediti = require('../src/utils/geoapifyKrediti');

const { oceniIzSignala } = GeoapifyPlacesAdapter;
const adapter = new GeoapifyPlacesAdapter();

const MAPA = {
  kultura: ['tourism.sights', 'tourism.attraction', 'religion.place_of_worship', 'heritage'],
  muzeji: ['entertainment.museum'],
  priroda: ['leisure.park', 'natural'],
  gastronomija: ['catering.restaurant', 'catering.cafe']
};

/** GeoJSON `feature` u obliku u kome ga Geoapify vraca. */
const mesto = (izmene = {}, raw = {}) => ({
  type: 'Feature',
  properties: {
    place_id: 'PLACE_1',
    name: 'Ακρόπολη',
    name_international: { en: 'Acropolis', el: 'Ακρόπολη' },
    categories: ['tourism', 'tourism.sights'],
    lat: 37.9715,
    lon: 23.7257,
    datasource: { raw: { osm_id: 1, ...raw } },
    ...izmene
  }
});

test('parser OSM `opening_hours` — jednostavni oblici', async (t) => {
  await t.test('samo vreme, bez dana', () => {
    // Najcesci oblik u OSM-u za mesta koja rade svaki dan isto.
    assert.deepEqual(procitajRadnoVreme('09:00-17:00'), { open: '09:00', close: '17:00' });
  });

  await t.test('raspon dana pa vreme', () => {
    // „Mo-Su" i „Mo-Fr" su oblici koje parser sme da procita.
    assert.deepEqual(procitajRadnoVreme('Mo-Su 09:00-17:00'), { open: '09:00', close: '17:00' });
    assert.deepEqual(procitajRadnoVreme('Mo-Fr 08:30-16:00'), { open: '08:30', close: '16:00' });
  });

  await t.test('jednocifreni sat se dopunjuje nulom', () => {
    // Raspored radi sa oblikom HH:MM; „9:00" bi se leksikografski poredilo pogresno.
    assert.deepEqual(procitajRadnoVreme('9:00-17:00'), { open: '09:00', close: '17:00' });
  });

  await t.test('24/7 znaci ceo dan', () => {
    // Parkovi i trgovi su cesto `24/7`; procena po kategoriji bi ih bez potrebe zatvorila.
    assert.deepEqual(procitajRadnoVreme('24/7'), { open: '00:00', close: '24:00' });
    assert.deepEqual(procitajRadnoVreme('24 / 7'), { open: '00:00', close: '24:00' });
  });

  await t.test('24:00 je dozvoljeno samo kao kraj dana', () => {
    // Kraj radnog vremena u ponoc je normalan; pocetak u „24:00" nije vreme.
    assert.deepEqual(procitajRadnoVreme('18:00-24:00'), { open: '18:00', close: '24:00' });
    assert.equal(procitajRadnoVreme('24:00-06:00'), null);
  });

  await t.test('razmaci oko crtice se trpe', () => {
    // OSM unosi nisu jednoobrazni.
    assert.deepEqual(procitajRadnoVreme('Mo-Su 09:00 - 17:00'), { open: '09:00', close: '17:00' });
    assert.deepEqual(procitajRadnoVreme('  09:00-17:00  '), { open: '09:00', close: '17:00' });
  });

  await t.test('jedan dan bez raspona je dozvoljen', () => {
    // „Sa 10:00-14:00" je jednostavno pravilo, iako pokriva samo jedan dan.
    assert.deepEqual(procitajRadnoVreme('Sa 10:00-14:00'), { open: '10:00', close: '14:00' });
  });
});

test('parser OSM `opening_hours` — slozeni oblici se ODBIJAJU', async (t) => {
  /*
   * Bolje priznati „ne znam" nego pogresno procitati pravilo i poslati
   * korisnika pred zatvorena vrata. Plan tada koristi procenu po
   * kategoriji i oznacava je sa `openingHoursEstimated: true`.
   */
  const odbijaSe = [
    ['Mo-Fr 09:00-17:00; Sa 10:00-14:00', 'vise pravila razdvojenih tackom i zapetom'],
    ['Mo,We,Fr 09:00-17:00', 'spisak dana razdvojen zapetom'],
    ['Nov-Mar 08:30-15:00', 'sezona umesto dana'],
    ['Mo-Su 09:00-17:00; PH off', 'praznici'],
    ['Su off', 'dan kada je zatvoreno'],
    ['sunrise-sunset', 'vreme vezano za izlazak sunca'],
    ['Mo-Fr 09:00+', 'otvoren kraj'],
    ['Mo-Su 09:00-17:00; Su[1] off', 'prvi dan u mesecu'],
    ['week 01-20 09:00-17:00', 'nedelje u godini'],
    ['Easter off', 'Uskrs'],
    ['by appointment', 'samo po dogovoru']
  ];

  for (const [ulaz, zasto] of odbijaSe) {
    await t.test(`odbija: ${zasto}`, () => {
      assert.equal(procitajRadnoVreme(ulaz), null, `procitano: ${ulaz}`);
    });
  }

  await t.test('prazna i nepostojeca vrednost daju null', () => {
    // Vecina OSM objekata uopste nema `opening_hours`.
    assert.equal(procitajRadnoVreme(''), null);
    assert.equal(procitajRadnoVreme(null), null);
    assert.equal(procitajRadnoVreme(undefined), null);
  });

  await t.test('besmislen tekst daje null, ne gresku', () => {
    // Tag je slobodan tekst koji svako moze da upise.
    assert.equal(procitajRadnoVreme('radnim danima'), null);
    assert.equal(procitajRadnoVreme('25:00-99:99'), null);
  });
});

test('popularnost atrakcije iz signala izvora', async (t) => {
  await t.test('bez ikakvog signala ocena je 3.0', () => {
    // Osnovica znaci „ne znamo"; ista je kao kod OpenTripMap-a, pa su izvori uporedivi.
    assert.equal(oceniIzSignala({}, []), 3.0);
  });

  await t.test('veza ka Wikipediji donosi 0.8', () => {
    // Clanak na Wikipediji je najjaci signal prepoznatljivosti koji odgovor nosi.
    assert.equal(oceniIzSignala({ wikipedia: 'en:Acropolis of Athens' }, []), 3.8);
  });

  await t.test('samo Wikidata donosi 0.4 — slabiji signal od celog clanka', () => {
    // Wikidata unos ima i mnogo sitnih objekata; clanak trazi da je neko o njemu pisao.
    assert.equal(oceniIzSignala({ wikidata: 'Q131013' }, []), 3.4);
  });

  await t.test('Wikipedija i Wikidata se ne zbrajaju', () => {
    // Skoro svaki objekat sa clankom ima i Wikidata unos; zbrajanje bi dvaput nagradilo isto.
    assert.equal(oceniIzSignala({ wikipedia: 'en:X', wikidata: 'Q1' }, []), 3.8);
  });

  await t.test('UNESCO bastina donosi dodatnih 0.3', () => {
    // `heritage` kategorija je nezavisan signal od veze ka clanku.
    assert.equal(oceniIzSignala({}, ['heritage.unesco']), 3.3);
    assert.equal(oceniIzSignala({ wikipedia: 'en:X' }, ['heritage.unesco']), 4.1);
  });

  await t.test('ocena nikada ne prelazi 4.5', () => {
    // Bez stvarnih ocena posetilaca najvisa ocena bila bi obecanje koje podaci ne pokrivaju.
    const najvisa = oceniIzSignala({ wikipedia: 'en:X', wikidata: 'Q1' }, ['heritage.unesco', 'heritage']);

    assert.ok(najvisa <= 4.5, `dobijeno ${najvisa}`);
  });

  await t.test('ocena ima jednu decimalu', () => {
    // Prikaz ima jedno decimalno mesto; 3.7000000000000004 bi izgledalo kao greska.
    assert.equal(oceniIzSignala({ wikidata: 'Q1' }, ['heritage']), 3.7);
  });

  await t.test('prazan poziv ne rusi funkciju', () => {
    // Objekat bez `datasource.raw` postoji u odgovoru.
    assert.equal(oceniIzSignala(), 3.0);
  });
});

test('mapiranje Geoapify kategorija u nase', async (t) => {
  await t.test('poklapanje po prefiksu pokriva podgrupe', () => {
    // Kategorije su hijerarhijske: `tourism.sights` pokriva i `tourism.sights.memorial`.
    assert.deepEqual(adapter.kategorije(['tourism.sights.memorial'], MAPA), ['kultura']);
  });

  await t.test('tacno poklapanje radi', () => {
    // Osnovni slucaj.
    assert.deepEqual(adapter.kategorije(['entertainment.museum'], MAPA), ['muzeji']);
  });

  await t.test('nadgrupa NE pokriva podgrupu iz mape', () => {
    // `entertainment` nije muzej; inace bi svaki bioskop postao muzej.
    assert.deepEqual(adapter.kategorije(['entertainment'], MAPA), []);
  });

  await t.test('objekat moze da pripada vise nasih kategorija', () => {
    // Park sa crkvom je i priroda i kultura; obe treba da ga uzmu u obzir.
    const nase = adapter.kategorije(['leisure.park', 'religion.place_of_worship'], MAPA);

    assert.equal(nase.length, 2);
    assert.ok(nase.includes('priroda'));
    assert.ok(nase.includes('kultura'));
  });

  await t.test('ista kategorija se ne ponavlja', () => {
    // Dva Geoapify kljuca mogu da vode istoj nasoj kategoriji.
    assert.deepEqual(adapter.kategorije(['tourism.sights', 'tourism.attraction'], MAPA), ['kultura']);
  });

  await t.test('bez mape nema kategorija', () => {
    // Kada baza ne da mapiranje, atrakcija ostaje bez kategorije, a ne pogodi slucajnu.
    assert.deepEqual(adapter.kategorije(['tourism.sights'], {}), []);
  });

  await t.test('kategorije za upit se spajaju u listu bez duplikata', () => {
    // Parametar `categories` ide u URL; ponovljena vrednost bi bila cist trosak.
    assert.equal(adapter.kategorijeZaUpit(['tourism.sights', 'tourism.sights', 'natural']), 'tourism.sights,natural');
  });

  await t.test('kategorije za upit prihvataju i nisku razdvojenu zapetama', () => {
    // Planner ih prosledjuje kroz parametar upita, gde su niska.
    assert.equal(adapter.kategorijeZaUpit('leisure.park, natural'), 'leisure.park,natural');
  });

  await t.test('bez zadatih kategorija koriste se podrazumevane', () => {
    // Adapter mora da radi i kada ga neko pozove direktno, bez Planner-a.
    const upit = adapter.kategorijeZaUpit(null);

    assert.ok(upit.length > 0);
    assert.ok(upit.includes('tourism.sights'));
  });
});

test('Geoapify feature u interni oblik atrakcije', async (t) => {
  await t.test('medjunarodni naziv ima prednost nad lokalnim', () => {
    // „Πλατεία Κοτζιά" korisniku u Srbiji ne znaci nista; lokalni naziv ostaje uz njega.
    const a = adapter.normalize(mesto(), { city: 'Atina', mapaKategorija: MAPA });

    assert.equal(a.name, 'Acropolis');
    assert.equal(a.nameLocal, 'Ακρόπολη');
  });

  await t.test('bez medjunarodnog naziva ostaje lokalni, bez prevodjenja', () => {
    // Naziv se ne izmislja; bolje lokalni zapis nego pogodjen prevod.
    const a = adapter.normalize(mesto({ name_international: undefined }), { mapaKategorija: MAPA });

    assert.equal(a.name, 'Ακρόπολη');
  });

  await t.test('oblik je isti kao kod OpenTripMap-a, pa Planner ne zna razliku', () => {
    // To je ceo smisao adaptera: Faza 3 radi isto bez obzira na izvor.
    const a = adapter.normalize(mesto(), { city: 'Atina', mapaKategorija: MAPA });

    for (const k of ['id', 'xid', 'name', 'categories', 'category', 'lat', 'lon', 'description', 'price', 'currency', 'rating', 'views', 'source']) {
      assert.ok(k in a, `nema polja ${k}`);
    }

    assert.equal(a.source, 'geoapify');
    assert.equal(a.id, 'GEO-PLACE_1');
    assert.equal(a.lat, 37.9715);
    assert.equal(a.price, 0);
    assert.equal(a.currency, 'EUR');
  });

  await t.test('radno vreme iz izvora ima prednost i nije procena', () => {
    // Kada izvor zna satnicu, procena po kategoriji je nepotrebna i losija.
    const a = adapter.normalize(mesto({}, { opening_hours: 'Mo-Su 08:00-19:30' }), { mapaKategorija: MAPA });

    assert.deepEqual(a.openingHours, { open: '08:00', close: '19:30' });
    assert.equal(a.openingHoursEstimated, false);
  });

  await t.test('slozeno radno vreme ostavlja polja praznim, da Planner proceni', () => {
    // Odsustvo polja je znak Planneru da postavi svoju procenu i oznaci je.
    const a = adapter.normalize(
      mesto({}, { opening_hours: 'Mo-Fr 09:00-17:00; Sa 10:00-14:00' }),
      { mapaKategorija: MAPA }
    );

    assert.equal('openingHours' in a, false);
    assert.equal('openingHoursEstimated' in a, false);
  });

  await t.test('veze za sliku i sajt se prenose', () => {
    // Slika se dobija preko Wikipedije; bez veze se prikazuje ikonica kategorije.
    const a = adapter.normalize(
      mesto({}, { wikipedia: 'en:Acropolis', wikidata: 'Q131013', website: 'https://acropolis.gr' }),
      { mapaKategorija: MAPA }
    );

    assert.equal(a.wikipedia, 'en:Acropolis');
    assert.equal(a.wikidata, 'Q131013');
    assert.equal(a.website, 'https://acropolis.gr');
  });

  await t.test('objekat bez koordinata daje NaN, pa ga pozivalac odbacuje', () => {
    // Atrakcija bez koordinata ne moze da ude u rutu; prepoznaje se po NaN vrednostima.
    const a = adapter.normalize(mesto({ lat: undefined, lon: undefined }), { mapaKategorija: MAPA });

    assert.ok(Number.isNaN(a.lat));
    assert.ok(Number.isNaN(a.lon));
  });

  await t.test('prazan feature ne rusi transformaciju', () => {
    // Odgovor izvora nije zagarantovan; adapter mora da izdrzi i prazan objekat.
    const a = adapter.normalize(null, {});

    assert.equal(a.source, 'geoapify');
    assert.equal(a.name, undefined);
  });
});

test('brojanje Geoapify kredita (1 kredit na 20 mesta)', async (t) => {
  t.beforeEach(() => krediti.ocisti());

  await t.test('20 mesta je jedan kredit', () => {
    // Cena je iz zvanicne dokumentacije; besplatni plan daje 3.000 kredita dnevno.
    assert.equal(krediti.MESTA_PO_KREDITU, 20);
    assert.equal(krediti.kreditiZa(20), 1);
  });

  await t.test('poziv se zaokruzuje na gore', () => {
    // Jedno mesto vise trazi ceo nov kredit, pa mora da se racuna kao dva.
    assert.equal(krediti.kreditiZa(1), 1);
    assert.equal(krediti.kreditiZa(21), 2);
    assert.equal(krediti.kreditiZa(120), 6);
  });

  await t.test('dnevni limit je 3.000 kredita', () => {
    // Granica besplatnog plana; iznad 80 % se upisuje upozorenje u log.
    assert.equal(krediti.DNEVNI_LIMIT, 3000);
  });

  await t.test('zabelezeni pozivi se zbrajaju', () => {
    // Bez zbrajanja se ne bi znalo kada se priblizava granica.
    krediti.zabelezi(120);
    krediti.zabelezi(120);

    const s = krediti.stanjeKredita();

    assert.equal(s.krediti, 12);
    assert.equal(s.poziva, 2);
  });

  await t.test('stanje prijavljuje i udeo dnevnog limita', () => {
    // Iz udela se odlucuje da li se pali upozorenje.
    krediti.zabelezi(20);
    const s = krediti.stanjeKredita();

    assert.equal(s.krediti, 1);
    assert.equal(s.limit, krediti.DNEVNI_LIMIT);
    assert.equal(s.udeo, Math.round((1 / krediti.DNEVNI_LIMIT) * 1000) / 1000);
  });

  await t.test('upozorenje ide iznad 80 % dnevnog limita', () => {
    // Prag je izabran tako da ostane vremena da se pozivi smanje pre nego sto ih Geoapify odbije.
    assert.equal(krediti.PRAG_UPOZORENJA, 0.8);

    const { udeo } = krediti.zabelezi(krediti.DNEVNI_LIMIT * krediti.MESTA_PO_KREDITU);

    assert.ok(udeo >= krediti.PRAG_UPOZORENJA, `udeo ${udeo}`);
  });

  await t.test('brisanje vraca brojac na nulu', () => {
    // Brojac se resetuje po danu; testovi koriste isti mehanizam.
    krediti.zabelezi(100);
    krediti.ocisti();

    assert.equal(krediti.stanjeKredita().krediti, 0);
  });
});
