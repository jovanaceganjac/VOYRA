const PlanSession = require('../models/PlanSession');
const PlanAggregator = require('./PlanAggregator');
const CityResolver = require('./CityResolver');

const PlannerClient = require('./clients/PlannerClient');
const BookingClient = require('./clients/BookingClient');
const TripClient = require('./clients/TripClient');
const NotificationClient = require('./clients/NotificationClient');
const AdminClient = require('./clients/AdminClient');

const TTL_SATI = parseInt(process.env.PLAN_SESSION_TTL_HOURS, 10) || 24;
const TTL_FAILED_DANA = parseInt(process.env.FAILED_SESSION_TTL_DAYS, 10) || 7;

/**
 * Orkestracija /v1/plan.
 *
 * Kriticno je samo planiranje. Booking, Trip, Notification i Admin
 * obogacuju odgovor - njihov pad daje upozorenje, a plan se i dalje
 * vraca sa statusom 200.
 */
class OrchestrationService {
  constructor() {
    this.planner = new PlannerClient();
    this.booking = new BookingClient();
    this.trip = new TripClient();
    this.notification = new NotificationClient();
    this.admin = new AdminClient();
    this.gradovi = new CityResolver();
  }

  _greska(poruka, code, statusCode, dodatno = {}) {
    const e = new Error(poruka);
    e.code = code;
    e.statusCode = statusCode;
    Object.assign(e, dodatno);
    return e;
  }

  /**
   * @param {object} ctx - { zahtev, user, token, requestId, saveTrip, tripId }
   */
  async plan(ctx) {
    const { zahtev, user, token, requestId, saveTrip, tripId, sessionId: sesijaGosta } = ctx;

    const pocetak = Date.now();
    const timings = {};
    const warnings = [];
    const ruta = `${zahtev.from}-${zahtev.to}`;

    const izvori = {
      flights: null,
      accommodations: null,
      booking: 'unavailable',
      trip: 'not-saved',
      notification: 'skipped'
    };

    // --- KORAK 4: postojece putovanje mora da postoji i da je korisnikovo ---
    if (tripId) {
      try {
        await this.trip.get(tripId, token, requestId);
      } catch (err) {
        // Trip Service vraca 404 i za tudje putovanje - ne otkriva postojanje
        throw this._greska('Putovanje nije pronadjeno', 'TRIP_NOT_FOUND', 404);
      }
    }

    /*
     * --- Gradovi (spec §4.2) ---
     *
     * Zahtev moze da nosi `fromCityId`/`toCityId` ili stari IATA kod;
     * oba se svode na isti opis grada. Planner dobija naziv, drzavu i
     * KOORDINATE, pa spoljni izvori ne moraju da pogadjaju grad po imenu.
     */
    const [gradOd, gradDo] = await Promise.all([
      this.gradovi.izZahteva(zahtev, 'from', requestId).catch(() => null),
      this.gradovi.izZahteva(zahtev, 'to', requestId).catch(() => null)
    ]);

    /*
     * Ono sto se cuva i vraca klijentu: IATA kod za let i kratak zapis
     * grada. Posle ovoga prikaz ne mora da prevodi kod u naziv.
     */
    const zahtevZaZapis = {
      ...zahtev,
      from: this.gradovi.kodZaLet(gradOd) || zahtev.from,
      to: this.gradovi.kodZaLet(gradDo) || zahtev.to,
      fromCity: this.gradovi.zaPutovanje(gradOd),
      toCity: this.gradovi.zaPutovanje(gradDo)
    };

    // Planner uz to dobija i koordinate, pa spoljni izvori ne pogadjaju grad
    const zahtevSaGradovima = {
      ...zahtevZaZapis,
      destination: this.gradovi.opisZaPlanner(gradDo),
      origin: this.gradovi.opisZaPlanner(gradOd)
    };

    // --- KORAK 5: Planner (KRITICNO) ---
    let itinerary;

    try {
      const r = await this.planner.plan(zahtevSaGradovima, requestId);
      itinerary = r.itinerary;
      timings.planner = r.durationMs;
    } catch (err) {
      await this._zabeleziNeuspeh({ ctx, ruta, err, trajanje: Date.now() - pocetak });

      // Planner je odbio zahtev (npr. neispravni datumi) - prosledi razlog
      // Telo greske ide dalje (npr. `selection` uz 410 SELECTION_EXPIRED)
      if (err.statusCode && err.statusCode < 500) {
        throw this._greska(err.message, err.code || 'PLANNER_ERROR', err.statusCode, {
          upstream: err.upstream
        });
      }

      throw this._greska(
        'Planner Service trenutno nije dostupan',
        'PLANNER_UNAVAILABLE',
        503
      );
    }

    // Izvor podataka dolazi iz Plannera - orchestrator ga samo prenosi
    izvori.flights = itinerary?.meta?.sources?.flights || null;
    izvori.accommodations = itinerary?.meta?.sources?.accommodations || null;

    if ([izvori.flights, izvori.accommodations].some((s) => s && s.startsWith('mock'))) {
      warnings.push('Prikazani su demonstracioni podaci');
    }

    // Planner sam prijavljuje sta je moralo da se skrati ili prekoraci
    for (const u of itinerary?.warnings || []) {
      if (!warnings.includes(u)) warnings.push(u);
    }

    // --- KORAK 6: Booking validacija (NIJE kriticno) ---
    let bookingEstimate = PlanAggregator.procenaIzPlana(itinerary, zahtev.budget);

    // Stvarni /api/bookings/validate proverava ponude u VEC SACUVANOM
    // putovanju, pa ima smisla samo kada tripId postoji.
    if (tripId) {
      try {
        const { rezultat, durationMs } = await this.booking.validate(
          {
            tripId,
            flightOfferIds: (itinerary.flights || []).map((f) => f.id),
            propertyIds: (itinerary.accommodations || []).map((a) => a.id)
          },
          token,
          requestId
        );

        timings.booking = durationMs;
        bookingEstimate = PlanAggregator.procenaSaValidacijom(itinerary, zahtev.budget, rezultat);
        izvori.booking = rezultat.valid ? 'validated' : 'unavailable';
      } catch (err) {
        warnings.push('Provera rezervacije trenutno nije dostupna');
        izvori.booking = 'unavailable';
      }
    } else {
      // Nema sacuvanog putovanja - procena je iz samog plana
      izvori.booking = 'estimated';
    }

    // --- KORAK 7: cuvanje putovanja (NIJE kriticno) ---
    let savedTripId = null;

    if (saveTrip || tripId) {
      try {
        const r = tripId
          ? await this.trip.update(tripId, itinerary, zahtevZaZapis, token, requestId)
          : await this.trip.save(itinerary, zahtevZaZapis, token, requestId);

        timings.trip = r.durationMs;
        savedTripId = String(r.trip._id);
        izvori.trip = tripId ? 'updated' : 'saved';

        // --- KORAK 8: notifikacija (fire-and-forget) ---
        if (!tripId) {
          this.notification
            .tripSaved({ userId: user.id, trip: r.trip, zahtev }, requestId)
            .then((n) => {
              izvori.notification = n.sent ? 'queued' : 'unavailable';
            })
            .catch(() => {});

          izvori.notification = 'queued';
        }
      } catch (err) {
        warnings.push('Putovanje nije sačuvano — pokušajte ponovo');
        izvori.trip = 'not-saved';
      }
    }

    timings.total = Date.now() - pocetak;

    /*
     * --- Statistika popularnih destinacija (spec §4.1) ---
     *
     * Belezi se grad ODREDISTA, i to tek kada je plan zaista napravljen.
     * Poziv je "posalji i zaboravi": statistika pocetne strane ne sme da
     * uspori odgovor ni da obori planiranje ako Trip Service ne odgovori.
     */
    if (gradDo?.id) {
      this.trip
        .zabeleziPretragu(
          {
            gradId: gradDo.id,
            vrsta: 'pretraga',
            userId: user?.id || null,
            sessionId: sesijaGosta || null
          },
          requestId
        )
        .catch(() => {});

      // Sacuvan plan je jaci signal od pretrage - broji se odvojeno
      if (savedTripId) {
        this.trip
          .zabeleziPretragu(
            {
              gradId: gradDo.id,
              vrsta: 'sacuvano',
              userId: user?.id || null,
              sessionId: sesijaGosta || null
            },
            requestId
          )
          .catch(() => {});
      }
    }

    // --- KORAK 10: sklapanje odgovora i sesija ---
    const sessionId = PlanAggregator.noviSessionId();

    const odgovor = PlanAggregator.sastavi({
      sessionId,
      zahtev: zahtevZaZapis,
      itinerary,
      bookingEstimate,
      izvori,
      savedTripId,
      warnings,
      timings,
      ttlSati: TTL_SATI
    });

    await PlanSession.create({
      sessionId,
      userId: user?.id || null,
      requestId,
      // Sa gradovima: `sacuvaj()` ih odavde uzima, bez novog razresavanja
      request: zahtevZaZapis,
      response: odgovor,
      status: 'READY',
      route: ruta,
      sources: { flights: izvori.flights, accommodations: izvori.accommodations },
      savedTripId,
      durationMs: timings.total,
      expiresAt: new Date(Date.now() + TTL_SATI * 3600 * 1000)
    });

    // --- KORAK 9: audit (fire-and-forget, ne ceka se) ---
    this.admin
      .log(
        {
          action: 'PLAN_TRIP',
          userId: user?.id || null,
          target: ruta,
          status: 'SUCCESS',
          metadata: { sessionId, savedTripId, route: ruta, durationMs: timings.total }
        },
        requestId
      )
      .catch(() => {});

    return odgovor;
  }

  /**
   * POST /v1/plan/:sessionId/save - cuva TACNO onaj plan koji je korisnik
   * video.
   *
   * Ranije je frontend cuvao putovanje tako sto je ponovo slao isti
   * zahtev sa `X-Save-Trip`. Sa pravim izvorom to je nova pretraga: druge
   * ponude, verovatno druga cena, pa bi korisnik sacuvao plan koji nije
   * gledao. Ovde se upisuje snimljena sesija, bez ijednog novog poziva.
   *
   * Idempotentno: drugi poziv vraca postojeci `savedTripId`.
   */
  async sacuvajSesiju({ sessionId, user, token, requestId }) {
    const sesija = await PlanSession.findOne({ sessionId });

    if (!sesija || sesija.status !== 'READY') {
      throw this._greska(
        'Plan vise ne postoji - generisi ga ponovo',
        'SESSION_NOT_FOUND',
        404
      );
    }

    // Gostujuca sesija (userId === null) moze da se preuzme pri prijavi;
    // tudja prijavljena sesija ne moze
    if (sesija.userId && sesija.userId !== user.id) {
      throw this._greska('Plan pripada drugom korisniku', 'FORBIDDEN', 403);
    }

    if (sesija.savedTripId) {
      return { savedTripId: sesija.savedTripId, vecSacuvano: true, warnings: [] };
    }

    const zahtev = sesija.request || {};
    const itinerary = sesija.response?.itinerary;

    if (!itinerary) {
      throw this._greska('Sesija nema plan koji bi mogao da se sacuva', 'SESSION_EMPTY', 409);
    }

    const upozorenja = [];
    let trip;

    try {
      const r = await this.trip.save(itinerary, zahtev, token, requestId);
      trip = r.trip;
    } catch (err) {
      throw this._greska('Putovanje nije sačuvano — pokušajte ponovo', 'TRIP_SAVE_FAILED', 502);
    }

    sesija.savedTripId = String(trip._id);
    sesija.userId = sesija.userId || user.id;

    // Sacuvano putovanje ulazi u popularnost odredista (spec §4.1)
    if (zahtev.toCity?.id) {
      this.trip
        .zabeleziPretragu(
          { gradId: zahtev.toCity.id, vrsta: 'sacuvano', userId: user.id, sessionId: null },
          requestId
        )
        .catch(() => {});
    }

    if (sesija.response) {
      sesija.response.savedTripId = sesija.savedTripId;
      sesija.markModified('response');
    }

    await sesija.save();

    this.notification
      .tripSaved({ userId: user.id, trip, zahtev }, requestId)
      .catch(() => {});

    this.admin
      .log(
        {
          action: 'SAVE_PLAN',
          userId: user.id,
          target: sesija.route,
          status: 'SUCCESS',
          metadata: { sessionId, savedTripId: sesija.savedTripId }
        },
        requestId
      )
      .catch(() => {});

    return { savedTripId: sesija.savedTripId, vecSacuvano: false, warnings: upozorenja };
  }

  /** Neuspeli planovi se takodje beleze - ulaze u statistiku. */
  async _zabeleziNeuspeh({ ctx, ruta, err, trajanje }) {
    const sessionId = PlanAggregator.noviSessionId();

    try {
      await PlanSession.create({
        sessionId,
        userId: ctx.user?.id || null,
        requestId: ctx.requestId,
        request: ctx.zahtev,
        status: 'FAILED',
        errorCode: err.code || 'PLANNER_UNAVAILABLE',
        route: ruta,
        durationMs: trajanje,
        expiresAt: new Date(Date.now() + TTL_FAILED_DANA * 24 * 3600 * 1000)
      });
    } catch (e) {
      console.error('[ORCHESTRATOR] Upis neuspele sesije nije uspeo:', e.message);
    }

    this.admin
      .log(
        {
          action: 'PLAN_TRIP',
          userId: ctx.user?.id || null,
          target: ruta,
          status: 'FAILURE',
          errorMessage: err.message,
          metadata: { sessionId, route: ruta }
        },
        ctx.requestId
      )
      .catch(() => {});
  }

  /**
   * Sacuvana sesija. Sesiju prijavljenog korisnika sme da vidi samo on
   * (inace 404, ne 403 - ne otkriva se da sesija postoji).
   */
  async getSession(sessionId, user) {
    const s = await PlanSession.findOne({ sessionId, status: 'READY' });

    if (!s) {
      throw this._greska('Sesija nije pronadjena ili je istekla', 'NOT_FOUND', 404);
    }

    if (s.userId && s.userId !== user?.id) {
      throw this._greska('Sesija nije pronadjena ili je istekla', 'NOT_FOUND', 404);
    }

    return s.response;
  }
}

module.exports = OrchestrationService;
