/**
 * Provera adaptera bez pravih kljuceva: Duffel, LiteAPI, Frankfurter,
 * Nominatim i mock rezim.
 *
 *   npm run proba:adapteri
 *
 * Skripta sama pokrece lazni API (`lazni-api.js`) na slobodnom portu,
 * pusti adaptere preko njega i na kraju ga ugasi - nema drugog terminala
 * ni fiksnog porta koji moze da bude zauzet.
 *
 * Kes ide u zasebnu bazu `integration_test_db` koja se na kraju brise.
 */
const mongoose = require('mongoose');
const { pokreni, stanje } = require('./lazni-api');

const MONGO_TEST = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/integration_test_db';

let pali = 0;

const jednako = (sta, dobio, ocekivano) => {
  const ok = JSON.stringify(dobio) === JSON.stringify(ocekivano);

  console.log(`${ok ? 'OK  ' : 'PAD '} ${sta}: ${JSON.stringify(dobio)}`);
  if (!ok) {
    console.log(`     ocekivano: ${JSON.stringify(ocekivano)}`);
    pali += 1;
  }
};

const tacno = (sta, uslov, opis = '') => {
  console.log(`${uslov ? 'OK  ' : 'PAD '} ${sta}${opis ? `: ${opis}` : ''}`);
  if (!uslov) pali += 1;
};

/** Prekida probu kada nesto uopste nije stiglo. */
const mora = (sta, vrednost) => {
  if (vrednost === undefined || vrednost === null) {
    throw new Error(`${sta} nije pronadjeno - dalje provere nemaju smisla`);
  }

  return vrednost;
};

(async () => {
  const server = await pokreni();
  const osnova = `http://127.0.0.1:${server.address().port}`;

  console.log(`[PROBA] Lazni API na ${osnova}\n`);

  // Konfiguracija cita .env pri ucitavanju, pa adapteri moraju da se
  // zahtevaju TEK posle ovoga
  process.env.DUFFEL_API_BASE_URL = osnova;
  process.env.DUFFEL_API_KEY = 'lazni_duffel_kljuc';
  process.env.LITEAPI_API_BASE_URL = osnova;
  process.env.LITEAPI_API_KEY = 'lazni_liteapi_kljuc';
  process.env.FRANKFURTER_API_BASE_URL = osnova;
  process.env.NOMINATIM_API_BASE_URL = osnova;
  process.env.OPENTRIPMAP_API_BASE_URL = osnova;
  process.env.OPENTRIPMAP_API_KEY = 'lazni_otm_kljuc';
  process.env.WIKIPEDIA_API_BASE_URL = osnova;
  process.env.GEOAPIFY_API_BASE_URL = osnova;
  // 32 heksadecimalna znaka - adapter proverava OBLIK kljuca, ne samo
  // da postoji
  process.env.GEOAPIFY_API_KEY = 'a'.repeat(32);
  process.env.MONGODB_URI = MONGO_TEST;

  const DuffelFlightAdapter = require('../src/adapters/DuffelFlightAdapter');
  const LiteApiHotelAdapter = require('../src/adapters/LiteApiHotelAdapter');
  const FlightAdapter = require('../src/adapters/FlightAdapter');
  const { kursAdapter } = require('../src/adapters/FrankfurterExchangeAdapter');
  const { geokoder } = require('../src/adapters/NominatimGeocodeAdapter');
  const OpenTripMapAdapter = require('../src/adapters/OpenTripMapAdapter');
  const GeoapifyPlacesAdapter = require('../src/adapters/GeoapifyPlacesAdapter');
  const { procitajRadnoVreme } = require('../src/utils/radnoVreme');
  const krediti = require('../src/utils/geoapifyKrediti');
  const AttractionDetailsAdapter = require('../src/adapters/AttractionDetailsAdapter');
  const AttractionsAdapter = require('../src/adapters/AttractionsAdapter');
  const { pozivi } = require('./lazni-api');

  await mongoose.connect(MONGO_TEST);
  await mongoose.connection.dropDatabase();

  try {
    // ============================================================
    // 1. Frankfurter - konverzija i pad servisa
    // ============================================================
    console.log('--- Frankfurter ---');

    const kurs = await kursAdapter.fetch({ from: 'GBP', to: 'EUR' });
    jednako('source', kurs.source, 'frankfurter');
    jednako('GBP -> EUR (1 / 0.8)', kurs.data.rate, 1.25);
    jednako('260 GBP u EUR', await kursAdapter.uEur(260, 'GBP'), 325);
    jednako('EUR ostaje EUR bez poziva', await kursAdapter.uEur(99.456, 'EUR'), 99.46);

    // Kada Frankfurter padne, kes od 24 h i dalje drzi kurseve
    stanje.frankfurterPada = true;
    const izKesa = await kursAdapter.fetch({ from: 'USD', to: 'EUR' });
    jednako('pad servisa -> kes', izKesa.source, 'cache');

    // Bez kesa se pada na ugradjenu tabelu
    await mongoose.connection.db.collection('exchange_rates_cache').deleteMany({});
    const rezerva = await kursAdapter.fetch({ from: 'USD', to: 'EUR' });
    jednako('pad servisa bez kesa -> ugradjena tabela', rezerva.source, 'mock-fallback');
    stanje.frankfurterPada = false;

    // ============================================================
    // 2. Nominatim
    // ============================================================
    console.log('\n--- Nominatim ---');

    const grad = mora('Athens', await geokoder.grad('Athens', 'GR'));
    jednako('koordinate', [grad.lat, grad.lon], [37.9838, 23.7275]);
    jednako('drzava', grad.countryCode, 'GR');
    tacno('nepoznat grad -> null', (await geokoder.grad('Nepostojeci', 'XX')) === null);

    // ============================================================
    // 3. Duffel - pretraga povratnog leta
    // ============================================================
    console.log('\n--- Duffel: pretraga ---');

    const duffel = new DuffelFlightAdapter();
    const r1 = await duffel.fetch({
      from: 'BEG',
      to: 'ATH',
      checkIn: '2027-06-10',
      checkOut: '2027-06-14',
      passengers: 2
    });

    jednako('source', r1.source, 'duffel');
    jednako('broj ponuda', r1.data.length, 3);
    jednako('sortirano po ceni u EUR', r1.data[0].offerId, 'off_jeftina');

    const prva = mora('najjeftinija ponuda', r1.data[0]);
    jednako('cena', prva.price, 300);
    jednako('avio-kompanija', [prva.airline, prva.airlineIata], ['Duffel Airways', 'ZZ']);
    tacno('ponuda ima rok vazenja', Boolean(prva.expiresAt), prva.expiresAt);
    jednako('putnici iz ponude', prva.passengerIds, ['pas_0000001', 'pas_0000002']);

    jednako('odlazak: trajanje iz PT2H30M', prva.outbound.duration, 150);
    jednako('odlazak: bez presedanja', prva.outbound.stops, 0);
    jednako('povratak: trajanje izracunato bez `duration`', prva.inbound.duration, 240);
    jednako('povratak: jedno presedanje', prva.inbound.stops, 1);
    jednako('ukupno trajanje (oba smera)', prva.duration, 390);
    jednako('ukupno presedanja', prva.stops, 1);

    const uFuntama = mora('ponuda u GBP', r1.data.find((f) => f.currency === 'GBP'));
    jednako('cena u GBP ostaje', uFuntama.price, 260);
    jednako('priceEUR preracunat (260 / 0.8)', uFuntama.priceEUR, 325);

    // Jednosmerni let: bez checkOut-a nema druge noge
    const r2 = await duffel.fetch({
      from: 'BEG',
      to: 'ATH',
      checkIn: '2027-07-01',
      passengers: 1
    });
    jednako('jednosmerni -> bez povratka', r2.data[0].inbound, null);

    // Nula ponuda ne sme da obori pretragu
    stanje.duffelPraznePonude = true;
    const r3 = await duffel.fetch({
      from: 'BEG',
      to: 'ATH',
      checkIn: '2027-08-01',
      checkOut: '2027-08-05',
      passengers: 1
    });
    jednako('0 ponuda -> prazna lista', r3.data.length, 0);
    jednako('0 ponuda -> i dalje duffel', r3.source, 'duffel');
    stanje.duffelPraznePonude = false;

    // ============================================================
    // 4. Duffel - rezervacija (spec §4.8)
    // ============================================================
    console.log('\n--- Duffel: rezervacija ---');

    const ponovo = await duffel.ponuda('off_jeftina');
    jednako('ponovna provera cene', ponovo.data.price, 300);

    const skuplja = await duffel.ponuda('off_skuplja_sada');
    jednako('promenjena cena', skuplja.data.price, 355);

    let istekla = null;
    try {
      await duffel.ponuda('off_istekla');
    } catch (err) {
      istekla = err;
    }
    jednako('istekla ponuda -> 410', istekla?.statusCode, 410);
    jednako('istekla ponuda -> kod', istekla?.code, 'OFFER_EXPIRED');

    const putnik = {
      id: 'pas_0000001',
      title: 'mr',
      given_name: 'Ana',
      family_name: 'Anic',
      born_on: '1995-04-12',
      gender: 'f',
      email: 'ana@primer.test',
      phone_number: '+381601234567'
    };

    const narudzbina = await duffel.kreirajNarudzbinu({
      offerId: 'off_jeftina',
      passengers: [putnik],
      amount: 300,
      currency: 'EUR'
    });

    jednako('kod rezervacije', narudzbina.data.bookingReference, 'RTM3PC');
    jednako('id narudzbine', narudzbina.data.orderId, 'ord_0000001');

    let previse = null;
    try {
      await duffel.kreirajNarudzbinu({
        offerId: 'off_jeftina',
        passengers: Array.from({ length: 10 }, () => putnik),
        amount: 300,
        currency: 'EUR'
      });
    } catch (err) {
      previse = err;
    }
    jednako('10 putnika -> 422', previse?.statusCode, 422);
    tacno(
      '10 putnika -> poruka o vise delova',
      /vise delova/.test(previse?.message || ''),
      previse?.message
    );

    const otkazano = await duffel.otkaziNarudzbinu('ord_0000001');
    jednako('otkazivanje potvrdjeno', otkazano.data.cancelled, true);
    jednako('povracaj', otkazano.data.refundAmount, 300);

    // ============================================================
    // 5. LiteAPI
    // ============================================================
    console.log('\n--- LiteAPI ---');

    const hoteli = new LiteApiHotelAdapter();
    const h1 = await hoteli.fetch({
      city: 'Athens',
      countryCode: 'GR',
      checkIn: '2027-06-10',
      checkOut: '2027-06-14',
      guests: 2
    });

    jednako('source', h1.source, 'liteapi');
    jednako('hotel bez cene je izbacen', h1.data.length, 2);
    jednako('sortirano po ceni po noci', h1.data[0].id, 'lp9z8y7');

    const hermes = mora('Hotel Hermes', h1.data.find((h) => h.id === 'lp1a2b3'));
    jednako('tip', hermes.type, 'hotel');
    jednako('zvezdice', hermes.stars, 3);
    // LiteAPI ocenjuje 0-10, bodovanje ocekuje 0-5
    jednako('ocena svedena na skalu do 5 (8.6 / 2)', hermes.rating, 4.3);
    jednako('najniza cena od dve ponude', hermes.totalPrice, 400);
    jednako('cena po noci (400 / 4)', hermes.pricePerNight, 100);
    jednako('nepovratna ponuda', hermes.cancellation, 'Non-refundable');
    // 37.9838,23.7275 -> 37.9755,23.7348 = 1.12 km (racunato rucno)
    jednako('udaljenost od centra (Haversine)', hermes.distanceToCenter, 1.12);
    tacno('bookingUrl vodi na Booking.com pretragu',
      /booking\.com\/searchresults/.test(hermes.bookingUrl), hermes.bookingUrl);
    tacno('bookingUrl nosi datume i goste',
      /checkin=2027-06-10/.test(hermes.bookingUrl) && /group_adults=2/.test(hermes.bookingUrl));

    const studio = mora('Acropolis Studios', h1.data.find((h) => h.id === 'lp9z8y7'));
    jednako('apartman prepoznat iz hotelType', studio.type, 'apartman');
    jednako('hotel bez ocene -> null', studio.rating, null);

    // ============================================================
    // 6. Mock rezim (bez kljuceva)
    // ============================================================
    console.log('\n--- Mock rezim ---');

    const mock = new FlightAdapter();
    const m1 = mock.ucitajIFiltriraj({
      from: 'BEG',
      to: 'ATH',
      checkIn: '2027-06-10',
      checkOut: '2027-06-14',
      passengers: 2
    });

    tacno('mock vraca povratne ponude', m1.length > 0 && Boolean(m1[0].inbound));
    jednako('mock: datum odlaska pomeren', m1[0].outbound.departure.slice(0, 10), '2027-06-10');
    jednako('mock: datum povratka pomeren', m1[0].inbound.departure.slice(0, 10), '2027-06-14');

    const mockPonuda = mock.ponuda(m1[0].offerId);
    jednako('mock: ponovna provera daje istu cenu', mockPonuda.price, m1[0].price);
    jednako('mock: granicni slucaj promene cene',
      mock.ponuda(`${m1[0].offerId}_pricechange`).price, m1[0].price + 25);
    tacno('mock: granicni slucaj istekle ponude',
      new Date(mock.ponuda(`${m1[0].offerId}_expired`).expiresAt) < new Date());

    const AccommodationAdapter = require('../src/adapters/AccommodationAdapter');
    const mockSmestaj = new AccommodationAdapter().ucitajIFiltriraj({
      city: 'Athens',
      checkIn: '2027-06-10',
      checkOut: '2027-06-14',
      guests: 2
    });

    tacno('mock smestaj ima tip iz spec §4.4',
      mockSmestaj.every((s) => ['hotel', 'apartman', 'hostel'].includes(s.type)),
      [...new Set(mockSmestaj.map((s) => s.type))].join(', '));
    tacno('mock smestaj ima bookingUrl', mockSmestaj.every((s) => Boolean(s.bookingUrl)));

    // ============================================================
    // 7. Mock atrakcije: dovoljno ih je i pokrivaju sva interesovanja
    // ============================================================
    console.log('\n--- Mock atrakcije ---');

    const atrakcije = new AttractionsAdapter().ucitajIFiltriraj({ city: 'Athens' });

    tacno('Atina ima bar 45 atrakcija', atrakcije.length >= 45, String(atrakcije.length));

    const INTERESOVANJA = ['kultura', 'priroda', 'gastronomija', 'nocni_zivot', 'soping', 'muzeji'];
    const poInteresovanju = Object.fromEntries(
      INTERESOVANJA.map((i) => [i, atrakcije.filter((a) => a.categories.includes(i)).length])
    );

    tacno(
      'svako interesovanje ima bar 5 mesta',
      INTERESOVANJA.every((i) => poInteresovanju[i] >= 5),
      JSON.stringify(poInteresovanju)
    );

    // Centar Atine (Sintagma); sve mora da bude u krugu od 30 km
    const uKm = (a, b) => {
      const R = 6371;
      const r = (x) => (x * Math.PI) / 180;
      const dLat = r(b.lat - a.lat);
      const dLon = r(b.lon - a.lon);
      const h =
        Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const centar = { lat: 37.9755, lon: 23.7348 };
    const najdalja = Math.max(...atrakcije.map((a) => uKm(centar, a)));

    tacno('sve atrakcije su u krugu od 30 km', najdalja <= 30, `najdalja ${najdalja.toFixed(1)} km`);

    tacno(
      'izvor NE filtrira po interesovanjima',
      new AttractionsAdapter().ucitajIFiltriraj({ city: 'Athens', interests: 'muzeji' }).length ===
        atrakcije.length
    );

    tacno(
      'cena postoji samo tamo gde je ulaz besplatan',
      atrakcije.every((a) => a.price === undefined || a.price === 0)
    );

    // ============================================================
    // 8. OpenTripMap: dva upita, bez duplikata, limit iz potrebe
    // ============================================================
    console.log('\n--- OpenTripMap (§1.2) ---');

    const otm = new OpenTripMapAdapter();

    jednako('limit bez cilja je donja granica', otm.limitIzPotrebe(undefined), 60);
    jednako('limit za 84 aktivnosti je odsecen na 200', otm.limitIzPotrebe(84), 200);
    jednako('limit za 30 aktivnosti je 3 x 30', otm.limitIzPotrebe(30), 90);

    pozivi.length = 0;
    const otmRezultat = await otm.fetch({ city: 'Athens', countryCode: 'GR', targetCount: 21 });

    const radiusPozivi = pozivi.filter((p) => p.path === '/places/radius');

    jednako('dva radius upita', radiusPozivi.length, 2);
    jednako('drugi upit trazi opste znamenitosti', radiusPozivi[1].params.kinds, 'interesting_places');
    jednako('limit je poslat iz potrebe', radiusPozivi[0].params.limit, '63');

    const xidovi = otmRezultat.data.map((a) => a.id);
    jednako('nema duplikata po xid-u', xidovi.length, new Set(xidovi).size);
    tacno('spojena su oba upita', otmRezultat.data.length > 40, String(otmRezultat.data.length));

    // Malo objekata -> jos jedan upit sa vecim poluprecnikom
    await mongoose.connection.db.collection('attractions_cache').deleteMany({});
    stanje.otmPoUpitu = 5;
    pozivi.length = 0;

    await otm.fetch({ city: 'Athens', countryCode: 'GR', targetCount: 21 });

    const uzi = pozivi.filter((p) => p.path === '/places/radius');

    jednako('kad nema dovoljno, ide treci upit', uzi.length, 3);
    tacno(
      'treci upit ima veci poluprecnik',
      Number(uzi[2].params.radius) > Number(uzi[0].params.radius),
      `${uzi[0].params.radius} -> ${uzi[2].params.radius}`
    );

    stanje.otmPoUpitu = 40;

    // ============================================================
    // 9. Detalji atrakcije: slika, rezerva, kes
    // ============================================================
    console.log('\n--- Detalji i slike ---');

    const detalji = new AttractionDetailsAdapter();

    const [saSlikom] = await detalji.detalji(['OTM-Q_sa_slikom']);
    mora('detalj sa slikom', saSlikom);
    // Wikimedia odbija direktan zahtev za nestandardnu sirinu (400), pa
    // se 320 px prevodi u prvu standardnu preko 400 - 500 px
    jednako('slika iz OpenTripMap preview-a, standardne sirine', saSlikom.image?.url,
      'https://upload.wikimedia.org/thumb/500px-Slika.jpg');
    jednako('potpis slike', saSlikom.image?.credit, 'Wikimedia Commons');

    const [bezPreview] = await detalji.detalji(['OTM-Q_bez_slike']);
    tacno('rezerva preko Wikipedia summary-ja',
      String(bezPreview.image?.url || '').includes('upload.wikimedia.org'),
      bezPreview.image?.url || 'nema');

    const [bezIcega] = await detalji.detalji(['OTM-Q_bez_icega']);
    jednako('bez slike -> image je null', bezIcega.image, null);

    const [pao] = await detalji.detalji(['OTM-Q_pada']);
    jednako('greska jednog id-ja ne obara odgovor', pao.image, null);

    const zajedno = await detalji.detalji(['OTM-Q_bez_icega', 'OTM-Q_pada', 'OTM-Q_sa_slikom']);
    jednako('ostali id-jevi i dalje stizu', zajedno.length, 3);

    pozivi.length = 0;
    await detalji.detalji(['OTM-Q_sa_slikom']);
    jednako('drugi poziv za isti id ide iz kesa',
      pozivi.filter((p) => p.path.startsWith('/places/xid/')).length, 0);

    const [mockDetalj] = await detalji.detalji(['ATR001']);
    tacno('mock atrakcija dobija sliku preko naslova clanka',
      String(mockDetalj.image?.url || '').includes('upload.wikimedia.org'),
      mockDetalj.image?.url || 'nema');
    tacno('opis mock atrakcije ostaje na srpskom',
      /Utvr/.test(mockDetalj.description), mockDetalj.description);
    // ============================================================
    // kes sa ponudom koja samo sto nije istekla
    // ============================================================
    console.log('\n--- Kes letova i rok ponude ---');

    const { ponudeSuUpotrebljive } = require('../src/utils/ponude');

    const zaMinuta = (m) => [{ expiresAt: new Date(Date.now() + m * 60000).toISOString() }];

    jednako('ponuda koja istice za 1 min nije upotrebljiva',
      ponudeSuUpotrebljive(zaMinuta(1)), false);
    jednako('ponuda koja istice za 10 min jeste',
      ponudeSuUpotrebljive(zaMinuta(10)), true);
    jednako('dovoljna je JEDNA skora da se zapis odbaci',
      ponudeSuUpotrebljive([...zaMinuta(10), ...zaMinuta(1)]), false);
    jednako('ponuda bez roka se ne odbacuje', ponudeSuUpotrebljive([{}]), true);

    // Kroz sam adapter: zapis u kesu sa ponudom pred istek -> nova pretraga
    const mockLetovi = new FlightAdapter();
    const upit = { from: 'BEG', to: 'ATH', checkIn: '2027-06-10', checkOut: '2027-06-14', passengers: 2 };

    await mongoose.connection.db.collection('flights_cache').deleteMany({});
    const prvi = await mockLetovi.fetch(upit);
    jednako('prva pretraga nije iz kesa', prvi.cached, false);

    const drugi = await mockLetovi.fetch(upit);
    jednako('druga pretraga jeste iz kesa', drugi.cached, true);

    // Rucno se skrati rok svim ponudama u kesu
    const zapis = await mongoose.connection.db.collection('flights_cache').findOne({});
    const skracene = zapis.data.map((p) => ({
      ...p,
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString()
    }));

    await mongoose.connection.db
      .collection('flights_cache')
      .updateOne({ _id: zapis._id }, { $set: { data: skracene } });

    const treci = await mockLetovi.fetch(upit);
    jednako('zapis sa ponudom pred istek se NE koristi', treci.cached, false);
    tacno('nova pretraga vraca vazece ponude',
      ponudeSuUpotrebljive(treci.data), String(treci.data.length));

    // ============================================================
    // Geoapify Places
    // ============================================================
    console.log('\n--- Geoapify: parser radnog vremena ---');

    jednako('jednostavan raspon sa danima', procitajRadnoVreme('Mo-Su 09:00-17:00'), {
      open: '09:00',
      close: '17:00'
    });
    jednako('raspon bez dana', procitajRadnoVreme('08:30-15:00'), {
      open: '08:30',
      close: '15:00'
    });
    jednako('jednocifran sat se dopunjuje', procitajRadnoVreme('9:00-17:00'), {
      open: '09:00',
      close: '17:00'
    });
    jednako('24/7 je ceo dan', procitajRadnoVreme('24/7'), { open: '00:00', close: '24:00' });

    for (const slozeno of [
      'Nov-Mar 08:30-15:00',
      'Mo-Fr 09:00-17:00; Sa 10:00-14:00',
      '"on appointment"',
      'Mo-Su 09:00-17:00; PH off',
      'sunrise-sunset',
      'Mo-Su 09:00+',
      ''
    ]) {
      jednako(`slozeno se odbija: ${slozeno || '(prazno)'}`, procitajRadnoVreme(slozeno), null);
    }

    console.log('\n--- Geoapify: transformacija odgovora ---');

    const geo = new GeoapifyPlacesAdapter();
    const upitGeo = {
      city: 'Athens',
      lat: 37.98,
      lon: 23.72,
      targetCount: 12,
      interests: ['kultura'],
      geoCategories: ['tourism.sights'],
      categoryMap: { kultura: ['tourism.sights'], muzeji: ['entertainment.museum'] }
    };

    krediti.ocisti();
    const rezGeo = await geo.fetch(upitGeo);

    jednako('izvor je geoapify', rezGeo.source, 'geoapify');

    const imena = rezGeo.data.map((a) => a.name);

    tacno('objekat bez imena je preskocen', !imena.includes(undefined) && !imena.includes(null));
    tacno(
      'objekat bez koordinata je preskocen',
      rezGeo.data.every((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon)),
      `${rezGeo.data.length} objekata`
    );
    tacno(
      'uzet je medjunarodni naziv',
      imena.includes('Geo place 0'),
      imena.slice(0, 2).join(', ')
    );

    const geoPrvi = mora('objekat sa Wikipedijom', rezGeo.data.find((a) => a.wikipedia));

    jednako('Wikipedia veza podize ocenu', geoPrvi.rating, 3.8);
    jednako('radno vreme iz izvora je procitano', geoPrvi.openingHours, {
      open: '08:00',
      close: '19:00'
    });
    jednako('i oznaceno kao NIJE procena', geoPrvi.openingHoursEstimated, false);

    const samoWikidata = mora(
      'objekat samo sa wikidatom',
      rezGeo.data.find((a) => !a.wikipedia && a.wikidata)
    );
    jednako('sama wikidata nosi manji dodatak', samoWikidata.rating, 3.4);

    const bastina = rezGeo.data.find((a) => a.categories.length === 0 && a.id.includes('geo_5'));
    tacno('UNESCO bastina je prepoznata', !bastina || bastina.rating >= 3.3);

    const slozenoVreme = mora(
      'objekat sa slozenim radnim vremenom',
      rezGeo.data.find((a) => a.id === 'GEO-geo_2')
    );
    jednako('slozeno radno vreme se ne cita', slozenoVreme.openingHours, undefined);

    tacno(
      'objekti sa wiki vezom idu prvi',
      Boolean(rezGeo.data[0].wikipedia || rezGeo.data[0].wikidata),
      rezGeo.data[0].name
    );

    jednako('kategorije su mapirane na nase', geoPrvi.categories, ['kultura']);
    jednako('`source` je upisan u zapis', geoPrvi.source, 'geoapify');

    console.log('\n--- Geoapify: dnevni limit ---');

    const stanjeKredita = krediti.stanjeKredita();

    jednako('20 mesta je 1 kredit', krediti.kreditiZa(20), 1);
    jednako('120 mesta je 6 kredita', krediti.kreditiZa(120), 6);
    tacno('poziv je zabelezen', stanjeKredita.poziva >= 1, `${stanjeKredita.poziva} poziva`);
    tacno(
      'krediti su prebrojani',
      stanjeKredita.krediti >= 1,
      `${stanjeKredita.krediti} od ${stanjeKredita.limit}`
    );

    console.log('\n--- Geoapify: granicni slucajevi ---');

    stanje.geoPrazno = true;
    await mongoose.connection.collection('attractions_cache').deleteMany({});

    const prazno = await geo.fetch({ ...upitGeo, city: 'PrazanGrad' });

    jednako('prazan odgovor ne ruši adapter', Array.isArray(prazno.data), true);
    jednako('prazan odgovor ostaje geoapify izvor', prazno.source, 'geoapify');
    stanje.geoPrazno = false;

    for (const [kod, opis] of [
      [401, 'nevazeci kljuc'],
      [429, 'dnevni limit']
    ]) {
      stanje.geoGreska = kod;
      await mongoose.connection.collection('attractions_cache').deleteMany({});

      const pao = await geo.fetch({ ...upitGeo, city: `Greska${kod}` });

      jednako(`${kod} (${opis}) -> mock-fallback`, pao.source, 'mock-fallback');
      tacno(`${kod} ipak vraca podatke`, Array.isArray(pao.data), `${pao.data.length} zapisa`);
    }

    stanje.geoGreska = 0;

  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    server.close();
  }

  console.log(`\n${pali === 0 ? 'SVE PROVERE PROLAZE' : `PALO PROVERA: ${pali}`}`);
  process.exit(pali === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nPROBA NIJE ZAVRSENA:', err.message);
  process.exit(1);
});
