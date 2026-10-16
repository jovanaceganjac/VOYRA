/**
 * Integracione provere: koraci carobnjaka, cuvanje tacno
 * prikazanog plana, stare rute i prosledjivanje tela greske.
 *
 *   npm run proba:carobnjak
 *
 * Trazi POKRENUTE servise (gateway 4000 i sve iza njega). Radi u mock
 * rezimu. Pravi svoj probni nalog i brise ga na kraju.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const USERS_DB = process.env.MONGODB_USERS_DB || 'mongodb://localhost:27017/users_db';
const TRIPS_DB = process.env.MONGODB_TRIPS_DB || 'mongodb://localhost:27017/trips_db';

const KORISNICKO_IME = 't14_proba';

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

const mora = (sta, vrednost) => {
  if (vrednost === undefined || vrednost === null) {
    throw new Error(`${sta} nije pronadjeno - dalje provere nemaju smisla`);
  }
  return vrednost;
};

const poziv = async (metod, putanja, telo, token) => {
  const r = await axios({
    method: metod,
    url: `${GATEWAY}${putanja}`,
    data: telo,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 60000,
    validateStatus: () => true
  });

  return { status: r.status, telo: r.data, zaglavlja: r.headers };
};

const DATUMI = { checkIn: '2027-06-10', checkOut: '2027-06-14' };

(async () => {
  const users = await mongoose.createConnection(USERS_DB).asPromise();
  const kolekcija = users.db.collection('users');

  await kolekcija.deleteMany({ korisnickoIme: KORISNICKO_IME });

  const { insertedId } = await kolekcija.insertOne({
    ime: 'Proba',
    prezime: 'Task14',
    email: 'proba.task14@voyra.test',
    korisnickoIme: KORISNICKO_IME,
    lozinka: 'x',
    uloga: 'korisnik',
    status: 'odobren',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const userId = String(insertedId);
  const token = jwt.sign(
    {
      id: userId,
      korisnickoIme: KORISNICKO_IME,
      email: 'proba.task14@voyra.test',
      uloga: 'korisnik'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log(`[PROBA] Probni nalog ${KORISNICKO_IME}\n`);

  try {
    // ============================================================
    // 12. Koraci carobnjaka: letovi po prioritetu prevoza
    // ============================================================
    console.log('--- Korak 2: letovi (§4.3) ---');

    const preporuke = {};

    for (const prioritet of ['najjeftinije', 'najbrze', 'balans']) {
      const r = await poziv(
        'get',
        `/v1/flights?from=BEG&to=ATH&checkIn=${DATUMI.checkIn}&checkOut=${DATUMI.checkOut}` +
          `&passengers=2&transportPriority=${prioritet}`
      );

      const preporuka = mora(`preporuka za ${prioritet}`, r.telo.data.find((f) => f.recommended));
      preporuke[prioritet] = preporuka;

      jednako(`${prioritet}: tacno jedna preporuka`, r.telo.data.filter((f) => f.recommended).length, 1);
    }

    tacno(
      'najjeftinije i najbrze daju razlicite ponude',
      preporuke.najjeftinije.offerId !== preporuke.najbrze.offerId,
      `${preporuke.najjeftinije.airline} vs ${preporuke.najbrze.airline}`
    );
    tacno(
      'najjeftinije zaista bira najnizu cenu',
      preporuke.najjeftinije.price <= preporuke.najbrze.price
    );
    tacno(
      'najbrze zaista bira najkrace trajanje',
      preporuke.najbrze.duration <= preporuke.najjeftinije.duration
    );

    // Filteri (§4.3)
    const bezPresedanja = await poziv(
      'get',
      `/v1/flights?from=BEG&to=ATH&checkIn=${DATUMI.checkIn}&checkOut=${DATUMI.checkOut}&maxStops=0`
    );
    tacno(
      'filter maxStops=0 vraca samo direktne',
      bezPresedanja.telo.data.every((f) => (f.outbound?.stops ?? 0) === 0),
      `${bezPresedanja.telo.count} ponuda`
    );

    // ============================================================
    // 13. Korak 3: smestaj
    // ============================================================
    console.log('\n--- Korak 3: smestaj (§4.4) ---');

    const hosteli = await poziv(
      'get',
      `/v1/accommodations?to=ATH&checkIn=${DATUMI.checkIn}&checkOut=${DATUMI.checkOut}` +
        '&guests=2&accommodationTypes=hostel'
    );

    tacno(
      'accommodationTypes=hostel vraca samo hostele',
      hosteli.telo.data.length > 0 && hosteli.telo.data.every((s) => s.type === 'hostel'),
      hosteli.telo.data.map((s) => s.type).join(',')
    );
    jednako('tacno jedna preporuka', hosteli.telo.data.filter((s) => s.recommended).length, 1);

    // ============================================================
    // 14. Plan sa izborom
    // ============================================================
    console.log('\n--- Plan sa izabranim letom i smestajem ---');

    const sviLetovi = await poziv(
      'get',
      `/v1/flights?from=BEG&to=ATH&checkIn=${DATUMI.checkIn}&checkOut=${DATUMI.checkOut}&passengers=2`
    );
    const sviSmestaji = await poziv(
      'get',
      `/v1/accommodations?to=ATH&checkIn=${DATUMI.checkIn}&checkOut=${DATUMI.checkOut}&guests=2`
    );

    // Namerno se bira ponuda koja NIJE preporucena
    const izabranLet = mora('nepreporucen let', sviLetovi.telo.data.find((f) => !f.recommended));
    const izabranSmestaj = mora(
      'nepreporucen smestaj',
      sviSmestaji.telo.data.find((s) => !s.recommended)
    );

    const saIzborom = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      ...DATUMI,
      passengers: 2,
      budget: 3000,
      selectedFlightOfferId: izabranLet.offerId,
      selectedAccommodationId: izabranSmestaj.id
    });

    jednako('plan sa izborom -> 200', saIzborom.status, 200);
    jednako(
      'plan koristi izabran let',
      saIzborom.telo.itinerary.selectedFlight.offerId,
      izabranLet.offerId
    );
    jednako(
      'plan koristi izabran smestaj',
      saIzborom.telo.itinerary.selectedAccommodation.id,
      izabranSmestaj.id
    );

    const nepostojeci = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      ...DATUMI,
      passengers: 2,
      selectedFlightOfferId: 'off_ne_postoji'
    });

    jednako('nepostojeci izbor -> 410', nepostojeci.status, 410);
    jednako('kod greske', nepostojeci.telo.error, 'SELECTION_EXPIRED');

    // ============================================================
    // 15. Satnica
    // ============================================================
    console.log('\n--- Satnica (§4.6) ---');

    const plan = mora('plan', saIzborom.telo.itinerary);
    const dani = plan.itinerary;

    tacno('svaki dan ima raspolozivo vreme', dani.every((d) => d.availableFrom && d.availableTo));
    tacno(
      'svaka aktivnost ima pocetak i kraj',
      dani.every((d) => d.attractions.every((a) => a.startTime && a.endTime))
    );

    const prvi = dani[0];
    const dolazak = plan.selectedFlight.outbound.arrival.slice(11, 16);
    tacno(
      'prvi dan pocinje posle dolaska leta',
      prvi.availableFrom > dolazak,
      `let sleti ${dolazak}, dan pocinje ${prvi.availableFrom}`
    );

    const poslednji = dani[dani.length - 1];
    const povratak = plan.selectedFlight.inbound.departure.slice(11, 16);
    tacno(
      'poslednji dan se zavrsava pre povratnog leta',
      poslednji.availableTo < povratak,
      `dan do ${poslednji.availableTo}, let u ${povratak}`
    );

    tacno(
      'nijedna aktivnost ne prelazi kraj dana',
      dani.every((d) => d.attractions.every((a) => a.endTime <= d.availableTo))
    );

    tacno(
      'prelazi imaju nacin i trajanje kretanja',
      dani.every((d) => d.attractions.every((a) => a.travelMode && a.travelMinutes >= 0))
    );

    // ============================================================
    // 16-17. Ogranicenja i budzet
    // ============================================================
    console.log('\n--- Ogranicenja (§4.2) i budzet (§4.7) ---');

    const predugo = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      checkIn: '2027-06-10',
      checkOut: '2027-06-24',
      passengers: 2
    });

    jednako('15 dana -> 400', predugo.status, 400);
    tacno(
      'lista gresaka stigla kroz gateway',
      Array.isArray(predugo.telo.errors) && predugo.telo.errors.length > 0,
      JSON.stringify(predugo.telo.errors)
    );

    const mnogoPutnika = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      checkIn: '2027-06-10',
      checkOut: '2027-06-13',
      passengers: 12,
      budget: 6000
    });

    jednako('12 putnika -> plan se pravi', mnogoPutnika.status, 200);
    tacno(
      '12 putnika -> upozorenje o rezervaciji u vise delova',
      mnogoPutnika.telo.warnings.some((u) => /vise delova/.test(u)),
      JSON.stringify(mnogoPutnika.telo.warnings)
    );

    const malenBudzet = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      ...DATUMI,
      passengers: 2,
      budget: 200
    });

    jednako('mali budzet -> plan se i dalje vraca', malenBudzet.status, 200);
    jednako('overBudget je oznacen', malenBudzet.telo.itinerary.totalBudget.overBudget, true);
    tacno('overBy je izracunat', malenBudzet.telo.itinerary.totalBudget.overBy > 0);
    tacno(
      'nista nije odseceno - sve ponude su tu',
      malenBudzet.telo.itinerary.flights.length === sviLetovi.telo.count,
      `${malenBudzet.telo.itinerary.flights.length} ponuda`
    );
    tacno(
      'upozorenje o prekoracenju',
      malenBudzet.telo.warnings.some((u) => /premasuje budzet/.test(u))
    );

    // ============================================================
    // 18. Cuvanje tacno prikazanog plana
    // ============================================================
    console.log('\n--- Cuvanje sesije (§9) ---');

    const zaCuvanje = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      ...DATUMI,
      passengers: 2,
      budget: 3000
    });

    const sessionId = mora('sessionId', zaCuvanje.telo.planSessionId);
    const prikazaniLet = zaCuvanje.telo.itinerary.selectedFlight;

    const sacuvano = await poziv('post', `/v1/plan/${sessionId}/save`, {}, token);

    jednako('cuvanje -> 200', sacuvano.status, 200);
    jednako('nije bilo ranije sacuvano', sacuvano.telo.alreadySaved, false);

    const tripId = mora('savedTripId', sacuvano.telo.savedTripId);
    const putovanje = await poziv('get', `/api/trips/${tripId}`, null, token);

    const sacuvanLet = mora(
      'sacuvan let',
      putovanje.telo.data.itinerary.selectedFlight || putovanje.telo.data.itinerary.flights[0]
    );

    jednako('sacuvan je ISTI offerId', sacuvanLet.offerId, prikazaniLet.offerId);
    jednako('sacuvana je ISTA cena', sacuvanLet.price, prikazaniLet.price);
    tacno('preferencije su sacuvane uz putovanje', Boolean(putovanje.telo.data.preferences?.pace));

    const drugiPut = await poziv('post', `/v1/plan/${sessionId}/save`, {}, token);
    jednako('drugi poziv vraca isti tripId', drugiPut.telo.savedTripId, tripId);
    jednako('i kaze da je vec sacuvano', drugiPut.telo.alreadySaved, true);

    const bezPrijave = await poziv('post', `/v1/plan/${sessionId}/save`, {});
    jednako('cuvanje bez prijave -> 401', bezPrijave.status, 401);

    const nepostojecaSesija = await poziv('post', '/v1/plan/plan_nema/save', {}, token);
    jednako('nepostojeca sesija -> 404', nepostojecaSesija.status, 404);

    // ============================================================
    // 19. Stare rute i dalje rade
    // ============================================================
    console.log('\n--- Stare rute ---');

    const stariPlan = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      ...DATUMI,
      passengers: 2,
      budget: 1500
    });

    jednako('POST /v1/plan bez preferencija -> 200', stariPlan.status, 200);
    jednako(
      'koriscene su podrazumevane preferencije',
      stariPlan.telo.itinerary.preferences.pace,
      'umeren'
    );

    const stariTrips = await poziv('post', '/api/trips/plan', {
      from: 'BEG',
      to: 'ATH',
      date: DATUMI.checkIn,
      ...DATUMI,
      passengers: 2,
      budget: 1500
    });

    jednako('POST /api/trips/plan -> 200', stariTrips.status, 200);

    // ============================================================
    // 20. Gateway prosledjuje celo telo greske
    // ============================================================
    console.log('\n--- Gateway: telo greske (GAP 11) ---');

    // Telefon se vise ne potvrdjuje SMS kodom - rute za kod ne postoje
    const potvrdaKoda = await poziv('post', '/api/users/me/phone/verify', { code: '000000' }, token);

    jednako('ruta za SMS kod ne postoji -> 404', potvrdaKoda.status, 404);

    // Validaciona greska nosi listu poruka - provera da prolazi i kroz
    // /api/* (ne samo /v1/*)
    const losaRegistracija = await poziv('post', '/api/users/register', {
      ime: 'A',
      prezime: 'B',
      email: 'nije-email',
      korisnickoIme: 'x',
      lozinka: '123',
      lozinkaConfirm: '456'
    });

    tacno(
      '/api/* prosledjuje listu gresaka validacije',
      Array.isArray(losaRegistracija.telo.message) || Array.isArray(losaRegistracija.telo.errors),
      JSON.stringify(losaRegistracija.telo).slice(0, 160)
    );
  } finally {
    const trips = await mongoose.createConnection(TRIPS_DB).asPromise();

    await trips.db.collection('trips').deleteMany({ userId });
    await kolekcija.deleteMany({ korisnickoIme: KORISNICKO_IME });

    await trips.close();
    await users.close();
  }

  console.log(`\n${pali === 0 ? 'SVE PROVERE PROLAZE' : `PALO PROVERA: ${pali}`}`);
  process.exit(pali === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nPROBA NIJE ZAVRSENA:', err.message);
  process.exit(1);
});
