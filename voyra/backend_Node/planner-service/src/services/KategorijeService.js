const axios = require('axios');

const {
  INTERESOVANJA,
  RADNO_VREME,
  TRAJANJE_POSETE,
  INTERESOVANJE_U_KINDS,
  KIND_U_INTERESOVANJA,
  PODRAZUMEVANA_KATEGORIJA
} = require('../config/preferencije');

const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || 'http://localhost:4002';
const TIMEOUT = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 5000;

/**
 * Koliko dugo vazi jednom ucitan katalog.
 *
 * 60 s je kompromis: kategorije menja samo administrator, i to retko, pa
 * nema razloga da se citaju na svaki zahtev; s druge strane, izmena u
 * panelu treba da se vidi u sledecem planu, a ne posle restarta.
 */
const KES_MS = 60 * 1000;

/** Fina imena za prikaz kada baza nije dostupna. */
const REZERVNI_NAZIVI = {
  kultura: 'Kultura',
  priroda: 'Priroda',
  gastronomija: 'Gastronomija',
  nocni_zivot: 'Noćni život',
  soping: 'Šoping',
  muzeji: 'Muzeji'
};

/**
 * KATALOG KATEGORIJA INTERESOVANJA (spec §3.3, §9).
 *
 * Ranije su kategorije bile konstante u `config/preferencije.js`.
 * Sada ih uredjuje administrator, pa se citaju iz Trip Service-a - ali
 * konstante ostaju kao REZERVA: planiranje ne sme da stane zato sto Trip
 * Service ne odgovara. Tada se u log upisuje upozorenje, a plan se pravi
 * sa poslednjim poznatim (ili ugradjenim) vrednostima.
 */
class KategorijeService {
  constructor() {
    this._katalog = null;
    this._vaziDo = 0;
    this._poslednjeUpozorenje = 0;
  }

  /** Katalog sklopljen iz ugradjenih konstanti. */
  _izKonstanti() {
    const stavke = INTERESOVANJA.map((kljuc, i) => ({
      kljuc,
      naziv: REZERVNI_NAZIVI[kljuc] || kljuc,
      opis: '',
      eksterneKategorije: [...(INTERESOVANJE_U_KINDS[kljuc] || [])],
      // Bez baze nema Geoapify mapiranja - adapter tada koristi svoje
      // podrazumevane kategorije
      geoapifyKategorije: [],
      trajanjePoseteMin: TRAJANJE_POSETE[kljuc] ?? TRAJANJE_POSETE.ostalo,
      radnoVreme: { ...(RADNO_VREME[kljuc] ?? RADNO_VREME.ostalo) },
      redosled: i + 1,
      aktivna: true
    }));

    return this._sklopi(stavke, 'konstante');
  }

  /**
   * Katalog iz liste kategorija.
   *
   * Obrnuto mapiranje (`kind -> interesovanja`) se RACUNA iz
   * `eksterneKategorije`, pa administrator ne mora da odrzava dve tabele:
   * dodavanje `kind`-a kategoriji automatski znaci da atrakcija sa tim
   * `kind`-om pripada toj kategoriji.
   */
  _sklopi(stavke, izvor) {
    const kljucevi = [];
    const nazivi = {};
    const opisi = {};
    const trajanje = {};
    const radnoVreme = {};
    const interesovanjeUKinds = {};
    const kindUInteresovanja = {};
    // Geoapify kategorije po interesovanju
    const interesovanjeUGeo = {};

    for (const s of stavke) {
      kljucevi.push(s.kljuc);
      nazivi[s.kljuc] = s.naziv;
      opisi[s.kljuc] = s.opis || '';
      trajanje[s.kljuc] = s.trajanjePoseteMin;
      radnoVreme[s.kljuc] = { ...s.radnoVreme };
      interesovanjeUKinds[s.kljuc] = [...(s.eksterneKategorije || [])];
      interesovanjeUGeo[s.kljuc] = [...(s.geoapifyKategorije || [])];

      for (const kind of s.eksterneKategorije || []) {
        if (!kindUInteresovanja[kind]) kindUInteresovanja[kind] = [];
        if (!kindUInteresovanja[kind].includes(s.kljuc)) kindUInteresovanja[kind].push(s.kljuc);
      }
    }

    /*
     * `ostalo` nije kategorija koju korisnik bira: to je rezerva za
     * atrakciju cije kategorije ne poznajemo, pa ne sme da ostane bez
     * trajanja i radnog vremena.
     */
    trajanje.ostalo = TRAJANJE_POSETE.ostalo;
    radnoVreme.ostalo = { ...RADNO_VREME.ostalo };

    return {
      izvor,
      stavke,
      kljucevi,
      nazivi,
      opisi,
      trajanje,
      radnoVreme,
      interesovanjeUKinds,
      interesovanjeUGeo,
      // Konstante ostaju kao dopuna: `kind`-ovi koje nijedna kategorija
      // ne navodi (npr. `palaces`) i dalje se prepoznaju
      kindUInteresovanja: { ...KIND_U_INTERESOVANJA, ...kindUInteresovanja },
      podrazumevana: kljucevi.includes(PODRAZUMEVANA_KATEGORIJA)
        ? PODRAZUMEVANA_KATEGORIJA
        : kljucevi[0] || PODRAZUMEVANA_KATEGORIJA
    };
  }

  /** Upozorenje se ispisuje najvise jednom u minutu, da ne zatrpa log. */
  _upozori(poruka) {
    const sada = Date.now();

    if (sada - this._poslednjeUpozorenje < KES_MS) return;

    this._poslednjeUpozorenje = sada;
    console.warn(`[PLANNER] ${poruka}`);
  }

  /**
   * Katalog, iz kesa ili sa servisa.
   *
   * @returns {Promise<object>} nikad ne baca - u najgorem slucaju vraca
   *   katalog iz ugradjenih konstanti
   */
  async ucitaj() {
    if (this._katalog && Date.now() < this._vaziDo) return this._katalog;

    try {
      const { data } = await axios.get(`${TRIP_SERVICE_URL}/internal/categories`, {
        headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY || '' },
        timeout: TIMEOUT
      });

      const stavke = data?.data || [];

      if (stavke.length === 0) throw new Error('Trip Service nema nijednu aktivnu kategoriju');

      this._katalog = this._sklopi(stavke, 'baza');
      this._vaziDo = Date.now() + KES_MS;

      return this._katalog;
    } catch (err) {
      this._upozori(
        `Kategorije nisu ucitane iz Trip Service-a (${err.message}) - ` +
          'plan se pravi sa ugradjenim vrednostima'
      );

      // Poslednji poznati katalog je bolji od konstanti; ako ga nema, konstante
      if (this._katalog) {
        this._vaziDo = Date.now() + KES_MS;
        return this._katalog;
      }

      return this._izKonstanti();
    }
  }

  /** Poslednji poznat katalog, bez cekanja - za sinhrone provere. */
  trenutni() {
    return this._katalog || this._izKonstanti();
  }

  /** Samo za testove i probe. */
  ocistiKes() {
    this._katalog = null;
    this._vaziDo = 0;
  }
}

/** Jedna instanca po procesu - kes je zajednicki za sve rute. */
module.exports = new KategorijeService();
module.exports.KES_MS = KES_MS;
