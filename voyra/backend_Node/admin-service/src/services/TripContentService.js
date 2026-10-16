const axios = require('axios');

const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || 'http://localhost:4002';
const TIMEOUT = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 30000;

/**
 * SADRZAJ KOJI UREDJUJE ADMINISTRATOR (spec §3.3).
 *
 * Destinacije, atrakcije i kategorije zive u Trip Service-u (spec §7),
 * pa Admin Service samo prosledjuje pozive na njegove INTERNE rute.
 *
 * Interne rute stiti `X-Internal-Key`, koji nikada ne izlazi iz
 * backenda. Proveru "da li je ovo zaista administrator" radi Admin
 * Service pre ovoga (`verifyAdmin`), jer interni kljuc govori samo da
 * poziv dolazi iz sistema, ne i ko ga je izazvao.
 */
class TripContentService {
  constructor() {
    this.url = TRIP_SERVICE_URL;
  }

  _headers() {
    return {
      'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
      'Content-Type': 'application/json'
    };
  }

  /** Greska iz Trip Service-a sa svim poljima (ukljucujuci `errors`). */
  _greska(err, podrazumevanaPoruka) {
    if (err.response) {
      const telo = err.response.data || {};
      const e = new Error(telo.message || podrazumevanaPoruka);

      e.code = telo.error || 'SERVICE_ERROR';
      e.statusCode = err.response.status;

      const { message, error, statusCode, success, ...ostalo } = telo;
      if (Object.keys(ostalo).length > 0) e.upstream = ostalo;

      return e;
    }

    const e = new Error('Trip Service trenutno nije dostupan');
    e.code = 'SERVICE_UNAVAILABLE';
    e.statusCode = 503;
    return e;
  }

  async _zahtev(metod, putanja, { telo = undefined, params = undefined, opis } = {}) {
    try {
      const odgovor = await axios({
        method: metod,
        url: `${this.url}${putanja}`,
        data: telo,
        params,
        headers: this._headers(),
        timeout: TIMEOUT
      });

      return odgovor.data.data;
    } catch (err) {
      console.error(`[ADMIN_SERVICE] ${opis}:`, err.message);
      throw this._greska(err, opis);
    }
  }

  // ---------------------------------------------------------------
  // Kategorije interesovanja
  // ---------------------------------------------------------------

  kategorije(sve = true) {
    return this._zahtev('get', '/internal/categories', {
      params: { sve: String(sve) },
      opis: 'Neuspesno citanje kategorija'
    });
  }

  kategorija(kljuc) {
    return this._zahtev('get', `/internal/categories/${encodeURIComponent(kljuc)}`, {
      opis: 'Neuspesno citanje kategorije'
    });
  }

  kreirajKategoriju(telo) {
    return this._zahtev('post', '/internal/categories', {
      telo,
      opis: 'Neuspesno kreiranje kategorije'
    });
  }

  izmeniKategoriju(kljuc, telo) {
    return this._zahtev('patch', `/internal/categories/${encodeURIComponent(kljuc)}`, {
      telo,
      opis: 'Neuspesna izmena kategorije'
    });
  }

  obrisiKategoriju(kljuc) {
    return this._zahtev('delete', `/internal/categories/${encodeURIComponent(kljuc)}`, {
      opis: 'Neuspesno gasenje kategorije'
    });
  }

  // ---------------------------------------------------------------
  // Atrakcije administratora
  // ---------------------------------------------------------------

  atrakcije(gradId, sve = true) {
    return this._zahtev('get', '/internal/attractions', {
      params: { gradId, sve: String(sve) },
      opis: 'Neuspesno citanje atrakcija'
    });
  }

  atrakcija(id) {
    return this._zahtev('get', `/internal/attractions/${encodeURIComponent(id)}`, {
      opis: 'Neuspesno citanje atrakcije'
    });
  }

  kreirajAtrakciju(telo) {
    return this._zahtev('post', '/internal/attractions', {
      telo,
      opis: 'Neuspesno kreiranje atrakcije'
    });
  }

  izmeniAtrakciju(id, telo) {
    return this._zahtev('patch', `/internal/attractions/${encodeURIComponent(id)}`, {
      telo,
      opis: 'Neuspesna izmena atrakcije'
    });
  }

  obrisiAtrakciju(id) {
    return this._zahtev('delete', `/internal/attractions/${encodeURIComponent(id)}`, {
      opis: 'Neuspesno gasenje atrakcije'
    });
  }

  // ---------------------------------------------------------------
  // Istaknute destinacije
  // ---------------------------------------------------------------

  destinacije(sve = true) {
    return this._zahtev('get', '/internal/destinations', {
      params: { sve: String(sve) },
      opis: 'Neuspesno citanje destinacija'
    });
  }

  kreirajDestinaciju(telo) {
    return this._zahtev('post', '/internal/destinations', {
      telo,
      opis: 'Neuspesno kreiranje destinacije'
    });
  }

  izmeniDestinaciju(id, telo) {
    return this._zahtev('patch', `/internal/destinations/${encodeURIComponent(id)}`, {
      telo,
      opis: 'Neuspesna izmena destinacije'
    });
  }

  obrisiDestinaciju(id) {
    return this._zahtev('delete', `/internal/destinations/${encodeURIComponent(id)}`, {
      opis: 'Neuspesno brisanje destinacije'
    });
  }

  poredjajDestinacije(ids) {
    return this._zahtev('patch', '/internal/destinations/order', {
      telo: { ids },
      opis: 'Neuspesna promena redosleda destinacija'
    });
  }
}

module.exports = TripContentService;
