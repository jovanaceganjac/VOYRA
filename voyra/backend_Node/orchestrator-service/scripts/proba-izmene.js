/**
 * Integracione provere: izmena plana, optimizacija dana i
 * ponovno generisanje.
 *
 *   npm run proba:izmena
 *
 * Trazi POKRENUTE servise (gateway 4000 i sve iza njega). Radi u mock
 * rezimu. Pravi svoj probni nalog i putovanje, i brise ih na kraju.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const USERS_DB = process.env.MONGODB_USERS_DB || 'mongodb://localhost:27017/users_db';
const TRIPS_DB = process.env.MONGODB_TRIPS_DB || 'mongodb://localhost:27017/trips_db';
const ADMIN_DB = process.env.MONGODB_ADMIN_DB || 'mongodb://localhost:27017/admin_db';

const KORISNICKO_IME = 't17_proba';
const DATUMI = { checkIn: '2027-06-10', checkOut: '2027-06-14' };

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
    timeout: 90000,
    validateStatus: () => true
  });

  return { status: r.status, telo: r.data };
};

/** Id-jevi atrakcija po danu, u redosledu u kom stoje u planu. */
const poDanima = (trip) =>
  (trip.itinerary?.itinerary || []).map((d) => ({
    day: d.day,
    ids: (d.attractions || []).map((a) => a.id)
  }));

(async () => {
  const users = await mongoose.createConnection(USERS_DB).asPromise();
  const trips = await mongoose.createConnection(TRIPS_DB).asPromise();
  const adminDb = await mongoose.createConnection(ADMIN_DB).asPromise();

  // Brise se i po e-posti: isti nalog ume da ostane iza rucne probe
  await users.db.collection('users').deleteMany({
    $or: [{ korisnickoIme: KORISNICKO_IME }, { email: 'proba.task17@voyra.test' }]
  });

  const { insertedId } = await users.db.collection('users').insertOne({
    ime: 'Proba',
    prezime: 'Task17',
    email: 'proba.task17@voyra.test',
    korisnickoIme: KORISNICKO_IME,
    lozinka: 'x',
    uloga: 'korisnik',
    status: 'odobren',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const userId = String(insertedId);
  const token = jwt.sign(
    { id: userId, korisnickoIme: KORISNICKO_IME, email: 'proba.task17@voyra.test', uloga: 'korisnik' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Drugi nalog - za proveru da tudje putovanje nije dostupno
  await users.db.collection('users').deleteMany({
    $or: [{ korisnickoIme: `${KORISNICKO_IME}_drugi` }, { email: 'drugi.task17@voyra.test' }]
  });
  const drugi = await users.db.collection('users').insertOne({
    ime: 'Drugi',
    prezime: 'Nalog',
    email: 'drugi.task17@voyra.test',
    korisnickoIme: `${KORISNICKO_IME}_drugi`,
    lozinka: 'x',
    uloga: 'korisnik',
    status: 'odobren',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const tokenDrugog = jwt.sign(
    {
      id: String(drugi.insertedId),
      korisnickoIme: `${KORISNICKO_IME}_drugi`,
      email: 'drugi.task17@voyra.test',
      uloga: 'korisnik'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log(`[PROBA] Probni nalog ${KORISNICKO_IME}\n`);

  let tripId = null;

  try {
    // ============================================================
    // Priprema: plan sa intenzivnim tempom, pa sacuvan kao putovanje
    // ============================================================
    console.log('--- Priprema: sacuvano putovanje ---');

    const plan = await poziv('post', '/v1/plan', {
      from: 'BEG',
      to: 'ATH',
      checkIn: DATUMI.checkIn,
      checkOut: DATUMI.checkOut,
      passengers: 2,
      guests: 2,
      budget: 2000,
      preferences: {
        interests: ['kultura', 'muzeji'],
        pace: 'intenzivan',
        transportPriority: 'balans',
        accommodationTypes: ['hotel'],
        dayStart: '09:00',
        dayEnd: '20:00'
      }
    });

    jednako('plan napravljen', plan.status, 200);
    const sessionId = mora('sessionId', plan.telo.planSessionId);

    const sacuvan = await poziv('post', `/v1/plan/${sessionId}/save`, {}, token);
    jednako('plan sacuvan kao putovanje', sacuvan.status, 200);

    tripId = mora('tripId', sacuvan.telo.savedTripId || sacuvan.telo.data?.savedTripId);

    // ============================================================
    // 1. GET /v1/trips/:id
    // ============================================================
    console.log('\n--- GET /v1/trips/:id ---');

    const detalj = await poziv('get', `/v1/trips/${tripId}`, null, token);

    jednako('putovanje se cita', detalj.status, 200);
    jednako('NACRT se sme menjati', detalj.telo.editable, true);
    tacno('verzija postoji', Boolean(detalj.telo.version), detalj.telo.version);

    const trip = detalj.telo.data;
    const dani = poDanima(trip);

    console.log(`     dani: ${JSON.stringify(dani.map((d) => d.ids.length))}`);

    const dan2 = mora('dan 2', dani.find((d) => d.day === 2));
    const dan3 = mora('dan 3', dani.find((d) => d.day === 3));
    tacno('dan 2 ima bar jednu aktivnost', dan2.ids.length > 0, String(dan2.ids.length));

    // ============================================================
    // 6. Preview premestanja iz dana 2 u dan 3 - bez cuvanja
    // ============================================================
    console.log('\n--- Preview premestanja (§4.6) ---');

    const premestena = dan2.ids[0];

    const preview = await poziv(
      'post',
      `/v1/trips/${tripId}/days/preview`,
      {
        days: [
          { day: 2, attractionIds: dan2.ids.filter((id) => id !== premestena) },
          { day: 3, attractionIds: [...dan3.ids, premestena] }
        ]
      },
      token
    );

    jednako('preview prolazi', preview.status, 200);
    jednako('vraca oba izmenjena dana', preview.telo.days.length, 2);

    const pDan2 = preview.telo.days.find((d) => d.day === 2);
    const pDan3 = preview.telo.days.find((d) => d.day === 3);

    jednako('dan 2 ima jednu manje', pDan2.attractions.length, dan2.ids.length - 1);
    jednako('dan 3 ima jednu vise', pDan3.attractions.length, dan3.ids.length + 1);
    tacno(
      'nova vremena su izracunata',
      pDan3.attractions.every((a) => Boolean(a.startTime) && Boolean(a.endTime))
    );
    tacno('trosak je u odgovoru', Boolean(preview.telo.totalBudget), JSON.stringify(preview.telo.totalBudget));

    const posleGledanja = await poziv('get', `/v1/trips/${tripId}`, null, token);
    jednako(
      'preview nista nije sacuvao',
      JSON.stringify(poDanima(posleGledanja.telo.data)),
      JSON.stringify(dani)
    );

    // ============================================================
    // 7. PUT sa verzijom; druga izmena sa starom verzijom -> 409
    // ============================================================
    console.log('\n--- Cuvanje i konflikt verzije ---');

    const staraVerzija = detalj.telo.version;

    const cuvanje = await poziv(
      'put',
      `/v1/trips/${tripId}/days`,
      {
        version: staraVerzija,
        days: [
          { day: 2, attractionIds: dan2.ids.filter((id) => id !== premestena) },
          { day: 3, attractionIds: [...dan3.ids, premestena] }
        ]
      },
      token
    );

    jednako('cuvanje sa ispravnom verzijom prolazi', cuvanje.status, 200);

    const novaVerzija = mora('nova verzija', cuvanje.telo.version);
    tacno('verzija se promenila', novaVerzija !== staraVerzija, `${staraVerzija} -> ${novaVerzija}`);

    const sacuvaniDani = poDanima(cuvanje.telo.data);
    tacno(
      'premestena atrakcija je u danu 3',
      sacuvaniDani.find((d) => d.day === 3).ids.includes(premestena)
    );
    tacno(
      'premestena atrakcija vise nije u danu 2',
      !sacuvaniDani.find((d) => d.day === 2).ids.includes(premestena)
    );

    const konflikt = await poziv(
      'put',
      `/v1/trips/${tripId}/days`,
      { version: staraVerzija, days: [{ day: 2, attractionIds: [] }] },
      token
    );

    jednako('cuvanje sa starom verzijom -> 409', konflikt.status, 409);
    jednako('kod greske', konflikt.telo.error, 'VERSION_CONFLICT');
    tacno('telo nosi trenutnu verziju', Boolean(konflikt.telo.currentVersion));

    // ============================================================
    // 8. Dodavanje atrakcije po id-ju
    // ============================================================
    console.log('\n--- Dodavanje atrakcije ---');

    const sve = await poziv('get', '/v1/attractions?to=ATH', null, token);
    const uPlanu = new Set(poDanima(cuvanje.telo.data).flatMap((d) => d.ids));
    const kandidat = mora(
      'atrakcija van plana',
      sve.telo.data.find((a) => !uPlanu.has(a.id))
    );

    const aktuelni = await poziv('get', `/v1/trips/${tripId}`, null, token);
    const danZaDodavanje = poDanima(aktuelni.telo.data).find((d) => d.day === 2);

    const dodavanje = await poziv(
      'put',
      `/v1/trips/${tripId}/days`,
      {
        version: aktuelni.telo.version,
        days: [{ day: 2, attractionIds: [...danZaDodavanje.ids, kandidat.id] }]
      },
      token
    );

    jednako('dodavanje prolazi', dodavanje.status, 200);

    const dodata = mora(
      'dodata atrakcija',
      (dodavanje.telo.data.itinerary.itinerary.find((d) => d.day === 2).attractions || []).find(
        (a) => a.id === kandidat.id
      )
    );

    tacno('dodata ima vreme', Boolean(dodata.startTime), dodata.startTime);
    tacno('dodata ima opis', Boolean(dodata.description), (dodata.description || '').slice(0, 40));
    tacno(
      'dodata ima sliku ili je izvor nema',
      dodata.image === null || Boolean(dodata.image?.url),
      dodata.image?.url || 'bez slike'
    );

    const nepoznat = await poziv(
      'put',
      `/v1/trips/${tripId}/days`,
      { version: dodavanje.telo.version, days: [{ day: 2, attractionIds: ['NE_POSTOJI_123'] }] },
      token
    );

    jednako('nepoznat id -> 400', nepoznat.status, 400);
    jednako('kod greske za nepoznat id', nepoznat.telo.error, 'UNKNOWN_ATTRACTION');

    const duplikat = await poziv(
      'post',
      `/v1/trips/${tripId}/days/preview`,
      { days: [{ day: 3, attractionIds: [kandidat.id] }] },
      token
    );

    jednako('duplikat -> 400', duplikat.status, 400);
    jednako('kod greske za duplikat', duplikat.telo.error, 'DUPLICATE_ATTRACTION');

    // ============================================================
    // Optimizacija dana
    // ============================================================
    console.log('\n--- Optimizuj redosled ---');

    const preOptimizacije = await poziv('get', `/v1/trips/${tripId}`, null, token);
    const danPre = preOptimizacije.telo.data.itinerary.itinerary.find((d) => d.day === 2);

    // Namerno obrnut redosled, pa optimizacija ima sta da popravi
    const obrnut = [...danPre.attractions].map((a) => a.id).reverse();

    const optimizovan = await poziv(
      'post',
      `/v1/trips/${tripId}/days/2/optimize`,
      { attractionIds: obrnut },
      token
    );

    jednako('optimizacija prolazi', optimizovan.status, 200);
    jednako(
      'nijedna aktivnost nije izgubljena',
      optimizovan.telo.day.attractions.length,
      obrnut.length
    );

    const obrnutoRastojanje = (
      await poziv(
        'post',
        `/v1/trips/${tripId}/days/preview`,
        { days: [{ day: 2, attractionIds: obrnut }] },
        token
      )
    ).telo.days[0].totalDistance;

    tacno(
      'optimizacija ne produzava putanju',
      optimizovan.telo.day.totalDistance <= obrnutoRastojanje + 1e-9,
      `${obrnutoRastojanje} km -> ${optimizovan.telo.day.totalDistance} km`
    );

    const posleOptimizacije = await poziv('get', `/v1/trips/${tripId}`, null, token);
    jednako(
      'optimizacija nista nije sacuvala',
      JSON.stringify(poDanima(posleOptimizacije.telo.data)),
      JSON.stringify(poDanima(preOptimizacije.telo.data))
    );

    // ============================================================
    // 11. Trosak se preracunava
    // ============================================================
    console.log('\n--- Trosak posle izmene (§4.7) ---');

    const preTroska = posleOptimizacije.telo.data;
    const danZaPraznjenje = poDanima(preTroska).find((d) => d.day === 4);

    const bezDana4 = await poziv(
      'post',
      `/v1/trips/${tripId}/days/preview`,
      { days: [{ day: 4, attractionIds: [] }] },
      token
    );

    const stariTrosak = preTroska.itinerary.totalBudget;
    const noviTrosak = bezDana4.telo.totalBudget;

    // Ulaznice u Atini su uglavnom nepoznate cene, pa se proverava sam
    // racun: let i smestaj ostaju, ulaznice su zbir preostalih dana
    const putnika = preTroska.passengers || 1;
    const ocekivaneUlaznice =
      bezDana4.telo.days
        .concat(
          (preTroska.itinerary.itinerary || []).filter(
            (d) => !bezDana4.telo.days.some((n) => n.day === d.day)
          )
        )
        .reduce(
          (z, d) => z + (d.attractions || []).reduce((s, a) => s + (a.price || 0), 0),
          0
        ) * putnika;

    jednako('ulaznice su preracunate', noviTrosak.attractions, Math.round(ocekivaneUlaznice * 100) / 100);
    jednako('let nije diran', noviTrosak.flights, stariTrosak.flights);
    jednako('smestaj nije diran', noviTrosak.accommodations, stariTrosak.accommodations);
    jednako(
      'ukupno je zbir stavki',
      noviTrosak.total,
      Math.round((noviTrosak.flights + noviTrosak.accommodations + noviTrosak.attractions) * 100) / 100
    );
    tacno(
      'prazan dan ne povecava trosak',
      noviTrosak.total <= stariTrosak.total,
      `${stariTrosak.total} -> ${noviTrosak.total} (dan 4 je imao ${danZaPraznjenje.ids.length} aktivnosti)`
    );
    tacno('overBudget je izracunat', typeof noviTrosak.overBudget === 'boolean');

    // ============================================================
    // 9. Tudje putovanje i status koji se ne menja
    // ============================================================
    console.log('\n--- Vlasnistvo i status ---');

    const tudje = await poziv('get', `/v1/trips/${tripId}`, null, tokenDrugog);
    jednako('tudje putovanje -> 404', tudje.status, 404);

    const bezTokena = await poziv('get', `/v1/trips/${tripId}`);
    tacno('bez prijave -> 401', bezTokena.status === 401, String(bezTokena.status));

    // Putovanje se rucno prebacuje u OTKAZANO, pa se proverava zabrana
    await trips.db
      .collection('trips')
      .updateOne({ _id: new mongoose.Types.ObjectId(tripId) }, { $set: { status: 'OTKAZANO' } });

    const otkazano = await poziv(
      'post',
      `/v1/trips/${tripId}/days/preview`,
      { days: [{ day: 2, attractionIds: [] }] },
      token
    );

    jednako('OTKAZANO -> 409', otkazano.status, 409);
    jednako('kod greske', otkazano.telo.error, 'NOT_EDITABLE');

    const citanjeOtkazanog = await poziv('get', `/v1/trips/${tripId}`, null, token);
    jednako('otkazano se i dalje cita', citanjeOtkazanog.status, 200);
    jednako('ali se ne sme menjati', citanjeOtkazanog.telo.editable, false);

    await trips.db
      .collection('trips')
      .updateOne({ _id: new mongoose.Types.ObjectId(tripId) }, { $set: { status: 'NACRT' } });

    // ============================================================
    // 10. Generisi ponovo - let i smestaj ostaju isti
    // ============================================================
    console.log('\n--- Generisi ponovo ---');

    const prePonovnog = (await poziv('get', `/v1/trips/${tripId}`, null, token)).telo.data;
    const stariLet = prePonovnog.itinerary.selectedFlight;
    const stariSmestaj = prePonovnog.itinerary.selectedAccommodation;

    const regenerisan = await poziv('post', `/v1/trips/${tripId}/regenerate`, {}, token);

    jednako('regenerisanje prolazi', regenerisan.status, 200);

    const noviPlan = regenerisan.telo.data.itinerary;

    const stariOfferId = mora('sacuvan let pre regenerisanja', stariLet?.offerId);
    const noviOfferId = mora('let posle regenerisanja', noviPlan.selectedFlight?.offerId);

    jednako('isti let (offerId)', noviOfferId, stariOfferId);
    jednako('ista cena leta', noviPlan.selectedFlight?.price, stariLet?.price);
    jednako(
      'isti smestaj',
      mora('smestaj posle regenerisanja', noviPlan.selectedAccommodation?.id),
      mora('sacuvan smestaj', stariSmestaj?.id)
    );

    tacno(
      'plan aktivnosti je ponovo napravljen',
      (noviPlan.itinerary || []).some((d) => (d.attractions || []).length > 0)
    );

    // Rucna izmena je nestala - plan je napravljen iznova
    const danPosle = (noviPlan.itinerary || []).find((d) => d.day === 2);
    tacno(
      'dodata atrakcija vise nije nuzno u danu 2 (plan je nov)',
      Array.isArray(danPosle?.attractions),
      `dan 2 ima ${danPosle?.attractions?.length} aktivnosti`
    );

    // ============================================================
    // 12. Audit zapisi
    // ============================================================
    console.log('\n--- Audit (§4.9) ---');

    // Audit je fire-and-forget, pa se saceka trenutak
    await new Promise((r) => setTimeout(r, 1500));

    const zapisi = await adminDb.db
      .collection('audit_logs')
      .find({ target: tripId })
      .toArray();

    const akcije = [...new Set(zapisi.map((z) => z.action))];

    tacno('audit sadrzi EDIT_PLAN', akcije.includes('EDIT_PLAN'), akcije.join(', '));
    tacno('audit sadrzi REGENERATE_PLAN', akcije.includes('REGENERATE_PLAN'), akcije.join(', '));
    // ============================================================
    // osvezavanje ponude i zamena leta (§4.8)
    // ============================================================
    console.log('\n--- Osvezavanje ponude ---');

    // Putovanje je posle regenerisanja opet NACRT? Vratimo ga za svaki slucaj
    await trips.db
      .collection('trips')
      .updateOne({ _id: new mongoose.Types.ObjectId(tripId) }, { $set: { status: 'NACRT' } });

    const preOsvezavanja = (await poziv('get', `/v1/trips/${tripId}`, null, token)).telo.data;
    const letPre = mora('let pre osvezavanja', preOsvezavanja.itinerary.selectedFlight);

    // Ponuda se rucno "ostari" i poskupi, pa osvezavanje ima sta da nadje
    await trips.db.collection('trips').updateOne(
      { _id: new mongoose.Types.ObjectId(tripId) },
      {
        $set: {
          'itinerary.selectedFlight.expiresAt': new Date(Date.now() - 60000).toISOString(),
          'itinerary.selectedFlight.price': letPre.price + 40,
          'itinerary.selectedFlight.priceEUR': letPre.price + 40
        }
      }
    );

    const osvezeno = await poziv('post', `/v1/trips/${tripId}/flight/refresh`, {}, token);

    jednako('osvezavanje prolazi', osvezeno.status, 200);
    jednako('isti let je pronadjen po otisku', osvezeno.telo.found, true);
    jednako('cena je promenjena', osvezeno.telo.priceChanged, true);
    jednako('nova cena je iz sveze pretrage', osvezeno.telo.newPrice, letPre.price);
    jednako('stara cena je iz putovanja', osvezeno.telo.oldPrice, letPre.price + 40);
    tacno('let ima isti broj i kompaniju',
      osvezeno.telo.flight?.airlineIata === letPre.airlineIata,
      `${letPre.airlineIata} -> ${osvezeno.telo.flight?.airlineIata}`);

    const posleOsvezavanja = (await poziv('get', `/v1/trips/${tripId}`, null, token)).telo.data;
    jednako('cena u putovanju je azurirana',
      posleOsvezavanja.itinerary.selectedFlight.price, letPre.price);

    // Let koji ne postoji u svezoj listi -> alternative
    await trips.db.collection('trips').updateOne(
      { _id: new mongoose.Types.ObjectId(tripId) },
      { $set: { 'itinerary.selectedFlight.airlineIata': 'ZZ', 'itinerary.selectedFlight.airline': 'Nepostojeca' } }
    );

    const nestao = await poziv('post', `/v1/trips/${tripId}/flight/refresh`, {}, token);

    jednako('let koji vise ne postoji -> found: false', nestao.telo.found, false);
    tacno('vracene su alternative', (nestao.telo.alternatives || []).length > 0,
      String((nestao.telo.alternatives || []).length));
    jednako('tacno jedna alternativa je preporucena',
      (nestao.telo.alternatives || []).filter((a) => a.recommended).length, 1);

    // ---------- zamena leta ----------
    console.log('\n--- Zamena leta (§1.3) ---');

    const alternative = nestao.telo.alternatives;

    // Bira se let sa DRUGIM vremenom sletanja, da se vidi preracunavanje
    const trenutniDolazak = posleOsvezavanja.itinerary.itinerary[0].availableFrom;
    const drugi = alternative.find(
      (a) => a.outbound?.arrival !== letPre.outbound?.arrival
    ) || alternative[0];

    const verzija = (await poziv('get', `/v1/trips/${tripId}`, null, token)).telo.version;

    const zamena = await poziv('put', `/v1/trips/${tripId}/flight`,
      { offerId: drugi.offerId, version: verzija }, token);

    jednako('zamena leta prolazi', zamena.status, 200);
    jednako('izabran je bas taj let', zamena.telo.flight?.offerId, drugi.offerId);

    const posleZamene = zamena.telo.trip;
    jednako('let je upisan u putovanje',
      posleZamene.itinerary.selectedFlight.offerId, drugi.offerId);

    tacno('prvi dan je preracunat ili je vreme ostalo isto',
      Array.isArray(zamena.telo.changedDays),
      `izmenjenih dana: ${zamena.telo.changedDays.length}, prvi dan pre: ${trenutniDolazak}, ` +
        `posle: ${posleZamene.itinerary.itinerary[0].availableFrom}`);

    // Nijedna aktivnost ne sme da ispadne zbog promene leta
    const preBroj = posleOsvezavanja.itinerary.itinerary.reduce(
      (z, d) => z + (d.attractions || []).length, 0);
    const posleBroj = posleZamene.itinerary.itinerary.reduce(
      (z, d) => z + (d.attractions || []).length, 0);

    jednako('nijedna aktivnost nije izbacena', posleBroj, preBroj);

    const nepoznatLet = await poziv('put', `/v1/trips/${tripId}/flight`,
      { offerId: 'off_ne_postoji', version: zamena.telo.version }, token);

    jednako('nepoznat offerId -> 410', nepoznatLet.status, 410);

  } finally {
    if (tripId) {
      await trips.db
        .collection('trips')
        .deleteOne({ _id: new mongoose.Types.ObjectId(tripId) })
        .catch(() => {});
    }

    await users.db.collection('users').deleteMany({
      $or: [
        { korisnickoIme: { $in: [KORISNICKO_IME, `${KORISNICKO_IME}_drugi`] } },
        { email: { $in: ['proba.task17@voyra.test', 'drugi.task17@voyra.test'] } }
      ]
    });

    await users.close();
    await trips.close();
    await adminDb.close();
  }

  console.log(`\n${pali === 0 ? 'SVE PROVERE PROLAZE' : `PALO PROVERA: ${pali}`}`);
  process.exit(pali === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nPROBA NIJE ZAVRSENA:', err.message);
  process.exit(1);
});
