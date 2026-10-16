/**
 * Lazni Duffel + LiteAPI + OpenTripMap + Wikipedia + Frankfurter +
 * Nominatim server za proveru adaptera. Oblici odgovora su preslikani iz zvanicne dokumentacije.
 *
 * `proba-adaptera.js` ga sam pokrece i gasi, pa ga ne treba startovati
 * rucno. Direktno pokretanje (`npm run lazni-api`) sluzi samo kada
 * hoces da ga sam gadjas curl-om.
 */
const http = require('http');
const { URL } = require('url');

const pozivi = [];

/** Prekidaci kojima proba izaziva granicne slucajeve. */
const stanje = {
  frankfurterPada: false,
  duffelPraznePonude: false,
  // Koliko objekata OpenTripMap vraca po upitu - proba time izaziva
  // sirenje poluprecnika
  otmPoUpitu: 40,

  // Geoapify: `prazno` daje FeatureCollection bez objekata,
  // a `greska` zadati HTTP kod (401 nevazeci kljuc, 429 dnevni limit)
  geoPrazno: false,
  geoGreska: 0
};

const salji = (res, kod, telo) => {
  res.writeHead(kod, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(telo));
};

const procitajTelo = (req) =>
  new Promise((resolve) => {
    let sirovo = '';
    req.on('data', (c) => (sirovo += c));
    req.on('end', () => {
      try {
        resolve(sirovo ? JSON.parse(sirovo) : {});
      } catch {
        resolve({});
      }
    });
  });

// ---------- Duffel ----------

const segment = (from, to, polazak, dolazak, broj) => ({
  origin: { iata_code: from },
  destination: { iata_code: to },
  departing_at: polazak,
  arriving_at: dolazak,
  duration: 'PT2H30M',
  marketing_carrier: { iata_code: 'ZZ', name: 'Duffel Airways' },
  marketing_carrier_flight_number: broj,
  operating_carrier: { iata_code: 'ZZ', name: 'Duffel Airways' }
});

const ponuda = (id, iznos, valuta, saPovratkom = true) => ({
  id,
  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  total_amount: iznos,
  total_currency: valuta,
  base_amount: iznos,
  tax_amount: '0.00',
  owner: { iata_code: 'ZZ', name: 'Duffel Airways' },
  passengers: [
    { id: 'pas_0000001', type: 'adult' },
    { id: 'pas_0000002', type: 'adult' }
  ],
  slices: [
    {
      origin: { iata_code: 'BEG' },
      destination: { iata_code: 'ATH' },
      duration: 'PT2H30M',
      segments: [segment('BEG', 'ATH', '2027-06-10T06:00:00Z', '2027-06-10T08:30:00Z', '100')]
    },
    ...(saPovratkom
      ? [
          {
            origin: { iata_code: 'ATH' },
            destination: { iata_code: 'BEG' },
            // `duration` namerno izostavljen - adapter mora da ga izracuna
            segments: [
              segment('ATH', 'BUD', '2027-06-14T09:00:00Z', '2027-06-14T10:30:00Z', '200'),
              segment('BUD', 'BEG', '2027-06-14T12:00:00Z', '2027-06-14T13:00:00Z', '201')
            ]
          }
        ]
      : [])
  ]
});

const rukovalac = async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const telo = req.method === 'POST' ? await procitajTelo(req) : {};

  pozivi.push({ metod: req.method, path: u.pathname, params: Object.fromEntries(u.searchParams), telo });

  // ---------- prekidaci za probu ----------
  if (u.pathname === '/__stanje') {
    Object.assign(stanje, Object.fromEntries(u.searchParams).frankfurterPada !== undefined
      ? { frankfurterPada: u.searchParams.get('frankfurterPada') === 'true' }
      : {});

    if (u.searchParams.has('duffelPraznePonude')) {
      stanje.duffelPraznePonude = u.searchParams.get('duffelPraznePonude') === 'true';
    }

    return salji(res, 200, stanje);
  }

  // ---------- Duffel ----------
  if (u.pathname === '/air/offer_requests' && req.method === 'POST') {
    if (req.headers['duffel-version'] !== 'v2') {
      return salji(res, 400, { errors: [{ title: 'Missing Duffel-Version header' }] });
    }

    if (stanje.duffelPraznePonude) {
      return salji(res, 201, { data: { id: 'orq_prazan', offers: [] } });
    }

    const saPovratkom = (telo.data?.slices || []).length > 1;

    return salji(res, 201, {
      data: {
        id: 'orq_0000001',
        offers: [
          ponuda('off_skuplja', '420.00', 'EUR', saPovratkom),
          ponuda('off_jeftina', '300.00', 'EUR', saPovratkom),
          // Ponuda u drugoj valuti - mora da dobije priceEUR
          ponuda('off_funte', '260.00', 'GBP', saPovratkom)
        ]
      }
    });
  }

  if (u.pathname.startsWith('/air/offers/')) {
    const id = u.pathname.split('/').pop();

    if (id === 'off_istekla') {
      return salji(res, 404, { errors: [{ title: 'Offer expired', code: 'not_found' }] });
    }

    // Ista ponuda, ali skuplja - proverava prijavu promene cene
    if (id === 'off_skuplja_sada') return salji(res, 200, { data: ponuda(id, '355.00', 'EUR') });

    return salji(res, 200, { data: ponuda(id, '300.00', 'EUR') });
  }

  if (u.pathname === '/air/orders' && req.method === 'POST') {
    const putnici = telo.data?.passengers || [];

    if (putnici.length > 9) {
      return salji(res, 422, {
        errors: [{ title: 'Too many passengers', code: 'invalid_number_of_passengers' }]
      });
    }

    if (!telo.data?.payments?.[0] || telo.data.payments[0].type !== 'balance') {
      return salji(res, 422, { errors: [{ title: 'Payment required', code: 'invalid_payment' }] });
    }

    return salji(res, 201, {
      data: {
        id: 'ord_0000001',
        booking_reference: 'RTM3PC',
        total_amount: telo.data.payments[0].amount,
        total_currency: telo.data.payments[0].currency,
        created_at: new Date().toISOString()
      }
    });
  }

  if (u.pathname === '/air/order_cancellations' && req.method === 'POST') {
    return salji(res, 201, {
      data: {
        id: 'ore_0000001',
        order_id: telo.data?.order_id,
        refund_amount: '300.00',
        refund_currency: 'EUR',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      }
    });
  }

  if (/^\/air\/order_cancellations\/[^/]+\/actions\/confirm$/.test(u.pathname)) {
    return salji(res, 200, {
      data: { id: 'ore_0000001', confirmed_at: new Date().toISOString(), refund_to: 'balance' }
    });
  }

  // ---------- LiteAPI ----------
  if (u.pathname === '/data/hotels') {
    if (req.headers['x-api-key'] !== 'lazni_liteapi_kljuc') {
      return salji(res, 401, { error: { description: 'Invalid API key' } });
    }

    if (u.searchParams.get('countryCode') !== 'GR') return salji(res, 200, { data: [], total: 0 });

    return salji(res, 200, {
      data: [
        {
          id: 'lp1a2b3',
          name: 'Hotel Hermes Athens',
          address: 'Apollonos 19',
          city: 'Athens',
          country: 'GR',
          latitude: 37.9755,
          longitude: 23.7348,
          rating: 8.6,
          stars: 3,
          hotelType: 'Hotel',
          main_photo: 'https://example.test/hermes.jpg'
        },
        {
          id: 'lp9z8y7',
          name: 'Acropolis Studios',
          address: 'Makrigianni 4',
          city: 'Athens',
          country: 'GR',
          latitude: 37.9691,
          longitude: 23.7233,
          // Bez ocene - mora da ostane null, ne 0
          rating: 0,
          stars: null,
          hotelType: 'Apartment',
          main_photo: null
        },
        {
          id: 'lp_bez_cene',
          name: 'Hotel Bez Cene',
          city: 'Athens',
          latitude: 37.99,
          longitude: 23.74,
          rating: 7.2,
          hotelType: 'Hostel'
        }
      ],
      total: 3
    });
  }

  if (u.pathname === '/hotels/rates' && req.method === 'POST') {
    if (req.headers['x-api-key'] !== 'lazni_liteapi_kljuc') {
      return salji(res, 401, { error: { description: 'Invalid API key' } });
    }

    return salji(res, 200, {
      data: [
        {
          hotelId: 'lp1a2b3',
          roomTypes: [
            {
              offerId: 'ofr_hermes_1',
              rates: [
                {
                  name: 'Double room',
                  retailRate: { total: [{ amount: 440, currency: 'EUR' }] },
                  cancellationPolicies: { refundableTag: 'RFN' }
                },
                {
                  name: 'Double room - non refundable',
                  retailRate: { total: [{ amount: 400, currency: 'EUR' }] },
                  cancellationPolicies: { refundableTag: 'NRFN' }
                }
              ]
            }
          ]
        },
        {
          hotelId: 'lp9z8y7',
          roomTypes: [
            {
              offerId: 'ofr_studios_1',
              rates: [
                {
                  name: 'Studio',
                  retailRate: { total: [{ amount: 260, currency: 'EUR' }] },
                  cancellationPolicies: { refundableTag: 'RFN' }
                }
              ]
            }
          ]
        }
        // lp_bez_cene namerno nema cenu - ne sme da se pojavi u rezultatu
      ]
    });
  }

  // ---------- Frankfurter ----------
  if (u.pathname === '/v1/latest') {
    if (stanje.frankfurterPada) return salji(res, 503, { message: 'Service unavailable' });

    return salji(res, 200, {
      amount: 1,
      base: 'EUR',
      date: '2027-06-01',
      rates: { GBP: 0.8, USD: 1.1, RSD: 117.2 }
    });
  }

  // ---------- OpenTripMap ----------

  /*
   * `/places/radius` vraca objekte cija se imena razlikuju po upitu, da
   * bi proba mogla da proveri spajanje bez duplikata. Prvih nekoliko
   * `xid`-ova je isto u oba upita - to su namerni duplikati.
   */
  if (u.pathname === '/places/radius') {
    const limit = parseInt(u.searchParams.get('limit'), 10) || 0;
    const radius = parseInt(u.searchParams.get('radius'), 10) || 0;
    const kinds = u.searchParams.get('kinds') || '';
    const opsti = kinds === 'interesting_places';

    // Sirok poluprecnik daje vise objekata - zato se i siri
    const koliko = Math.min(limit, radius > 20000 ? stanje.otmPoUpitu * 2 : stanje.otmPoUpitu);
    const prefiks = opsti ? 'opsti' : 'po-interesovanjima';

    const objekti = Array.from({ length: koliko }, (_, i) => ({
      // Prva tri su ista u oba upita: provera uklanjanja duplikata
      xid: i < 3 ? `Q_zajednicki_${i}` : `Q_${prefiks}_${i}`,
      name: i < 3 ? `Zajednicko mesto ${i}` : `${prefiks} mesto ${i}`,
      rate: i % 3 === 0 ? '3h' : '2',
      kinds: opsti ? 'interesting_places,historic' : 'museums,cultural',
      point: { lat: 37.97 + i * 0.001, lon: 23.72 + i * 0.001 }
    }));

    return salji(res, 200, objekti);
  }

  // ---------- Geoapify Places ----------

  /*
   * Oblik je iz zvanicne dokumentacije: GeoJSON `FeatureCollection`, sa
   * `properties.name`, `categories[]`, `lat`, `lon`, `place_id` i
   * `datasource.raw` (sirovi OSM tagovi).
   *
   * Namerni granicni slucajevi u odgovoru:
   *   - objekat BEZ imena          -> adapter ga preskace
   *   - objekat BEZ koordinata     -> adapter ga preskace
   *   - slozeno `opening_hours`    -> parser vraca null, ostaje procena
   *   - jednostavno `opening_hours`-> parser ga cita
   *   - sa i bez `wikipedia` veze  -> razlicite ocene
   */
  if (u.pathname === '/places') {
    if (stanje.geoGreska) {
      return salji(res, stanje.geoGreska, {
        statusCode: stanje.geoGreska,
        error: stanje.geoGreska === 429 ? 'Too Many Requests' : 'Unauthorized',
        message:
          stanje.geoGreska === 429
            ? 'Daily credit limit reached'
            : 'Invalid apiKey'
      });
    }

    if (stanje.geoPrazno) return salji(res, 200, { type: 'FeatureCollection', features: [] });

    const limit = parseInt(u.searchParams.get('limit'), 10) || 20;

    const mesto = (i, dodatno = {}) => ({
      type: 'Feature',
      properties: {
        name: `Geo mesto ${i}`,
        name_international: { en: `Geo place ${i}`, el: `Geo grcki ${i}` },
        categories: ['tourism', 'tourism.sights'],
        place_id: `geo_${i}`,
        lat: 37.97 + i * 0.001,
        lon: 23.72 + i * 0.001,
        formatted: `Adresa ${i}, Atina`,
        datasource: { raw: { osm_id: 1000 + i } },
        ...dodatno
      },
      geometry: { type: 'Point', coordinates: [23.72 + i * 0.001, 37.97 + i * 0.001] }
    });

    const objekti = [
      // 0: sve uredno, sa Wikipedijom i jednostavnim radnim vremenom
      mesto(0, {
        datasource: {
          raw: {
            osm_id: 1000,
            wikipedia: 'en:Acropolis of Athens',
            wikidata: 'Q131013',
            opening_hours: 'Mo-Su 08:00-19:00'
          }
        }
      }),
      // 1: samo wikidata
      mesto(1, { datasource: { raw: { osm_id: 1001, wikidata: 'Q42' } } }),
      // 2: slozeno radno vreme - parser ga NE cita
      mesto(2, { datasource: { raw: { osm_id: 1002, opening_hours: 'Nov-Mar 08:30-15:00' } } }),
      // 3: BEZ imena - preskace se
      { ...mesto(3), properties: { ...mesto(3).properties, name: undefined } },
      // 4: BEZ koordinata - preskace se
      { ...mesto(4), properties: { ...mesto(4).properties, lat: undefined, lon: undefined } },
      // 5: UNESCO bastina - dodatak na ocenu
      mesto(5, { categories: ['heritage', 'heritage.unesco'] })
    ];

    // Ostatak do `limit`, da proba moze da izazove i sirenje kruga
    for (let i = 6; i < Math.min(limit, 30); i++) objekti.push(mesto(i));

    return salji(res, 200, { type: 'FeatureCollection', features: objekti });
  }

  if (u.pathname.startsWith('/places/xid/')) {
    const xid = decodeURIComponent(u.pathname.split('/').pop());

    // `bez_slike` nema `preview`, ali ima clanak - adapter mora da
    // pokusa preko Wikipedije
    if (xid === 'Q_bez_slike') {
      return salji(res, 200, {
        xid,
        name: 'Mesto bez slicice',
        info: { descr: 'Opis iz OpenTripMap-a.' },
        wikipedia: 'https://en.wikipedia.org/wiki/Test_Article'
      });
    }

    if (xid === 'Q_bez_icega') {
      return salji(res, 200, { xid, name: 'Mesto bez detalja' });
    }

    if (xid === 'Q_pada') return salji(res, 500, { error: 'greska izvora' });

    return salji(res, 200, {
      xid,
      name: 'Mesto sa slikom',
      info: { descr: 'Opis iz OpenTripMap-a.' },
      preview: { source: 'https://upload.wikimedia.org/thumb/320px-Slika.jpg', width: 320, height: 240 },
      wikipedia: 'https://en.wikipedia.org/wiki/Test_Article'
    });
  }

  // ---------- Wikipedia REST ----------
  if (u.pathname.startsWith('/page/summary/')) {
    const naslov = decodeURIComponent(u.pathname.split('/').pop());

    if (naslov === 'Nema_Clanka') return salji(res, 404, { title: 'Not found' });

    if (naslov === 'Bez_Slike') {
      return salji(res, 200, {
        titles: { normalized: naslov },
        extract: 'Clanak bez slicice.',
        content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${naslov}` } }
      });
    }

    return salji(res, 200, {
      titles: { normalized: naslov },
      extract: 'Kratak opis sa Wikipedije.',
      thumbnail: {
        source: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${naslov}.jpg/320px-${naslov}.jpg`,
        width: 320,
        height: 213
      },
      content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${naslov}` } }
    });
  }

  // ---------- Nominatim ----------
  if (u.pathname === '/search') {
    const grad = (u.searchParams.get('city') || '').toLowerCase();
    if (grad !== 'athens') return salji(res, 200, []);

    return salji(res, 200, [
      {
        lat: '37.9838',
        lon: '23.7275',
        display_name: 'Athens, Greece',
        address: { country_code: 'gr' }
      }
    ]);
  }

  salji(res, 404, { error: 'nepoznata putanja: ' + u.pathname });
};

/**
 * Pokrece server i vraca ga tek kada zaista slusa.
 * Podrazumevani port je 0 - operativni sistem dodeli slobodan, pa
 * proba ne moze da se sudari sa necim sto vec radi na 4901.
 */
const pokreni = (port = 0) =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      rukovalac(req, res).catch((err) => salji(res, 500, { error: err.message }));
    });

    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

module.exports = { pokreni, pozivi, stanje };

// Rucno pokretanje: fiksan port, da curl zna gde da gadja
if (require.main === module) {
  pokreni(4901)
    .then((server) => console.log(`[LAZNI_API] slusa na http://127.0.0.1:${server.address().port}`))
    .catch((err) => {
      console.error('[LAZNI_API] Ne mogu da pokrenem server:', err.message);
      process.exit(1);
    });
}
