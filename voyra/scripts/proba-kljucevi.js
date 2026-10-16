/**
 * npm run proba:kljucevi
 *
 * Proba sa PRAVIM kljucevima iz integration-service/.env. Odvojena je od
 * test:sve jer zavisi od interneta i kvota. Koristi iste adaptere kao
 * servis, ali zaobilazi kes, pa svaki korak zaista ide ka API-ju.
 *
 * Kljuc koji nije upisan daje „PRESKOCENO — kljuc nije upisan".
 * Kljucevi se nigde ne ispisuju.
 */
const path = require('path');

const INT = path.join(__dirname, '..', 'backend_Node', 'integration-service');
require(path.join(INT, 'node_modules', 'dotenv')).config({ path: path.join(INT, '.env') });

// Bez veze sa bazom: citanje/upis kesa odmah pada (adapteri to hvataju)
require(path.join(INT, 'node_modules', 'mongoose')).set('bufferCommands', false);

const { MongoClient } = require(path.join(INT, 'node_modules', 'mongodb'));
const {
  duffelKonfigurisan,
  liteApiKonfigurisan,
  geoapifyKonfigurisan
} = require(path.join(INT, 'src', 'config', 'externalApis'));
const DuffelFlightAdapter = require(path.join(INT, 'src', 'adapters', 'DuffelFlightAdapter'));
const LiteApiHotelAdapter = require(path.join(INT, 'src', 'adapters', 'LiteApiHotelAdapter'));
const GeoapifyPlacesAdapter = require(path.join(INT, 'src', 'adapters', 'GeoapifyPlacesAdapter'));
const { wikipediaAdapter } = require(path.join(INT, 'src', 'adapters', 'WikipediaImageAdapter'));
const { geokoder } = require(path.join(INT, 'src', 'adapters', 'NominatimGeocodeAdapter'));

const rezultati = [];
const zapisi = (izvor, korak, ok, detalj = '') => {
  rezultati.push({ izvor, korak, stanje: ok === null ? 'PRESKOČENO' : ok ? 'OK' : 'PAD', detalj });
  console.log(`  ${ok === null ? '—' : ok ? '✓' : '✗'} ${korak}${detalj ? ` — ${detalj}` : ''}`);
};

const datum = (dana) => new Date(Date.now() + dana * 864e5).toISOString().slice(0, 10);

async function korak(izvor, naziv, fn) {
  try {
    const { ok, detalj } = await fn();
    zapisi(izvor, naziv, ok, detalj);
    return ok;
  } catch (err) {
    zapisi(izvor, naziv, false, `${err.code || ''} ${err.message}`.trim());
    return false;
  }
}

async function duffel() {
  console.log('\nDuffel');
  if (!duffelKonfigurisan()) return zapisi('Duffel', 'sve', null, 'PRESKOČENO — ključ nije upisan');

  const a = new DuffelFlightAdapter();
  let ponuda = null;
  let narudzbina = null;

  await korak('Duffel', 'pretraga BEG→ATH', async () => {
    const letovi = await a._fetchFromDuffel('BEG', 'ATH', datum(30), null, 1);
    ponuda = letovi[0] || null;
    return { ok: letovi.length > 0, detalj: `${letovi.length} ponuda` };
  });
  if (!ponuda) return;

  await korak('Duffel', 'ponovna provera ponude (osvežavanje)', async () => {
    const { data, source } = await a.ponuda(ponuda.offerId);
    return { ok: source === 'duffel' && data?.offerId === ponuda.offerId, detalj: `izvor ${source}` };
  });

  await korak('Duffel', 'rezervacija u test režimu', async () => {
    const { data, source } = await a.kreirajNarudzbinu({
      offerId: ponuda.offerId,
      amount: ponuda.price,
      currency: ponuda.currency,
      passengers: [{
        id: ponuda.passengerIds[0],
        title: 'ms',
        given_name: 'Proba',
        family_name: 'Kljuceva',
        born_on: '1995-05-05',
        gender: 'f',
        email: 'proba.kljucevi@voyra.test',
        phone_number: '+381601234567'
      }]
    });
    narudzbina = data;
    return { ok: source === 'duffel' && /^[A-Z0-9]{6}$/.test(data?.bookingReference || ''), detalj: 'booking_reference dobijen' };
  });
  if (!narudzbina) return;

  await korak('Duffel', 'otkazivanje potvrđeno od Duffel-a', async () => {
    const { data, source } = await a.otkaziNarudzbinu(narudzbina.orderId);
    return { ok: source === 'duffel' && data.cancelled && Boolean(data.confirmedAt), detalj: `povraćaj ${data.refundAmount} ${data.refundCurrency || ''}`.trim() };
  });
}

async function liteapi() {
  console.log('\nLiteAPI');
  if (!liteApiKonfigurisan()) return zapisi('LiteAPI', 'sve', null, 'PRESKOČENO — ključ nije upisan');

  const a = new LiteApiHotelAdapter();
  for (const [city, countryCode] of [['Athens', 'GR'], ['Porto', 'PT']]) {
    await korak('LiteAPI', `hoteli ${city}, ${datum(30)}–${datum(33)}`, async () => {
      const h = await a._fetchFromLiteApi({ city, countryCode, checkIn: datum(30), checkOut: datum(33), guests: 2 });
      const tipovi = h.every((x) => ['hotel', 'hostel', 'apartman'].includes(x.type));
      const ocene = h.every((x) => (x.stars == null || (x.stars >= 0 && x.stars <= 5)) && (x.rating == null || (x.rating >= 0 && x.rating <= 5)));
      const cene = h.every((x) => x.pricePerNight > 0);
      return {
        ok: h.length > 0 && tipovi && ocene && cene,
        detalj: `${h.length} hotela; tipovi ${tipovi ? 'ok' : 'VAN OPSEGA'}, ocene ${ocene ? 'ok' : 'VAN OPSEGA'}, cene ${cene ? 'ok' : 'NEMA'}`
      };
    });
  }
}

async function geoapify() {
  console.log('\nGeoapify');
  if (!geoapifyKonfigurisan()) return zapisi('Geoapify', 'sve', null, 'PRESKOČENO — ključ nije upisan');

  // Mapa interesovanje -> Geoapify kategorije iz razvojne baze (samo citanje)
  const klijent = await MongoClient.connect(process.env.PROBA_MONGO || 'mongodb://localhost:27017');
  const kat = await klijent.db('trips_db').collection('interest_categories').find({ aktivna: { $ne: false } }).toArray();
  await klijent.close();
  const mapa = Object.fromEntries(kat.map((k) => [k.naziv, k.geoapifyKategorije || []]));
  const sve = [...new Set(Object.values(mapa).flat())];

  const a = new GeoapifyPlacesAdapter();
  for (const [city, cc] of [['Athens', 'GR'], ['Porto', 'PT'], ['Tromsø', 'NO'], ['Bled', 'SI']]) {
    await korak('Geoapify', `atrakcije ${city}`, async () => {
      const c = await geokoder.grad(city, cc);
      const at = await a._pretrazi({ lat: c.lat, lon: c.lon, categories: sve.join(','), ukupanCilj: 20, city, mapaKategorija: mapa });
      const pokriveno = Object.keys(mapa).filter((n) => at.some((x) => x.categories.includes(n)));
      const saWiki = at.find((x) => x.wikipedia);
      const slika = saWiki ? await wikipediaAdapter.detalj(saWiki.wikipedia) : null;
      return {
        ok: at.length > 0,
        detalj: `${at.length} atrakcija; interesovanja ${pokriveno.length}/${Object.keys(mapa).length} (${pokriveno.join(', ')}); slika sa Wikipedije: ${slika?.image ? 'da' : 'ne'}`
      };
    });
  }
}

(async () => {
  console.log('proba:kljucevi — pravi pozivi ka Duffel, LiteAPI i Geoapify');
  await duffel();
  await liteapi();
  await geoapify();

  const pad = rezultati.filter((r) => r.stanje === 'PAD').length;
  const ok = rezultati.filter((r) => r.stanje === 'OK').length;
  const presk = rezultati.filter((r) => r.stanje === 'PRESKOČENO').length;
  console.log(`\nUkupno: ${ok} OK, ${pad} PAD, ${presk} PRESKOČENO`);
  process.exit(pad ? 1 : 0);
})();
