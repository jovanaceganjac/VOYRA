const TripClient = require('./clients/TripClient');

/** Preko ove udaljenosti grad se tretira kao „bez sopstvenog aerodroma". */
const PRAG_BEZ_AERODROMA_KM = 30;

/** Dalje od ovoga let se ne nudi. */
const MAX_UDALJENOST_KM = 150;

/**
 * RAZREŠAVANJE GRADOVA (spec §4.2).
 *
 * Zahtevi mogu da nose `fromCityId` / `toCityId` (novo) ili `from` / `to`
 * kao IATA kod (staro). Oba se ovde svode na isti opis grada, pa ostatak
 * sistema ne mora da zna koji je oblik stigao — a sačuvana putovanja i
 * postojeći testovi nastavljaju da rade.
 *
 * Opis koji ide Planneru nosi i **koordinate**, pa spoljni izvori ne
 * moraju da pogađaju grad po imenu.
 */
class CityResolver {
  constructor() {
    this.trip = new TripClient();
    /** Kratkotrajni keš: isti grad se u jednom zahtevu traži više puta. */
    this.kes = new Map();
  }

  _greska(poruka, kod, status) {
    const e = new Error(poruka);
    e.code = kod;
    e.statusCode = status;
    return e;
  }

  /**
   * @param {object} p - { cityId, iata }
   * @returns {Promise<object|null>} opis grada ili `null`
   */
  async razresi({ cityId = null, iata = null }, requestId) {
    const kljuc = cityId ? `id:${cityId}` : `iata:${String(iata || '').toUpperCase()}`;

    if (this.kes.has(kljuc)) return this.kes.get(kljuc);

    let grad = null;

    if (cityId) {
      grad = await this.trip.city(cityId, requestId);
    } else if (iata) {
      grad = await this.trip.cityPoIata(iata, requestId);
    }

    if (grad) this.kes.set(kljuc, grad);

    return grad;
  }

  /** Grad iz zahteva; baca 400 kada `cityId` ne postoji. */
  async izZahteva(telo, strana, requestId) {
    const cityId = strana === 'from' ? telo.fromCityId : telo.toCityId;
    const iata = strana === 'from' ? telo.from : telo.to;

    const grad = await this.razresi({ cityId, iata }, requestId).catch((err) => {
      if (err.statusCode === 404) return null;
      throw err;
    });

    if (!grad && cityId) {
      throw this._greska(`Grad ${cityId} ne postoji`, 'UNKNOWN_CITY', 400);
    }

    return grad;
  }

  /**
   * IATA kod koji ide u pretragu leta.
   *
   * Duffel prima „the 3-letter IATA code for the city **or** airport"
   * (docs: offer-requests/create-offer-request), pa gradovi sa više
   * aerodroma (London, Pariz, Milano…) idu preko koda grada i pretraga
   * pokriva sve njihove aerodrome odjednom. Ostali idu preko najbližeg
   * aerodroma sa redovnim linijama.
   */
  kodZaLet(grad) {
    if (!grad) return null;
    if (grad.iataGrada) return grad.iataGrada;

    const najblizi = grad.aerodrom || (grad.aerodromi || [])[0];

    if (!najblizi || najblizi.udaljenostKm > MAX_UDALJENOST_KM) return null;

    return najblizi.iata;
  }

  /** Aerodrom preko kog se putuje, sa udaljenošću do grada. */
  aerodromZaGrad(grad) {
    if (!grad) return null;

    const najblizi = grad.aerodrom || (grad.aerodromi || [])[0];

    if (!najblizi || najblizi.udaljenostKm > MAX_UDALJENOST_KM) return null;

    return {
      iata: najblizi.iata,
      naziv: najblizi.naziv,
      udaljenostKm: najblizi.udaljenostKm,
      /** Aerodrom nije u samom gradu - plan računa transfer (§2.4). */
      izvanGrada: najblizi.udaljenostKm > PRAG_BEZ_AERODROMA_KM
    };
  }

  /** Opis odredišta koji se šalje Planneru. */
  opisZaPlanner(grad) {
    if (!grad) return null;

    return {
      id: grad.id,
      naziv: grad.naziv,
      nazivEn: grad.nazivEn,
      drzava: grad.drzava,
      drzavaNaziv: grad.drzavaNaziv,
      lat: grad.lat,
      lon: grad.lon,
      aerodrom: this.aerodromZaGrad(grad),
      /*
       * Svi aerodromi grada, ne samo najblizi: grad sa kodom grada
       * (IST, LON, PAR) trazi let preko svih odjednom, pa se tek iz
       * izabrane ponude vidi gde se slece - a od toga zavisi transfer.
       */
      aerodromi: (grad.aerodromi || [])
        .filter((a) => a.udaljenostKm <= MAX_UDALJENOST_KM)
        .map((a) => ({
          iata: a.iata,
          naziv: a.naziv,
          udaljenostKm: a.udaljenostKm,
          izvanGrada: a.udaljenostKm > PRAG_BEZ_AERODROMA_KM
        }))
    };
  }

  /** Kratak zapis koji se čuva uz putovanje (§9). */
  zaPutovanje(grad) {
    if (!grad) return null;

    const aerodrom = this.aerodromZaGrad(grad);

    return {
      id: grad.id,
      naziv: grad.naziv,
      // Međunarodni naziv - prikaz na engleskom (dvojezični interfejs)
      nazivEn: grad.nazivEn,
      drzava: grad.drzava,
      drzavaNaziv: grad.drzavaNaziv,
      lat: grad.lat,
      lon: grad.lon,
      aerodrom
    };
  }
}

module.exports = CityResolver;
module.exports.PRAG_BEZ_AERODROMA_KM = PRAG_BEZ_AERODROMA_KM;
module.exports.MAX_UDALJENOST_KM = MAX_UDALJENOST_KM;
