const PlannerClient = require('./clients/PlannerClient');
const TripClient = require('./clients/TripClient');
const PlanEditService = require('./PlanEditService');

/**
 * OSVEŽAVANJE I ZAMENA LETA (spec §4.8).
 *
 * Duffel ponuda važi 20–30 minuta, a korisnik se na sačuvano putovanje
 * vraća posle sati ili dana. Bez ovoga `validate` uvek vrati `410`, pa se
 * sačuvano putovanje praktično ne može rezervisati.
 *
 * Isti let se traži po **otisku**: kompanija, brojevi letova i vremena
 * polaska svih segmenata. Cena namerno nije deo otiska — ona se i menja,
 * i upravo je to ono što korisnik treba da potvrdi.
 */
class FlightChangeService {
  constructor() {
    this.planner = new PlannerClient();
    this.trip = new TripClient();
    this.plan = new PlanEditService();
  }

  _greska(poruka, kod, status, dodatno = {}) {
    const e = new Error(poruka);
    e.code = kod;
    e.statusCode = status;
    Object.assign(e, dodatno);
    return e;
  }

  /** Let se menja samo dok putovanje nije rezervisano. */
  _zaIzmenuLeta(trip) {
    if (trip.status !== 'NACRT') {
      throw this._greska(
        trip.status === 'REZERVISANO'
          ? 'Let je već rezervisan — otkažite rezervaciju pre promene leta'
          : `Putovanje u statusu ${trip.status} se više ne menja`,
        'NOT_EDITABLE',
        409
      );
    }
  }

  // ---------------------------------------------------------------
  // Otisak leta
  // ---------------------------------------------------------------

  /** Jedan segment u otisku: kompanija, broj leta i vreme polaska. */
  _segment(s) {
    return [
      String(s?.airline || '').toUpperCase(),
      String(s?.number || ''),
      String(s?.departure || '').slice(0, 16)
    ].join(':');
  }

  /** Segmenti noge; kada ih izvor ne razlaže, uzima se sama noga. */
  _noga(noga) {
    if (!noga) return '-';

    const segmenti = Array.isArray(noga.segments) && noga.segments.length > 0
      ? noga.segments
      : [{ airline: noga.airline, number: noga.number, departure: noga.departure }];

    return segmenti.map((s) => this._segment(s)).join('|');
  }

  /**
   * Otisak cele ponude. Dve ponude sa istim otiskom su ISTI let, ma koliko
   * se `offerId` promenio između dve pretrage.
   */
  otisak(ponuda) {
    if (!ponuda) return null;

    const kompanija = String(ponuda.airlineIata || ponuda.airline || '').toUpperCase();

    return `${kompanija}#${this._noga(ponuda.outbound)}#${this._noga(ponuda.inbound)}`;
  }

  // ---------------------------------------------------------------
  // Osvežavanje
  // ---------------------------------------------------------------

  /** Sveža lista ponuda za rutu i datume putovanja, bez keša. */
  async _svezeponude(trip, requestId) {
    const r = await this.planner.flights(
      {
        from: trip.from,
        to: trip.to,
        checkIn: trip.checkIn,
        checkOut: trip.checkOut,
        passengers: trip.passengers,
        budget: trip.budget,
        preferences: trip.preferences || trip.itinerary?.preferences || {},
        refresh: true
      },
      requestId
    );

    return r.ponude || [];
  }

  /** Let koji je u putovanju izabran (isti redosled kao u booking-service). */
  _letIzPutovanja(trip) {
    const plan = trip.itinerary || {};

    return plan.selectedFlight || (plan.flights || []).find((f) => f.recommended) || (plan.flights || [])[0] || null;
  }

  /**
   * `POST /v1/trips/:id/flight/refresh`
   *
   * @returns {{ found, oldPrice, newPrice, priceChanged, flight, version }}
   *          ili `{ found: false, alternatives }`
   */
  async osvezi(tripId, { token, requestId }) {
    const trip = await this.plan.ucitaj(tripId, token, requestId);
    this._zaIzmenuLeta(trip);

    const stari = this._letIzPutovanja(trip);

    if (!stari) {
      throw this._greska(
        'Putovanje nema izabran let — generišite plan ponovo',
        'NO_FLIGHT_IN_TRIP',
        409
      );
    }

    const ponude = await this._svezeponude(trip, requestId);
    const trazeniOtisak = this.otisak(stari);
    const isti = ponude.find((p) => this.otisak(p) === trazeniOtisak);

    if (!isti) {
      return {
        found: false,
        oldFlight: stari,
        // Lista je već rangirana po sačuvanom `transportPriority` (Faza 1)
        alternatives: ponude,
        version: this.plan.verzija(trip)
      };
    }

    const staraCena = Number(stari.priceEUR ?? stari.price ?? 0);
    const novaCena = Number(isti.priceEUR ?? isti.price ?? 0);

    const sacuvan = await this._upisiLet(trip, isti, token, requestId);

    return {
      found: true,
      oldPrice: staraCena,
      newPrice: novaCena,
      priceChanged: Math.abs(novaCena - staraCena) > 0.01,
      flight: isti,
      currency: isti.currency || 'EUR',
      version: this.plan.verzija(sacuvan)
    };
  }

  /**
   * Upisuje novi let u plan. Kada je let ISTI (samo osvežen `offerId`),
   * dani se ne diraju — vremena su ista, pa nema šta da se preračuna.
   */
  async _upisiLet(trip, ponuda, token, requestId, itinerary = null) {
    const plan = trip.itinerary || {};

    const noviPlan = {
      ...plan,
      selectedFlight: ponuda,
      // Lista ponuda se osvežava zajedno sa izborom, da ne ostane stara
      flights: [ponuda, ...(plan.flights || []).filter((f) => f.offerId !== ponuda.offerId)].slice(0, 5),
      ...(itinerary ? { itinerary } : {})
    };

    const trosak = this._trosakSaLetom(trip, noviPlan, ponuda);

    return this.trip.sacuvajPlan(
      trip._id,
      { ...noviPlan, totalBudget: trosak },
      { version: this.plan.verzija(trip), budget: trip.budget },
      token,
      requestId
    );
  }

  /** Cena leta je jedina stavka koja se ovde menja. */
  _trosakSaLetom(trip, plan, ponuda) {
    const stari = plan.totalBudget || {};
    const cenaLeta = Number(ponuda.priceEUR ?? ponuda.price ?? 0);

    const ukupno =
      Math.round((cenaLeta + (stari.accommodations || 0) + (stari.attractions || 0)) * 100) / 100;

    const budzet = Number(trip.budget);
    const imaBudzet = Number.isFinite(budzet) && budzet > 0;

    return {
      ...stari,
      flights: cenaLeta,
      total: ukupno,
      currency: stari.currency || ponuda.currency || 'EUR',
      overBudget: imaBudzet ? ukupno > budzet : false,
      overBy: imaBudzet && ukupno > budzet ? Math.round((ukupno - budzet) * 100) / 100 : 0
    };
  }

  // ---------------------------------------------------------------
  // Zamena leta
  // ---------------------------------------------------------------

  /**
   * `PUT /v1/trips/:id/flight` — klijent šalje samo `offerId`, a server
   * ponudu razrešava iz sveže liste.
   *
   * Drugi let znači druga vremena polaska i povratka, pa se **prvi i
   * poslednji dan** preračunavaju: prozor dana dolazi iz `Dani.js`, a
   * satnica iz `schedule-day`. Pravilo važi i ovde — ništa se
   * ne izbacuje, kršenja se samo obeležavaju.
   */
  async zameni(tripId, offerId, version, { token, requestId }) {
    const trip = await this.plan.ucitaj(tripId, token, requestId);
    this._zaIzmenuLeta(trip);

    if (!offerId) {
      throw this._greska('Nedostaje offerId', 'VALIDATION_ERROR', 400);
    }

    const ponude = await this._svezeponude(trip, requestId);
    const izabran = ponude.find((p) => String(p.offerId || p.id) === String(offerId));

    if (!izabran) {
      throw this._greska(
        'Izabrani let više nije dostupan — osvežite listu',
        'SELECTION_EXPIRED',
        410
      );
    }

    const { itinerary, izmenjeniDani } = await this._preracunajKrajnjeDane(
      trip,
      izabran,
      requestId
    );

    const sacuvan = await this._upisiLet(
      { ...trip, updatedAt: version || trip.updatedAt },
      izabran,
      token,
      requestId,
      itinerary
    );

    return {
      trip: sacuvan,
      flight: izabran,
      changedDays: izmenjeniDani,
      version: this.plan.verzija(sacuvan)
    };
  }

  /**
   * Novi prozori prvog i poslednjeg dana + nova satnica za njih.
   * Planner računa prozore (`Dani.js`), pa se ista pravila ne prepisuju.
   */
  async _preracunajKrajnjeDane(trip, ponuda, requestId) {
    const dani = trip.itinerary?.itinerary || [];

    if (dani.length === 0) return { itinerary: dani, izmenjeniDani: [] };

    const preferencije = trip.preferences || trip.itinerary?.preferences || {};

    const noviProzori = await this.planner.tripDays(
      {
        checkIn: trip.checkIn,
        checkOut: trip.checkOut,
        preferences: preferencije,
        flight: ponuda
      },
      requestId
    );

    const start = this.plan.polaziste(trip);
    const krajnji = [dani[0].day, dani[dani.length - 1].day];

    const noviDani = [];

    for (const dan of dani) {
      if (!krajnji.includes(dan.day)) continue;

      const prozor = noviProzori.find((d) => d.day === dan.day);
      if (!prozor) continue;

      const isti =
        prozor.availableFrom === dan.availableFrom && prozor.availableTo === dan.availableTo;

      if (isti) continue;

      const novi = await this.planner.scheduleDay(
        {
          day: {
            day: dan.day,
            date: dan.date,
            availableFrom: prozor.availableFrom,
            availableTo: prozor.availableTo,
            note: prozor.note
          },
          start,
          attractions: dan.attractions || []
        },
        requestId
      );

      noviDani.push({ ...dan, ...novi, flight: dan.flight, accommodation: dan.accommodation });
    }

    const itinerary = dani.map((d) => noviDani.find((n) => n.day === d.day) || d);

    return { itinerary, izmenjeniDani: noviDani };
  }
}

module.exports = FlightChangeService;
