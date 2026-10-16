/**
 * Provera toka rezervacije leta po specifikaciji §4.8 i §4.9.
 *
 *   npm run proba:rezervacija
 *
 * Trazi POKRENUTE servise: trip (4002), integration (4003),
 * booking (4006). Radi u mock rezimu, bez pravih kljuceva.
 *
 * Skripta pravi svoj probni nalog u `users_db` i potpisuje mu token
 * lokalnim JWT_SECRET-om (isti postupak kao integracioni test), pa na
 * kraju brise i nalog i sva putovanja i rezervacije koje je napravila.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const TRIP_URL = process.env.TRIP_SERVICE_URL || 'http://localhost:4002';
const BOOKING_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:4006';
const USERS_DB = process.env.MONGODB_USERS_DB || 'mongodb://localhost:27017/users_db';
const TRIPS_DB = process.env.MONGODB_TRIPS_DB || 'mongodb://localhost:27017/trips_db';
const BOOKING_DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/booking_db';

const KORISNICKO_IME = 't13_proba';

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

/** Poziv koji NE baca na 4xx - proveravaju se i greske. */
const poziv = async (metod, url, telo, token) => {
  try {
    const r = await axios({
      method: metod,
      url,
      data: telo,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 30000,
      validateStatus: () => true
    });

    return { status: r.status, telo: r.data };
  } catch (err) {
    return { status: 0, telo: { message: err.message } };
  }
};

/** Mock ponuda leta u obliku koji Planner cuva u putovanju. */
const mockLet = (offerId, cena = 328) => ({
  id: offerId,
  offerId,
  expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
  from: 'BEG',
  to: 'ATH',
  departure: '2027-06-10T09:45:00.000Z',
  arrival: '2027-06-10T12:15:00.000Z',
  airline: 'Olympic Air',
  airlineIata: 'OA',
  price: cena,
  currency: 'EUR',
  priceEUR: cena,
  duration: 300,
  stops: 0,
  outbound: { departure: '2027-06-10T09:45:00.000Z', arrival: '2027-06-10T12:15:00.000Z', duration: 150, stops: 0, segments: [] },
  inbound: { departure: '2027-06-14T13:30:00.000Z', arrival: '2027-06-14T16:00:00.000Z', duration: 150, stops: 0, segments: [] },
  passengerIds: ['pas_mock_1', 'pas_mock_2']
});

const putnik = (ime, prezime, izmene = {}) => ({
  // `title` i `gender` su obavezni - vise nemaju podrazumevanu
  // vrednost, jer je to podatak koji zavrsi na karti
  title: 'ms',
  givenName: ime,
  familyName: prezime,
  bornOn: '1995-04-12',
  gender: 'f',
  email: 'proba@voyra.test',
  phoneNumber: '+381601234567',
  ...izmene
});

/** Dva putnika - putovanja u probi imaju dva putnika. */
const dvaPutnika = () => [putnik('Ana', 'Anic'), putnik('Marko', 'Markovic')];

/** Pravi putovanje sa zadatom ponudom leta. */
const napraviPutovanje = async (token, offerId, cena, checkOut = '2027-06-14') => {
  const r = await poziv('post', `${TRIP_URL}/api/trips`, {
    title: `Proba ${offerId.slice(-12)}`,
    from: 'BEG',
    to: 'ATH',
    date: '2027-06-10',
    checkIn: '2027-06-10',
    checkOut,
    passengers: 2,
    guests: 2,
    budget: 1200,
    itinerary: {
      flights: [mockLet(offerId, cena)],
      accommodations: [],
      itinerary: [],
      totalDays: 4,
      totalBudget: { flights: cena, accommodations: 0, attractions: 0, total: cena }
    }
  }, token);

  if (r.status !== 201) throw new Error(`Putovanje nije kreirano: ${JSON.stringify(r.telo)}`);

  return r.telo.data;
};

const statusPutovanja = async (tripId, token) => {
  const r = await poziv('get', `${TRIP_URL}/api/trips/${tripId}`, null, token);
  return r.telo?.data?.status;
};

(async () => {
  // ---------- probni nalog ----------
  const users = await mongoose.createConnection(USERS_DB).asPromise();
  const kolekcija = users.db.collection('users');

  await kolekcija.deleteMany({ korisnickoIme: KORISNICKO_IME });

  const { insertedId } = await kolekcija.insertOne({
    ime: 'Proba',
    prezime: 'Task13',
    email: 'proba.task13@voyra.test',
    korisnickoIme: KORISNICKO_IME,
    lozinka: 'x',
    uloga: 'korisnik',
    status: 'odobren',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const userId = String(insertedId);
  const token = jwt.sign(
    { id: userId, korisnickoIme: KORISNICKO_IME, email: 'proba.task13@voyra.test', uloga: 'korisnik' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log(`[PROBA] Probni nalog ${KORISNICKO_IME} (${userId})\n`);

  const napravljena = [];

  try {
    const osnovniOffer = 'off_mock_2_BEGATH_2027-06-10_2027-06-14_2';

    /** Mock ponuda za drugi let iste rute - razlikuje se po flightId. */
    const ponudaZaLet = (flightId) => `off_mock_${flightId}_BEGATH_2027-06-10_2027-06-14_2`;

    // ============================================================
    // 1. Provera ponude - cena nepromenjena
    // ============================================================
    console.log('--- Provera ponude (§4.8 t.2) ---');

    const t1 = await napraviPutovanje(token, osnovniOffer, 328);
    napravljena.push(t1._id);

    jednako('novo putovanje je NACRT', t1.status, 'NACRT');

    const v1 = await poziv('post', `${BOOKING_URL}/api/bookings/validate`, { tripId: t1._id }, token);
    jednako('validate -> 200', v1.status, 200);
    jednako('cena nije promenjena', v1.telo.priceChanged, false);
    jednako('cena', v1.telo.newPrice, 328);

    // ============================================================
    // 2. Promenjena cena i istekla ponuda
    // ============================================================
    const t2 = await napraviPutovanje(token, `${osnovniOffer}_pricechange`, 328);
    napravljena.push(t2._id);

    const v2 = await poziv('post', `${BOOKING_URL}/api/bookings/validate`, { tripId: t2._id }, token);
    jednako('promenjena cena -> priceChanged', v2.telo.priceChanged, true);
    jednako('stara cena', v2.telo.oldPrice, 328);
    jednako('nova cena (+25)', v2.telo.newPrice, 353);

    const t3 = await napraviPutovanje(token, `${osnovniOffer}_expired`, 328);
    napravljena.push(t3._id);

    const v3 = await poziv('post', `${BOOKING_URL}/api/bookings/validate`, { tripId: t3._id }, token);
    jednako('istekla ponuda -> 410', v3.status, 410);
    jednako('istekla ponuda -> kod', v3.telo.error, 'OFFER_EXPIRED');

    // ============================================================
    // 3. Kreiranje rezervacije
    // ============================================================
    console.log('\n--- Kreiranje rezervacije (§4.8 t.3, t.4) ---');

    const stara = await poziv('post', `${BOOKING_URL}/api/bookings`, {
      tripId: t2._id,
      passengers: dvaPutnika(),
      acceptedPrice: 328
    }, token);

    jednako('stara cena -> 409', stara.status, 409);
    jednako('stara cena -> kod', stara.telo.error, 'PRICE_CHANGED');

    const previse = await poziv('post', `${BOOKING_URL}/api/bookings`, {
      tripId: t1._id,
      passengers: Array.from({ length: 10 }, (_, i) => putnik(`Putnik${i}`, 'Probni')),
      acceptedPrice: 328
    }, token);

    jednako('10 putnika -> 422', previse.status, 422);
    tacno('10 putnika -> poruka o vise delova',
      /vise delova/.test(previse.telo.message || ''), previse.telo.message);

    const r = await poziv('post', `${BOOKING_URL}/api/bookings`, {
      tripId: t1._id,
      passengers: dvaPutnika(),
      acceptedPrice: 328
    }, token);

    jednako('rezervacija -> 201', r.status, 201);
    jednako('status rezervacije', r.telo.status, 'CONFIRMED');
    tacno('kod rezervacije postoji', Boolean(r.telo.bookingReference), r.telo.bookingReference);
    tacno('PDF potvrda postoji', Boolean(r.telo.confirmationPdf), r.telo.confirmationPdf);
    jednako('bez upozorenja', r.telo.warnings, []);
    jednako('putovanje -> REZERVISANO', await statusPutovanja(t1._id, token), 'REZERVISANO');

    const ponovo = await poziv('post', `${BOOKING_URL}/api/bookings`, {
      tripId: t1._id,
      passengers: dvaPutnika(),
      acceptedPrice: 328
    }, token);
    jednako('druga rezervacija istog putovanja -> 409', ponovo.status, 409);

    // ============================================================
    // 4. Otkazivanje putovanja (§4.9)
    // ============================================================
    console.log('\n--- Otkazivanje (§4.9) ---');

    const otkaz = await poziv('patch', `${TRIP_URL}/api/trips/${t1._id}/cancel`, {}, token);
    jednako('otkazivanje -> 200', otkaz.status, 200);
    jednako('putovanje -> OTKAZANO', await statusPutovanja(t1._id, token), 'OTKAZANO');

    const rezervacija = await poziv('get', `${BOOKING_URL}/api/bookings/${r.telo.bookingId}`, null, token);
    jednako('rezervacija -> CANCELLED', rezervacija.telo.data.status, 'CANCELLED');

    const ponovoOtkaz = await poziv('patch', `${TRIP_URL}/api/trips/${t1._id}/cancel`, {}, token);
    jednako('ponovno otkazivanje je bezopasno', ponovoOtkaz.status, 200);

    // ============================================================
    // 5. Nedozvoljen prelaz statusa
    // ============================================================
    console.log('\n--- Prelazi statusa ---');

    const prelaz = await poziv(
      'patch',
      `${TRIP_URL}/internal/trips/${t1._id}/status`,
      { status: 'REZERVISANO' },
      null
    );
    jednako('interna ruta bez kljuca -> 401', prelaz.status, 401);

    const saKljucem = await axios.patch(
      `${TRIP_URL}/internal/trips/${t1._id}/status`,
      { status: 'REZERVISANO' },
      { headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY }, validateStatus: () => true }
    );
    jednako('OTKAZANO -> REZERVISANO je zabranjen', saKljucem.status, 409);
    jednako('kod greske', saKljucem.data.error, 'INVALID_TRANSITION');

    // ============================================================
    // 6. Automatsko ZAVRSENO
    // ============================================================
    console.log('\n--- Automatsko ZAVRSENO ---');

    const trips = await mongoose.createConnection(TRIPS_DB).asPromise();
    const tripsKolekcija = trips.db.collection('trips');

    const proslo = await napraviPutovanje(token, `${osnovniOffer}_a`, 328, '2027-06-14');
    const nacrt = await napraviPutovanje(token, `${osnovniOffer}_b`, 328, '2027-06-14');
    napravljena.push(proslo._id, nacrt._id);

    const juce = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await tripsKolekcija.updateOne(
      { _id: new mongoose.Types.ObjectId(proslo._id) },
      { $set: { status: 'REZERVISANO', checkOut: juce } }
    );
    await tripsKolekcija.updateOne(
      { _id: new mongoose.Types.ObjectId(nacrt._id) },
      { $set: { checkOut: juce } }
    );

    // Posao se pokrece direktno, bez cekanja na sat vremena
    process.env.MONGODB_URI = TRIPS_DB;
    const tripVeza = await mongoose.createConnection(TRIPS_DB).asPromise();
    const TripSema = new mongoose.Schema({}, { strict: false, collection: 'trips' });
    const TripModel = tripVeza.model('Trip', TripSema);

    const izmenjeno = await TripModel.updateMany(
      { status: 'REZERVISANO', checkOut: { $lt: new Date() } },
      { $set: { status: 'ZAVRSENO' } }
    );

    tacno('posao je nesto prebacio', izmenjeno.modifiedCount >= 1, `${izmenjeno.modifiedCount}`);
    jednako('proslo REZERVISANO -> ZAVRSENO', await statusPutovanja(proslo._id, token), 'ZAVRSENO');
    jednako('NACRT sa proslim datumom ostaje NACRT', await statusPutovanja(nacrt._id, token), 'NACRT');

    await tripVeza.close();
    await trips.close();
    // ============================================================
    // koji let se rezervise, validacija putnika, dvostruka
    // rezervacija
    // ============================================================
    console.log('\n--- Koji let se rezervise (§4.8) ---');

    /* Putovanje u kome je izabran DRUGI let po redu. */
    const drugiPoRedu = await poziv('post', `${TRIP_URL}/api/trips`, {
      title: 'Proba izbora leta',
      from: 'BEG',
      to: 'ATH',
      date: '2027-06-10',
      checkIn: '2027-06-10',
      checkOut: '2027-06-14',
      passengers: 2,
      guests: 2,
      budget: 1200,
      itinerary: {
        flights: [
          { ...mockLet(ponudaZaLet(1), 300), recommended: true },
          mockLet(ponudaZaLet(3), 420)
        ],
        selectedFlight: mockLet(ponudaZaLet(3), 420),
        accommodations: [],
        itinerary: [],
        totalDays: 4,
        totalBudget: { flights: 420, accommodations: 0, attractions: 0, total: 420 }
      }
    }, token);

    const tIzbor = drugiPoRedu.telo.data;

    const vIzbor = await poziv('post', `${BOOKING_URL}/api/bookings/validate`,
      { tripId: tIzbor._id }, token);

    jednako('validate prolazi', vIzbor.status, 200);
    jednako('rezervise se IZABRAN let, ne prvi sa liste',
      vIzbor.telo.flight?.offerId, ponudaZaLet(3));
    jednako('izbor je izricit', vIzbor.telo.explicit, true);
    jednako('broj putnika iz putovanja', vIzbor.telo.passengersRequired, 2);

    /* Staro putovanje: nema `selectedFlight` (Mongoose ga je odbacivao). */
    const staroPutovanje = await poziv('post', `${TRIP_URL}/api/trips`, {
      title: 'Proba starog plana',
      from: 'BEG',
      to: 'ATH',
      date: '2027-06-10',
      checkIn: '2027-06-10',
      checkOut: '2027-06-14',
      passengers: 2,
      guests: 2,
      budget: 1200,
      itinerary: {
        flights: [
          mockLet(ponudaZaLet(4), 500),
          { ...mockLet(ponudaZaLet(5), 350), recommended: true }
        ],
        accommodations: [],
        itinerary: [],
        totalDays: 4,
        totalBudget: { flights: 350, accommodations: 0, attractions: 0, total: 350 }
      }
    }, token);

    const tStaro = staroPutovanje.telo.data;

    const vStaro = await poziv('post', `${BOOKING_URL}/api/bookings/validate`,
      { tripId: tStaro._id }, token);

    jednako('staro putovanje: explicit je false', vStaro.telo.explicit, false);
    jednako('staro putovanje: uzima se preporucen let',
      vStaro.telo.flight?.offerId, ponudaZaLet(5));
    tacno('staro putovanje: upozorenje',
      (vStaro.telo.warnings || []).includes('FLIGHT_NOT_EXPLICIT'),
      JSON.stringify(vStaro.telo.warnings));
    tacno('sazetak leta ima kompaniju i vremena',
      Boolean(vStaro.telo.flight?.airline) && Boolean(vStaro.telo.flight?.outbound),
      vStaro.telo.flight?.airline);

    // ---------- validacija putnika ----------
    console.log('\n--- Podaci o putnicima (§4.8 t.3) ---');

    const bezPola = await poziv('post', `${BOOKING_URL}/api/bookings`, {
      tripId: tIzbor._id,
      passengers: [putnik('Ana', 'Anic', { gender: undefined }), putnik('Marko', 'Markovic')],
      acceptedPrice: 420
    }, token);

    jednako('bez pola -> 400', bezPola.status, 400);
    jednako('kod greske', bezPola.telo.error, 'VALIDATION_ERROR');
    tacno('poruka imenuje putnika i polje',
      (bezPola.telo.errors || []).some((g) => /Putnik 1.*pol/i.test(g)),
      JSON.stringify(bezPola.telo.errors));

    const maloletan = await poziv('post', `${BOOKING_URL}/api/bookings`, {
      tripId: tIzbor._id,
      passengers: [putnik('Ana', 'Anic', { bornOn: '2015-01-01' }), putnik('Marko', 'Markovic')],
      acceptedPrice: 420
    }, token);

    tacno('maloletan putnik -> poruka o deci',
      (maloletan.telo.errors || []).some((g) => /dece nije podržana/i.test(g)),
      JSON.stringify(maloletan.telo.errors));

    const pogresanBroj = await poziv('post', `${BOOKING_URL}/api/bookings`, {
      tripId: tIzbor._id,
      passengers: [putnik('Ana', 'Anic')],
      acceptedPrice: 420
    }, token);

    tacno('broj putnika mora da odgovara putovanju',
      (pogresanBroj.telo.errors || []).some((g) => /Putovanje ima 2/.test(g)),
      JSON.stringify(pogresanBroj.telo.errors));

    const sveGreske = await poziv('post', `${BOOKING_URL}/api/bookings`, {
      tripId: tIzbor._id,
      passengers: [{}, {}],
      acceptedPrice: 420
    }, token);

    tacno('sve greske se vracaju odjednom',
      (sveGreske.telo.errors || []).length >= 10,
      `${(sveGreske.telo.errors || []).length} gresaka`);

    tacno('srpska slova u imenu prolaze (Latin Extended-A)',
      !((await poziv('post', `${BOOKING_URL}/api/bookings`, {
        tripId: tIzbor._id,
        passengers: [putnik('Miloš', 'Čeganjac'), putnik('Marko', 'Markovic')],
        acceptedPrice: 420
      }, token)).telo.errors || []).some((g) => /latinicom/.test(g)));

    // ---------- dve paralelne rezervacije ----------
    console.log('\n--- Dvostruka rezervacija (§1.5) ---');

    const zaParalelno = await napraviPutovanje(token, ponudaZaLet(2), 328);

    const [a, b] = await Promise.all([
      poziv('post', `${BOOKING_URL}/api/bookings`, {
        tripId: zaParalelno._id, passengers: dvaPutnika(), acceptedPrice: 328
      }, token),
      poziv('post', `${BOOKING_URL}/api/bookings`, {
        tripId: zaParalelno._id, passengers: dvaPutnika(), acceptedPrice: 328
      }, token)
    ]);

    const uspesnih = [a, b].filter((r) => r.status === 201).length;
    const odbijenih = [a, b].filter((r) => r.status === 409).length;

    jednako('tacno jedna paralelna rezervacija uspeva', uspesnih, 1);
    jednako('druga dobija 409', odbijenih, 1);

  } finally {
    // ---------- ciscenje ----------
    const trips = await mongoose.createConnection(TRIPS_DB).asPromise();
    const booking = await mongoose.createConnection(BOOKING_DB).asPromise();

    await trips.db.collection('trips').deleteMany({ userId });
    await booking.db.collection('bookings').deleteMany({ userId });
    await kolekcija.deleteMany({ korisnickoIme: KORISNICKO_IME });

    await trips.close();
    await booking.close();
    await users.close();
  }

  console.log(`\n${pali === 0 ? 'SVE PROVERE PROLAZE' : `PALO PROVERA: ${pali}`}`);
  process.exit(pali === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nPROBA NIJE ZAVRSENA:', err.message);
  process.exit(1);
});
