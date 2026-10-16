const City = require('../models/City');
const Airport = require('../models/Airport');
const { normalizuj } = require('../utils/normalizacija');

/** Koliko daleko sme da bude aerodrom da bi grad i dalje bio "sa aerodromom". */
const PRAG_BEZ_AERODROMA_KM = 30;

/** Najdalji aerodrom koji se uopste nudi za let do tog grada. */
const MAX_UDALJENOST_KM = 150;

const MIN_ZNAKOVA = 2;
const PODRAZUMEVANI_LIMIT = 10;

/**
 * Keš pretrage u memoriji.
 *
 * Pretraga se poziva dok korisnik kuca, a isti prefiksi se ponavljaju
 * (svi kucaju „beo", „par", „lon"), pa se odgovor pamti. Bez roka
 * trajanja: referentni podaci se menjaju samo pri uvozu, a proces se
 * tada ionako restartuje.
 */
const kes = new Map();
const MAX_KESA = 500;

/**
 * Pretraga gradova (spec §4.2 „grad ili aerodrom, uz automatsko
 * dopunjavanje").
 *
 * Ide nad SOPSTVENOM bazom, ne nad Nominatim-om: njihova pravila
 * korišćenja izričito zabranjuju pretragu dok korisnik kuca
 * (https://operations.osmfoundation.org/policies/nominatim/ —
 * „Auto-complete search ... you must not implement such a service").
 * Nominatim ostaje za pojedinačna geokodiranja, uz keš.
 */
class CityService {
  _greska(poruka, kod, status) {
    const e = new Error(poruka);
    e.code = kod;
    e.statusCode = status;
    return e;
  }

  /** Oblik koji ide klijentu. */
  zaPrikaz(grad) {
    const najblizi = (grad.aerodromi || [])[0] || null;

    return {
      id: String(grad._id),
      naziv: grad.nazivSr || grad.naziv,
      nazivLokalni: grad.naziv,
      nazivEn: grad.nazivEn || grad.naziv,
      drzava: grad.drzava,
      drzavaNaziv: grad.drzavaNaziv,
      lat: grad.lat,
      lon: grad.lon,
      stanovnika: grad.stanovnika,
      aerodrom: najblizi,
      aerodromi: grad.aerodromi || [],
      iataGrada: grad.iataGrada || null,
      /** Aerodrom je dalje od 30 km - prikaz to kaže korisniku. */
      bezAerodroma: !najblizi || najblizi.udaljenostKm > PRAG_BEZ_AERODROMA_KM,
      /** Nema nijednog aerodroma u dometu - let nije moguć. */
      bezLeta: !najblizi || najblizi.udaljenostKm > MAX_UDALJENOST_KM
    };
  }

  /**
   * @param {string} upit
   * @param {number} limit
   * @returns {Promise<Array>} rangirano: tačno poklapanje, pa prefiks, pa veličina
   */
  async pretrazi(upit, limit = PODRAZUMEVANI_LIMIT) {
    const q = normalizuj(upit);

    if (q.length < MIN_ZNAKOVA) {
      throw this._greska(`Upit mora imati bar ${MIN_ZNAKOVA} znaka`, 'VALIDATION_ERROR', 400);
    }

    const kljuc = `${q}|${limit}`;
    if (kes.has(kljuc)) return kes.get(kljuc);

    /*
     * Prefiks se traži regularnim izrazom usidrenim na početak (`^`), pa
     * MongoDB može da koristi indeks nad `pretraga`. Bez sidra bi to bio
     * pregled cele kolekcije.
     */
    const kandidati = await City.find({ pretraga: new RegExp(`^${this._escape(q)}`) })
      .sort({ stanovnika: -1 })
      .limit(limit * 5)
      .lean();

    const rangirani = kandidati
      .map((g) => ({ grad: g, ocena: this._rang(g, q) }))
      .sort((a, b) => b.ocena - a.ocena || b.grad.stanovnika - a.grad.stanovnika)
      .slice(0, limit)
      .map((x) => this.zaPrikaz(x.grad));

    if (kes.size >= MAX_KESA) kes.clear();
    kes.set(kljuc, rangirani);

    return rangirani;
  }

  /**
   * Konačan rang: kvalitet poklapanja **i** veličina grada.
   *
   *   rang = ocenaPoklapanja + 1,5 · log10(stanovnika)
   *
   * Sam kvalitet poklapanja nije dovoljan: „munch" se po glavnom nazivu
   * poklapa sa Münchensteinom (12.000), a sa Minhenom (1,5 miliona) samo
   * preko alternativnog naziva — a korisnik gotovo sigurno traži Minhen.
   * Logaritam je tu da razlika u veličini bude važna, ali ne i presudna:
   * grad sto puta veći dobija oko 3 boda, koliko vredi i bolje poklapanje.
   */
  _rang(grad, q) {
    const velicina = Math.log10(Math.max(grad.stanovnika || 0, 1000));

    return this._ocena(grad, q) + 1.5 * velicina;
  }

  /**
   * Kvalitet poklapanja: tačno ispred prefiksa, a glavni naziv ispred
   * strane transliteracije.
   */
  _ocena(grad, q) {
    const glavni = grad.pretragaGlavna || [];
    const svi = grad.pretraga || [];

    if (glavni.includes(q)) return 4;
    if (glavni.some((o) => o.startsWith(q))) return 3;
    if (svi.includes(q)) return 2;
    if (svi.some((o) => o.startsWith(q))) return 1;

    return 0;
  }

  /**
   * Grad koji odgovara opstini aerodroma.
   *
   * Opstina zna da nosi dodatak u zagradi ili iza zareza
   * („Paris (Roissy-en-France, Val-d'Oise)", „Pendik, Istanbul"), pa se
   * proba svaki deo - i ono pre i ono posle razdvajanja.
   */
  _poOpstini(gradovi, opstina) {
    if (!opstina) return null;

    const delovi = String(opstina)
      .split(/[(),/]/)
      .map((d) => normalizuj(d))
      .filter((d) => d.length >= 3);

    if (delovi.length === 0) return null;

    for (const deo of delovi) {
      const pogodak = gradovi.find((g) => (g.pretraga || []).includes(deo));

      if (pogodak) return pogodak;
    }

    return null;
  }

  _escape(tekst) {
    return tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Jedan grad sa svim podacima. */
  async jedan(id) {
    const grad = await City.findById(String(id)).lean();

    if (!grad) throw this._greska('Grad nije pronađen', 'NOT_FOUND', 404);

    return this.zaPrikaz(grad);
  }

  /**
   * Grad koji pripada zadatom IATA kodu.
   *
   * Služi da stari zahtevi (`from=BEG&to=ATH`) i dalje rade: kod se
   * prevodi u grad čiji je to najbliži aerodrom.
   */
  async poIataKodu(iata) {
    const kod = String(iata || '').toUpperCase();

    if (!/^[A-Z]{3}$/.test(kod)) return null;

    const gradovi = await City.find({
      $or: [{ iataGrada: kod }, { 'aerodromi.iata': kod }]
    })
      .sort({ stanovnika: -1 })
      .limit(20)
      .lean();

    if (gradovi.length === 0) return null;

    // 1) Kod grada (LON, PAR, MIL) - to je izricito taj grad
    const poKoduGrada = gradovi.find((g) => g.iataGrada === kod);
    if (poKoduGrada) return this.zaPrikaz(poKoduGrada);

    /*
     * 2) Opstina koju aerodrom SLUZI, po OurAirports-u.
     *
     * Ovo je jedini pouzdan podatak: ni velicina ni blizina nisu dovoljne.
     * Po velicini bi OPO (aerodrom Porta) dao Vigo, koji je veci i u
     * dometu; po blizini bi FCO dao Ostiju, varosicu uz pistu, umesto
     * Rima. OurAirports uz aerodrom navodi opstinu koju opsluzuje, pa se
     * ona trazi medju kandidatima.
     */
    const aerodrom = await Airport.findById(kod).lean();
    const poOpstini = this._poOpstini(gradovi, aerodrom?.grad);

    if (poOpstini) return this.zaPrikaz(poOpstini);

    // 3) Tek onda velicina - najveci grad kome je taj aerodrom u dometu
    return this.zaPrikaz(gradovi[0]);
  }

  /** Samo za testove - prazni keš pretrage. */
  ocistiKes() {
    kes.clear();
  }
}

module.exports = CityService;
module.exports.PRAG_BEZ_AERODROMA_KM = PRAG_BEZ_AERODROMA_KM;
module.exports.MAX_UDALJENOST_KM = MAX_UDALJENOST_KM;
