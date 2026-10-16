const axios = require('axios');
const crypto = require('crypto');
const BaseAdapter = require('./BaseAdapter');
const FlightAdapter = require('./FlightAdapter');
const { kursAdapter } = require('./FrankfurterExchangeAdapter');
const { DUFFEL, duffelKonfigurisan } = require('../config/externalApis');
const { FlightsCacheModel, TTL } = require('../models/CacheModels');
const { ponudeSuUpotrebljive, jeTacno } = require('../utils/ponude');

/** Duffel odbija narudzbinu sa vise od 9 putnika (spec §4.8). */
const MAX_PUTNIKA = 9;

/**
 * Adapter za letove preko Duffel-a (spec §5).
 *
 * Duffel je izabran jer jedini od ispitanih servisa daje otvoren test
 * rezim u kom se ponuda moze i rezervisati i otkazati, bez komercijalnog
 * ugovora. U test rezimu leti izmisljena "Duffel Airways" (`ZZ`).
 *
 * Bez kljuca ili kada Duffel ne odgovori, vraca se na mock podatke
 * (vidi polje `source` u odgovoru).
 */
class DuffelFlightAdapter extends BaseAdapter {
  constructor() {
    super(FlightsCacheModel, TTL.flights);
    this.baseUrl = DUFFEL.baseUrl;
    this.mockAdapter = new FlightAdapter();
  }

  get maxPutnika() {
    return MAX_PUTNIKA;
  }

  _greska(poruka, code, statusCode) {
    const e = new Error(poruka);
    e.code = code;
    e.statusCode = statusCode;
    return e;
  }

  _zaglavlja() {
    return {
      Authorization: `Bearer ${DUFFEL.apiKey}`,
      'Duffel-Version': DUFFEL.version,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  /** Duffel gresku pretvara u citljivu poruku. */
  _porukaGreske(err) {
    const prva = err.response?.data?.errors?.[0];
    return prva ? `${prva.title}: ${prva.message || prva.detail || ''}`.trim() : err.message;
  }

  async _post(putanja, telo, params) {
    const odgovor = await axios.post(`${this.baseUrl}${putanja}`, telo, {
      headers: this._zaglavlja(),
      params,
      timeout: DUFFEL.timeout
    });

    return odgovor.data?.data;
  }

  async _get(putanja, params) {
    const odgovor = await axios.get(`${this.baseUrl}${putanja}`, {
      headers: this._zaglavlja(),
      params,
      timeout: DUFFEL.timeout
    });

    return odgovor.data?.data;
  }

  // ---------------------------------------------------------------
  // Prevod Duffel oblika u interni model
  // ---------------------------------------------------------------

  /** ISO 8601 trajanje -> minuti. Primer: "PT4H30M" -> 270 */
  parseDuration(trajanje) {
    if (!trajanje) return 0;

    const m = String(trajanje).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;

    const dani = parseInt(m[1], 10) || 0;
    const sati = parseInt(m[2], 10) || 0;
    const minuti = parseInt(m[3], 10) || 0;
    const sekunde = parseInt(m[4], 10) || 0;

    return dani * 24 * 60 + sati * 60 + minuti + Math.ceil(sekunde / 60);
  }

  /** Razlika dva vremena u minutima - rezerva kada Duffel ne posalje `duration`. */
  _trajanjeIzVremena(od, do_) {
    const a = new Date(od).getTime();
    const b = new Date(do_).getTime();

    if (Number.isNaN(a) || Number.isNaN(b)) return 0;

    return Math.max(0, Math.round((b - a) / 60000));
  }

  /** Duffel `slice` -> jedna noga puta (odlazak ili povratak). */
  _nogaIzSlice(slice) {
    if (!slice) return null;

    const segmenti = slice.segments || [];
    const prvi = segmenti[0];
    const poslednji = segmenti[segmenti.length - 1];

    if (!prvi || !poslednji) return null;

    const trajanje =
      this.parseDuration(slice.duration) ||
      this._trajanjeIzVremena(prvi.departing_at, poslednji.arriving_at);

    return {
      departure: prvi.departing_at,
      arrival: poslednji.arriving_at,
      duration: trajanje,
      stops: Math.max(0, segmenti.length - 1),
      segments: segmenti.map((s) => ({
        from: s.origin?.iata_code,
        to: s.destination?.iata_code,
        departure: s.departing_at,
        arrival: s.arriving_at,
        airline: s.operating_carrier?.iata_code || s.marketing_carrier?.iata_code,
        number: s.marketing_carrier_flight_number || s.operating_carrier_flight_number || null
      }))
    };
  }

  /**
   * Duffel ponuda -> interni model leta.
   *
   * `total_amount` je cena CELE ponude: oba smera i svi putnici. Zato se
   * nigde dalje ne mnozi brojem putnika.
   */
  async transformOffer(ponuda) {
    const slices = ponuda.slices || [];

    const odlazak = this._nogaIzSlice(slices[0]);
    const povratak = slices.length > 1 ? this._nogaIzSlice(slices[1]) : null;

    if (!odlazak) return null;

    const cena = parseFloat(ponuda.total_amount);
    const valuta = ponuda.total_currency || 'EUR';

    return {
      id: ponuda.id,
      offerId: ponuda.id,
      expiresAt: ponuda.expires_at || null,

      from: slices[0]?.origin?.iata_code || odlazak.segments[0]?.from,
      to:
        slices[0]?.destination?.iata_code ||
        odlazak.segments[odlazak.segments.length - 1]?.to,

      departure: odlazak.departure,
      arrival: odlazak.arrival,

      airline: ponuda.owner?.name || null,
      airlineIata: ponuda.owner?.iata_code || null,
      number: odlazak.segments[0]?.number || null,

      price: cena,
      currency: valuta,
      priceEUR: await kursAdapter.uEur(cena, valuta),

      duration: odlazak.duration + (povratak?.duration || 0),
      stops: odlazak.stops + (povratak?.stops || 0),

      outbound: odlazak,
      inbound: povratak,

      passengerIds: (ponuda.passengers || []).map((p) => p.id).filter(Boolean)
    };
  }

  async _transformResponse(ponude) {
    const letovi = [];

    for (const p of ponude || []) {
      const let_ = await this.transformOffer(p);
      if (let_) letovi.push(let_);
    }

    return letovi
      .sort((a, b) => (a.priceEUR ?? a.price) - (b.priceEUR ?? b.price))
      .slice(0, DUFFEL.maxRezultata);
  }

  // ---------------------------------------------------------------
  // Pretraga
  // ---------------------------------------------------------------

  /**
   * Povratni let ima dva `slices` (spec §4.3). Kada `checkOut` nije
   * poslat, trazi se jednosmerni let.
   */
  _teloZahteva(from, to, checkIn, checkOut, passengers) {
    const slices = [
      { origin: from, destination: to, departure_date: String(checkIn).slice(0, 10) }
    ];

    if (checkOut) {
      slices.push({
        origin: to,
        destination: from,
        departure_date: String(checkOut).slice(0, 10)
      });
    }

    return {
      data: {
        slices,
        passengers: Array.from({ length: passengers }, () => ({ type: 'adult' })),
        cabin_class: 'economy'
      }
    };
  }

  async _fetchFromDuffel(from, to, checkIn, checkOut, passengers) {
    const telo = this._teloZahteva(from, to, checkIn, checkOut, passengers);

    const zahtev = await this._post(DUFFEL.offerRequestsPath, telo, { return_offers: true });
    const letovi = await this._transformResponse(zahtev?.offers);

    console.log(
      `[DUFFEL] Dobijeno ${letovi.length} ponuda za ${from}->${to} ` +
      `${checkIn}${checkOut ? ` / ${checkOut}` : ''} (${passengers} putnika)`
    );

    return letovi;
  }

  async fetch(query) {
    const { from, to, checkIn, checkOut, passengers = 1 } = query;

    if (!from || !to || !checkIn) {
      throw this._greska(
        'Missing required parameters: from, to, checkIn',
        'VALIDATION_ERROR',
        400
      );
    }

    const brojPutnika = Math.max(1, parseInt(passengers, 10) || 1);
    const queryKey = `flights-${from}-${to}-${checkIn}-${checkOut || 'oneway'}-${brojPutnika}`;
    let source = 'cache';

    const rezultat = await this.withCache(queryKey, async () => {
      if (!duffelKonfigurisan()) {
        console.warn('[DUFFEL] Kljuc nije podesen - koristim mock podatke');
        source = 'mock';
        return this.mockAdapter.ucitajIFiltriraj({ ...query, passengers: brojPutnika });
      }

      try {
        source = 'duffel';
        return await this._fetchFromDuffel(from, to, checkIn, checkOut, brojPutnika);
      } catch (err) {
        console.error('[DUFFEL] Error:', this._porukaGreske(err));
        console.warn('[DUFFEL] Prelazim na mock podatke (fallback)');
        source = 'mock-fallback';
        return this.mockAdapter.ucitajIFiltriraj({ ...query, passengers: brojPutnika });
      }
      // Zapis ciji ponude samo sto nisu istekle se ne koristi
    }, { jeUpotrebljiv: ponudeSuUpotrebljive, preskociKes: jeTacno(query.refresh) });

    return { ...rezultat, source };
  }

  // ---------------------------------------------------------------
  // Izabrana ponuda za plan
  // ---------------------------------------------------------------

  /** Ponuda ciji je rok prosao ne sme da udje u plan. */
  _istekla(ponuda) {
    const istice = new Date(ponuda?.expiresAt || NaN).getTime();

    return Number.isFinite(istice) && istice <= Date.now();
  }

  /**
   * Ponuda koju je korisnik izabrao u koraku 2, po `offerId`-ju.
   *
   * Duffel svakoj pretrazi (offer request) daje NOVE id-jeve ponuda, pa
   * izbor ne sme da zavisi od toga da li ce ponovna pretraga pri pravljenju
   * plana pogoditi isti zapis u kesu. Redosled:
   *
   *   1. isti objekat koji je korisnik video - iz bilo kog zapisa kesa
   *      pretrage (i kada je isti upit u medjuvremenu dobio nov zapis,
   *      stari moze jos da postoji do isteka TTL-a);
   *   2. Duffel `GET /air/offers/:id` - ponuda se cita direktno, pa
   *      odgovor kaze i da li jos vazi (404/410 -> OFFER_EXPIRED).
   *
   * Bez kljuca id se rekonstruise iz mock oblika. Istekla ponuda se NE
   * vraca kao vazeca - plan ne sme da nastane od leta koji se ne moze
   * rezervisati.
   */
  async izabranaPonuda(offerId) {
    const id = String(offerId || '');

    if (!id) throw this._greska('Nedostaje offerId', 'VALIDATION_ERROR', 400);

    try {
      const zapis = await this.CacheModel.findOne({ 'data.offerId': id }).lean();
      const izKesa = (zapis?.data || []).find((p) => String(p?.offerId) === id);

      if (izKesa && !this._istekla(izKesa)) {
        return { data: izKesa, source: 'cache' };
      }
    } catch (err) {
      console.error('[INTEGRATION_SERVICE] Cache read error:', err.message);
    }

    const { data, source } = await this.ponuda(id);

    if (this._istekla(data)) {
      throw this._greska(
        'Ponuda vise ne vazi - potrebno je ponovo izabrati let',
        'OFFER_EXPIRED',
        410
      );
    }

    return { data, source };
  }

  // ---------------------------------------------------------------
  // Rezervacija (spec §4.8) - koristi se preko internih ruta
  // ---------------------------------------------------------------

  /** Ponovna provera ponude pred rezervaciju. */
  async ponuda(offerId) {
    if (!duffelKonfigurisan()) {
      return { data: this.mockAdapter.ponuda(offerId), source: 'mock' };
    }

    try {
      const ponuda = await this._get(`${DUFFEL.offersPath}/${offerId}`);

      if (!ponuda) throw this._greska('Ponuda nije pronadjena', 'OFFER_NOT_FOUND', 404);

      return { data: await this.transformOffer(ponuda), source: 'duffel' };
    } catch (err) {
      // 404 i 410 su odgovor servisa, ne kvar - prosledjuju se kakvi jesu
      const status = err.response?.status;

      if (status === 404 || status === 410) {
        throw this._greska(
          'Ponuda vise ne vazi - potrebno je ponovo generisati plan',
          'OFFER_EXPIRED',
          410
        );
      }

      if (err.code) throw err;

      throw this._greska(this._porukaGreske(err), 'DUFFEL_ERROR', 502);
    }
  }

  /**
   * Kreiranje narudzbine.
   * U test rezimu se placa sa Duffel balansa - nema kartice ni naplate
   * (spec §4.8: "tok je potpun, ali bez stvarne kupovine i naplate").
   */
  async kreirajNarudzbinu({ offerId, passengers, amount, currency }) {
    if (passengers.length > MAX_PUTNIKA) {
      throw this._greska(
        `Let treba rezervisati u vise delova (najvise ${MAX_PUTNIKA} putnika po rezervaciji)`,
        'TOO_MANY_PASSENGERS',
        422
      );
    }

    if (!duffelKonfigurisan()) {
      return { data: this._mockNarudzbina(offerId, passengers), source: 'mock' };
    }

    try {
      const narudzbina = await this._post(DUFFEL.ordersPath, {
        data: {
          type: 'instant',
          selected_offers: [offerId],
          passengers,
          payments: [
            {
              type: 'balance',
              currency,
              amount: Number(amount).toFixed(2)
            }
          ]
        }
      });

      return {
        data: {
          orderId: narudzbina.id,
          bookingReference: narudzbina.booking_reference,
          totalAmount: parseFloat(narudzbina.total_amount),
          currency: narudzbina.total_currency,
          createdAt: narudzbina.created_at
        },
        source: 'duffel'
      };
    } catch (err) {
      const podaci = err.response?.data?.errors?.[0] || {};

      // Duffel odbija previse putnika sa svojom greskom
      if (String(podaci.code || '').includes('passenger')) {
        throw this._greska(
          `Let treba rezervisati u vise delova (najvise ${MAX_PUTNIKA} putnika po rezervaciji)`,
          'TOO_MANY_PASSENGERS',
          422
        );
      }

      if (err.response?.status === 422 || err.response?.status === 410) {
        throw this._greska(
          'Ponuda vise ne vazi - potrebno je ponovo generisati plan',
          'OFFER_EXPIRED',
          410
        );
      }

      throw this._greska(this._porukaGreske(err), 'DUFFEL_ERROR', 502);
    }
  }

  /** Deterministicka mock narudzbina - PNR se racuna iz offerId-ja. */
  _mockNarudzbina(offerId, passengers) {
    const osnova = crypto.createHash('sha1').update(String(offerId)).digest('hex');
    const pnr = osnova.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, '0');

    const ponuda = this.mockAdapter.ponuda(offerId);

    return {
      orderId: `ord_mock_${osnova.slice(0, 10)}`,
      bookingReference: pnr,
      totalAmount: ponuda.price,
      currency: ponuda.currency,
      createdAt: new Date().toISOString(),
      passengersCount: passengers.length
    };
  }

  /**
   * Otkazivanje ide u dva koraka: prvo se trazi ponuda otkazivanja
   * (sa iznosom povracaja), pa se potvrdjuje. Bez potvrde narudzbina
   * ostaje aktivna.
   */
  async otkaziNarudzbinu(orderId) {
    if (!duffelKonfigurisan()) {
      return {
        data: {
          orderId,
          cancelled: true,
          confirmedAt: new Date().toISOString(),
          refundAmount: 0,
          refundCurrency: 'EUR'
        },
        source: 'mock'
      };
    }

    try {
      const trazeno = await this._post(DUFFEL.orderCancellationsPath, {
        data: { order_id: orderId }
      });

      const potvrda = await this._post(
        `${DUFFEL.orderCancellationsPath}/${trazeno.id}/actions/confirm`,
        {}
      );

      return {
        data: {
          orderId,
          cancelled: Boolean(potvrda?.confirmed_at),
          confirmedAt: potvrda?.confirmed_at || null,
          refundAmount: parseFloat(trazeno.refund_amount) || 0,
          refundCurrency: trazeno.refund_currency || null
        },
        source: 'duffel'
      };
    } catch (err) {
      throw this._greska(this._porukaGreske(err), 'DUFFEL_ERROR', 502);
    }
  }
}

module.exports = DuffelFlightAdapter;
