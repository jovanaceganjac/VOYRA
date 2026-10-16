/**
 * DEMO PONUDE ZA BILO KOJI GRAD.
 *
 * Bez Duffel i LiteAPI kljuca aplikacija je imala ponude samo za rutu
 * BEG -> ATH, pa je carobnjak za svaki drugi grad bio prazan. Ovde se
 * prave ponude za bilo koju rutu i bilo koji grad, da bi se tok mogao
 * proci i bez kljuceva.
 *
 * Tri pravila:
 *   - kompanija je "Demo Air", a smestaj "Demo smestaj - {grad}", da se
 *     ni slucajno ne pomesa sa stvarnim ponudama;
 *   - isti ulaz uvek daje isti izlaz (seme iz rute i datuma), pa se plan
 *     ne menja izmedju dva otvaranja;
 *   - sve nosi `source: "mock"`, a prikaz to i kaze.
 *
 * Atrakcije se NE izmisljaju - one su stvarna mesta.
 */

/** Deterministican generator (linearni kongruentni). */
const seme = (tekst) => {
  let h = 2166136261;

  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  let stanje = Math.abs(h) || 1;

  return () => {
    stanje = (stanje * 1664525 + 1013904223) % 4294967296;
    return stanje / 4294967296;
  };
};

const zaokruzi = (broj, mesta = 2) => {
  const f = 10 ** mesta;
  return Math.round(broj * f) / f;
};

/** Haversine, u kilometrima. */
const udaljenostKm = (a, b) => {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;

  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
};

// =================================================================
// Letovi
// =================================================================

/** Prosecna brzina mlaznjaka na krstarenju. */
const BRZINA_KMH = 800;

/** Poletanje, penjanje, sletanje i rulanje - van vremena krstarenja. */
const REZIJA_MIN = 30;

/**
 * Cena demo leta.
 *
 *   cena = OSNOVICA + km * PO_KILOMETRU
 *
 * Oblik je namerno jednostavan i linearan: cilj nije da se pogodi
 * trziste, nego da duza ruta bude vidljivo skuplja i da se cene razlikuju
 * medju ponudama. Vrednosti su odabrane tako da kratka ruta (BEG-ATH,
 * ~800 km) ispadne oko 100 EUR, a duga (BEG-LIS, ~2.500 km) oko 250 EUR,
 * sto je red velicine stvarnih cena u ekonomskoj klasi.
 */
const OSNOVICA_EUR = 39;
const PO_KILOMETRU_EUR = 0.08;

const minutiIzKm = (km) => Math.round(REZIJA_MIN + (km / BRZINA_KMH) * 60);

/** "2027-06-10" + minuti -> ISO bez oznake zone (lokalno vreme aerodroma). */
const uVreme = (datum, minutiOdPonoci) => {
  const sati = Math.floor(minutiOdPonoci / 60) % 24;
  const minuti = Math.round(minutiOdPonoci % 60);
  const dodatniDan = Math.floor(minutiOdPonoci / 1440);

  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dodatniDan);

  const p = (n) => String(n).padStart(2, '0');

  return `${d.toISOString().slice(0, 10)}T${p(sati)}:${p(minuti)}:00`;
};

/**
 * Demo ponude za bilo koju rutu.
 *
 * @param {object} p - { from, to, checkIn, checkOut, passengers, odKoordinate, doKoordinate }
 * @returns {Array} 3-5 ponuda, poredjanih po ceni
 */
const demoLetovi = ({
  from,
  to,
  checkIn,
  checkOut = null,
  passengers = 1,
  odKoordinate = null,
  doKoordinate = null
}) => {
  const nasumicno = seme(`${from}-${to}-${checkIn}-${checkOut || 'oneway'}`);

  /*
   * Bez koordinata se uzima srednja evropska ruta (1.200 km), da bi
   * ponuda i tada bila razumna - generator se koristi i u probama gde
   * koordinate ne stizu.
   */
  const km =
    odKoordinate && doKoordinate
      ? Math.max(200, Math.round(udaljenostKm(odKoordinate, doKoordinate)))
      : 1200;

  const osnovnoTrajanje = minutiIzKm(km);
  const osnovnaCena = OSNOVICA_EUR + km * PO_KILOMETRU_EUR;

  const broj = 3 + Math.floor(nasumicno() * 3);
  const ponude = [];

  for (let i = 0; i < broj; i++) {
    /*
     * Presedanje produzava put za 60-150 min i snizava cenu za oko 15%
     * po presedanju - tako je izbor "jeftinije ili brze" stvaran, a
     * rangiranje iz Faze 1 ima sta da uporedjuje.
     */
    const presedanja = i === 0 ? 0 : Math.floor(nasumicno() * 2);
    const dodatnoMin = presedanja * (60 + Math.floor(nasumicno() * 90));

    const trajanjeOdlazak = osnovnoTrajanje + dodatnoMin;
    const trajanjePovratak = osnovnoTrajanje + presedanja * 60;

    const cena = zaokruzi(
      osnovnaCena * (1 - presedanja * 0.15) * (0.85 + nasumicno() * 0.4) * (checkOut ? 2 : 1)
    );

    // Polasci od 06:00 do 20:00, da dan u planu ima smisla
    const polazakMin = 6 * 60 + Math.floor(nasumicno() * 14 * 60);
    const povratakMin = 8 * 60 + Math.floor(nasumicno() * 10 * 60);

    const broj1 = 100 + Math.floor(nasumicno() * 800);
    const broj2 = 100 + Math.floor(nasumicno() * 800);

    const odlazak = {
      departure: uVreme(checkIn, polazakMin),
      arrival: uVreme(checkIn, polazakMin + trajanjeOdlazak),
      duration: trajanjeOdlazak,
      stops: presedanja,
      segments: [
        {
          from,
          to,
          departure: uVreme(checkIn, polazakMin),
          arrival: uVreme(checkIn, polazakMin + trajanjeOdlazak),
          airline: 'DM',
          number: String(broj1)
        }
      ]
    };

    const povratak = checkOut
      ? {
          departure: uVreme(checkOut, povratakMin),
          arrival: uVreme(checkOut, povratakMin + trajanjePovratak),
          duration: trajanjePovratak,
          stops: presedanja,
          segments: [
            {
              from: to,
              to: from,
              departure: uVreme(checkOut, povratakMin),
              arrival: uVreme(checkOut, povratakMin + trajanjePovratak),
              airline: 'DM',
              number: String(broj2)
            }
          ]
        }
      : null;

    ponude.push({
      id: `off_demo_${i + 1}_${from}${to}_${checkIn}_${checkOut || 'oneway'}_${passengers}`,
      offerId: `off_demo_${i + 1}_${from}${to}_${checkIn}_${checkOut || 'oneway'}_${passengers}`,
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),

      from,
      to,
      departure: odlazak.departure,
      arrival: odlazak.arrival,

      // Izmisljena kompanija, da se ne pomesa sa stvarnim prevoznicima
      airline: 'Demo Air',
      airlineIata: 'DM',
      number: String(broj1),

      price: cena,
      priceEUR: cena,
      currency: 'EUR',

      duration: trajanjeOdlazak + trajanjePovratak,
      stops: presedanja,

      outbound: odlazak,
      inbound: povratak,

      passengerIds: Array.from({ length: passengers }, (_, j) => `pas_demo_${j + 1}`),
      distanceKm: km
    });
  }

  return ponude.sort((a, b) => a.price - b.price);
};

// =================================================================
// Smestaj
// =================================================================

/** Delovi grada u nazivu, da se ponude razlikuju. */
const DELOVI = ['centar', 'stari grad', 'blizu stanice', 'kod parka', 'šira gradska zona'];

const TIPOVI = ['hotel', 'apartman', 'hostel', 'hotel', 'apartman'];

/**
 * Cena po noći: osnovica po tipu, uz malo odstupanja po ponudi.
 * Redovi veličine su uzeti iz tipičnih evropskih cena.
 */
const CENA_PO_TIPU = { hotel: 95, apartman: 70, hostel: 32 };

/**
 * Demo smestaj za bilo koji grad.
 *
 * @param {object} p - { city, lat, lon, checkIn, checkOut, guests }
 */
const demoSmestaj = ({ city, lat = null, lon = null, checkIn, checkOut, guests = 1 }) => {
  const nasumicno = seme(`${city}-${checkIn}-${checkOut}`);

  const noci = Math.max(
    1,
    Math.round((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24))
  );

  return DELOVI.map((deo, i) => {
    const tip = TIPOVI[i];
    const poNoci = zaokruzi(CENA_PO_TIPU[tip] * (0.8 + nasumicno() * 0.6), 0);

    // Rasuti oko centra grada, do ~2.5 km
    const pomerajLat = (nasumicno() - 0.5) * 0.045;
    const pomerajLon = (nasumicno() - 0.5) * 0.06;

    const udaljenost = zaokruzi(0.3 + nasumicno() * 2.2, 1);

    return {
      id: `ACC_DEMO_${i + 1}`,
      name: `Demo smeštaj — ${city} (${deo})`,
      city,
      address: `${deo}, ${city}`,

      lat: Number.isFinite(lat) ? zaokruzi(lat + pomerajLat, 5) : null,
      lon: Number.isFinite(lon) ? zaokruzi(lon + pomerajLon, 5) : null,

      price: poNoci,
      pricePerNight: poNoci,
      priceEUR: poNoci,
      currency: 'EUR',

      rating: zaokruzi(3.4 + nasumicno() * 1.5, 1),
      stars: tip === 'hostel' ? null : 3 + Math.floor(nasumicno() * 2),
      type: tip,

      distanceToCenter: udaljenost,
      images: [],
      amenities: ['Wi-Fi', 'klima'],

      checkInDate: checkIn,
      checkOutDate: checkOut,
      nights: noci,
      totalPrice: zaokruzi(poNoci * noci, 2),
      cancellation: i % 2 === 0 ? 'Besplatno otkazivanje' : 'Bez otkazivanja',

      bookingUrl: null,
      guests
    };
  }).sort((a, b) => a.price - b.price);
};

module.exports = { demoLetovi, demoSmestaj, seme, udaljenostKm, minutiIzKm };
