/**
 * POSTAVLJANJE STANJA PREKO API-JA.
 *
 * Testovi stanje pripremaju kroz API, a ne kroz UI: klikanje kroz
 * registraciju i odobravanje pre svakog scenarija bilo bi i sporo i
 * krhko - jedan pad u pripremi oborio bi test koji proverava nešto
 * drugo. UI se koristi samo za ono što scenario zaista proverava.
 *
 * Koristi se ugrađeni `fetch` (Node 18+), pa nema nove zavisnosti.
 */

const KONFIG = require('./konfiguracija');

const url = (putanja) => `${KONFIG.api}${putanja}`;

const zahtev = async (metod, putanja, { telo = null, token = null } = {}) => {
  const opcije = {
    method: metod,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(KONFIG.cekanjePlanMs)
  };

  if (token) opcije.headers.Authorization = `Bearer ${token}`;
  if (telo) opcije.body = JSON.stringify(telo);

  const odgovor = await fetch(url(putanja), opcije);

  let podaci = null;
  try {
    podaci = await odgovor.json();
  } catch {
    podaci = null;
  }

  return { status: odgovor.status, telo: podaci };
};

const api = {
  get: (p, o) => zahtev('GET', p, o),
  post: (p, telo, o = {}) => zahtev('POST', p, { ...o, telo }),
  put: (p, telo, o = {}) => zahtev('PUT', p, { ...o, telo }),
  patch: (p, telo, o = {}) => zahtev('PATCH', p, { ...o, telo }),
  delete: (p, o) => zahtev('DELETE', p, o),

  /** Prijava; vraća `{ token, user }` ili baca grešku sa statusom. */
  async prijava(korisnickoIme, lozinka) {
    const r = await api.post('/api/users/login', { korisnickoIme, lozinka });

    if (r.status !== 200 || !r.telo?.token) {
      throw new Error(`Prijava ${korisnickoIme} nije uspela (${r.status}): ${r.telo?.message || ''}`);
    }

    return { token: r.telo.token, user: r.telo.user };
  },

  /** Token administratora iz demo naloga. */
  async adminToken() {
    const { token } = await api.prijava(
      KONFIG.nalozi.admin.korisnickoIme,
      KONFIG.nalozi.admin.lozinka
    );
    return token;
  },

  /** Token običnog korisnika iz demo naloga. */
  async korisnikToken() {
    const { token } = await api.prijava(
      KONFIG.nalozi.korisnik.korisnickoIme,
      KONFIG.nalozi.korisnik.lozinka
    );
    return token;
  },

  /**
   * Nov nalog sa jedinstvenim korisničkim imenom.
   *
   * Nalog nastaje u statusu `na_cekanju`; `odobri` ga prevodi u `odobren`.
   */
  async noviNalog(prefiks = 'e2e') {
    const oznaka = `${prefiks}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

    const nalog = {
      ime: 'Proba',
      prezime: 'Selenium',
      email: `${oznaka}@voyra.local`,
      korisnickoIme: oznaka.slice(0, 20),
      lozinka: 'VoyraProba1!'
    };

    // Ruta traži i potvrdu lozinke, kao i obrazac u aplikaciji
    const r = await api.post('/api/users/register', {
      ...nalog,
      lozinkaConfirm: nalog.lozinka
    });

    if (r.status !== 201 && r.status !== 200) {
      throw new Error(`Registracija nije uspela (${r.status}): ${JSON.stringify(r.telo)}`);
    }

    return nalog;
  },

  /** Nalog odobren i spreman za prijavu. */
  async odobrenNalog(prefiks = 'e2e') {
    const nalog = await api.noviNalog(prefiks);
    await api.postaviStatus(nalog.korisnickoIme, 'odobren');
    return nalog;
  },

  /** Administratorska promena statusa naloga, po korisničkom imenu. */
  async postaviStatus(korisnickoIme, status) {
    const token = await api.adminToken();
    const svi = await api.get('/api/admin/users', { token });

    const korisnik = (svi.telo?.data || []).find((k) => k.korisnickoIme === korisnickoIme);
    if (!korisnik) throw new Error(`Nalog ${korisnickoIme} ne postoji`);

    const r = await api.patch(`/api/admin/users/${korisnik._id}/status`, { status }, { token });

    if (r.status !== 200) {
      throw new Error(`Status ${korisnickoIme} -> ${status} nije postavljen (${r.status})`);
    }

    return r.telo?.data;
  },

  /**
   * Obaveštenja PRIJAVLJENOG korisnika - scenario 1 proverava
   * `REGISTRATION_APPROVED`.
   *
   * Ruta vraća samo poruke vlasnika tokena (administrator ne može da čita
   * tuđa obaveštenja), pa se prosleđuje token tog korisnika.
   */
  async obavestenja(token, { limit = 50 } = {}) {
    const r = await api.get(`/api/notifications?limit=${limit}`, { token });

    // Ruta vraća `notifications`, ne `data`
    return r.telo?.notifications || [];
  },

  /**
   * Čeka da se pojavi obaveštenje zadatog tipa.
   *
   * Admin Service poruku šalje po principu „pošalji i zaboravi", pa ona
   * stiže neposredno POSLE odgovora na promenu statusa - zato se čeka, a
   * ne proverava jednom.
   */
  async cekajObavestenje(token, tip, { ms = 15000, korak = 500 } = {}) {
    const kraj = Date.now() + ms;

    while (Date.now() < kraj) {
      const poruke = await api.obavestenja(token);
      const nadjeno = poruke.find((p) =>
        String(p.type || p.templateName || '').toUpperCase().includes(tip.toUpperCase())
      );

      if (nadjeno) return nadjeno;

      await new Promise((r) => setTimeout(r, korak));
    }

    const poruke = await api.obavestenja(token);
    throw new Error(
      `Nema obaveštenja ${tip} posle ${ms} ms ` +
        `(nađeno: ${poruke.map((p) => p.type).join(', ') || 'ništa'})`
    );
  },

  /**
   * Napravi i sačuva putovanje jednim pozivom.
   *
   * Prolaz kroz čarobnjak proverava scenario 3; ostali scenariji od
   * putovanja samo POLAZE, pa ga prave preko `/v1/plan` sa `X-Save-Trip`.
   */
  async sacuvanoPutovanje(token, { naslov = 'E2E putovanje', from = 'BEG', to = 'ATH', dana = 5, putnika = 2 } = {}) {
    const dan = (n) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    const r = await fetch(url('/v1/plan'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Save-Trip': 'true'
      },
      body: JSON.stringify({
        from,
        to,
        checkIn: dan(30),
        checkOut: dan(30 + dana),
        passengers: putnika,
        title: naslov
      }),
      signal: AbortSignal.timeout(KONFIG.cekanjePlanMs)
    });

    const telo = await r.json();

    if (!telo?.savedTripId) {
      throw new Error(`Putovanje nije sačuvano (${r.status}): ${JSON.stringify(telo).slice(0, 300)}`);
    }

    return telo.savedTripId;
  },

  /**
   * Putovanje sa ZADATOM oznakom ponude leta.
   *
   * Mock adapter po nastavku oznake pravi granični slučaj: `_pricechange`
   * menja cenu za 25 EUR, `_expired` vraća isteklu ponudu. Bez toga se tok
   * rezervacije iz §4.8 ne može proveriti bez pravih ključeva.
   */
  async putovanjeSaPonudom(token, { offerId, cena = 328, naslov = 'E2E rezervacija' } = {}) {
    const dan = (n) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    const polazak = dan(30);
    const povratak = dan(35);

    const let_ = {
      id: offerId,
      offerId,
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      from: 'BEG',
      to: 'ATH',
      departure: `${polazak}T09:45:00.000Z`,
      arrival: `${polazak}T12:15:00.000Z`,
      airline: 'Olympic Air',
      airlineIata: 'OA',
      price: cena,
      currency: 'EUR',
      priceEUR: cena,
      duration: 300,
      stops: 0,
      outbound: {
        departure: `${polazak}T09:45:00.000Z`,
        arrival: `${polazak}T12:15:00.000Z`,
        duration: 150,
        stops: 0,
        segments: []
      },
      inbound: {
        departure: `${povratak}T13:30:00.000Z`,
        arrival: `${povratak}T16:00:00.000Z`,
        duration: 150,
        stops: 0,
        segments: []
      },
      passengerIds: ['pas_mock_1', 'pas_mock_2']
    };

    const r = await api.post(
      '/api/trips',
      {
        title: naslov,
        from: 'BEG',
        to: 'ATH',
        date: polazak,
        checkIn: polazak,
        checkOut: povratak,
        passengers: 2,
        guests: 2,
        budget: 1200,
        itinerary: {
          flights: [let_],
          selectedFlight: let_,
          accommodations: [],
          itinerary: [],
          totalDays: 6,
          totalBudget: { flights: cena, accommodations: 0, attractions: 0, total: cena }
        }
      },
      { token }
    );

    if (r.status !== 201) {
      throw new Error(`Putovanje nije napravljeno (${r.status}): ${JSON.stringify(r.telo).slice(0, 300)}`);
    }

    return r.telo.data._id;
  },

  /** Oznaka mock ponude za rutu BEG-ATH, sa opcionim nastavkom. */
  mockOfferId({ nastavak = '', flightId = 1 } = {}) {
    const dan = (n) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    return `off_mock_${flightId}_BEGATH_${dan(30)}_${dan(35)}_2${nastavak}`;
  },

  /** Sačuvana putovanja korisnika. */
  async putovanja(token) {
    const r = await api.get('/api/trips', { token });
    return r.telo?.data || [];
  },

  async putovanje(token, id) {
    const r = await api.get(`/api/trips/${id}`, { token });
    return r.telo?.data || null;
  },

  /** Briše putovanje - čišćenje posle scenarija. */
  async obrisiPutovanje(token, id) {
    await api.delete(`/api/trips/${id}`, { token });
  }
};

module.exports = api;
