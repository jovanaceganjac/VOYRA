const BaseAdapter = require('./BaseAdapter');
const { loadMockData } = require('../utils/mockData');
const { FlightsCacheModel, TTL } = require('../models/CacheModels');
const { ponudeSuUpotrebljive, jeTacno } = require('../utils/ponude');
const { demoLetovi } = require('../utils/demoGenerator');

const MAX_REZULTATA = 5;

/**
 * Vremena leta se racunaju kao da su UTC, samo da racun ne zavisi od
 * zone servera; u odgovoru ostaju bez oznake zone (lokalno vreme
 * aerodroma), jer takva dolaze i od Duffel-a.
 */
const kaoUtc = (iso) => new Date(`${String(iso).slice(0, 19)}Z`);
const bezZone = (d) => d.toISOString().slice(0, 19);

/** Koliko dugo mock ponuda "vazi" - Duffel ponude takodje isticu. */
const VAZENJE_PONUDE_MIN = parseInt(process.env.MOCK_OFFER_TTL_MINUTES, 10) || 20;

/**
 * Nastavci u mock `offerId`-ju kojima se namerno izaziva granicni slucaj.
 * Sluze proveri toka rezervacije bez pravih kljuceva (spec §4.8).
 */
const ISTEKLA = '_expired';
const PROMENJENA_CENA = '_pricechange';

/** Za koliko se cena promeni kada se trazi taj granicni slucaj. */
const RAZLIKA_CENE = 25;

/**
 * Mock adapter za letove.
 *
 * Vraca isti oblik kao DuffelFlightAdapter: povratna ponuda sa
 * `outbound` i `inbound`, ukupnom cenom za SVE putnike (tako radi i
 * Duffel) i rokom vazenja. Koristi se kada nema `DUFFEL_API_KEY` ili
 * kada Duffel ne odgovori.
 */
class FlightAdapter extends BaseAdapter {
  constructor() {
    super(FlightsCacheModel, TTL.flights);
  }

  // ---------------------------------------------------------------
  // Mock offerId nosi sve sto treba da se ponuda kasnije rekonstruise
  // ---------------------------------------------------------------

  napraviOfferId({ flightId, from, to, checkIn, checkOut, passengers }) {
    const delovi = [
      'off',
      'mock',
      flightId,
      `${from}${to}`,
      String(checkIn).slice(0, 10),
      checkOut ? String(checkOut).slice(0, 10) : 'oneway',
      passengers
    ];

    return delovi.join('_');
  }

  /** Suprotno od napraviOfferId; vraca null ako id nije mock. */
  procitajOfferId(offerId) {
    const tekst = String(offerId || '');

    const istekla = tekst.endsWith(ISTEKLA);
    const promenjenaCena = tekst.endsWith(PROMENJENA_CENA);
    const osnovni = tekst.replace(ISTEKLA, '').replace(PROMENJENA_CENA, '');

    const d = osnovni.split('_');
    if (d.length !== 7 || d[0] !== 'off' || d[1] !== 'mock') return null;

    const ruta = d[3];
    if (ruta.length !== 6) return null;

    return {
      flightId: Number(d[2]),
      from: ruta.slice(0, 3),
      to: ruta.slice(3),
      checkIn: d[4],
      checkOut: d[5] === 'oneway' ? null : d[5],
      passengers: Number(d[6]) || 1,
      istekla,
      promenjenaCena
    };
  }

  // ---------------------------------------------------------------
  // Pomeranje fiksnih mock datuma na trazene
  // ---------------------------------------------------------------

  /**
   * Mock fajl ima fiksne datume poletanja. Pomeraju se na trazeni datum
   * uz ocuvano vreme i trajanje leta, a segmenti zadrzavaju svoje
   * razmake - inace bi plan za decembar prikazivao let iz oktobra.
   *
   * Vremena leta su LOKALNO vreme aerodroma, bez oznake zone - isti
   * oblik koji vraca Duffel (`departing_at`). Racun ide preko `Z`, da
   * rezultat ne zavisi od vremenske zone servera, a rezultat se ispisuje
   * bez zone.
   */
  _pomeriNogu(noga, datum) {
    if (!noga || !datum) return null;

    const dan = String(datum).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dan)) return noga;

    const polazak = kaoUtc(`${dan}T${noga.polazak.slice(11, 19)}`);
    if (Number.isNaN(polazak.getTime())) return noga;

    // Pomeraj koji vazi za sve segmente iste noge
    const pomeraj = polazak.getTime() - kaoUtc(noga.polazak).getTime();
    const pomeri = (iso) => bezZone(new Date(kaoUtc(iso).getTime() + pomeraj));

    return {
      ...noga,
      polazak: bezZone(polazak),
      dolazak: pomeri(noga.dolazak),
      segmenti: (noga.segmenti || []).map((s) => ({
        ...s,
        polazak: pomeri(s.polazak),
        dolazak: pomeri(s.dolazak)
      }))
    };
  }

  /** Mock oblik noge -> interni oblik. */
  _nogaUInterni(noga) {
    if (!noga) return null;

    return {
      departure: noga.polazak,
      arrival: noga.dolazak,
      duration: noga.trajanje,
      stops: noga.presedanja,
      segments: (noga.segmenti || []).map((s) => ({
        from: s.from,
        to: s.to,
        departure: s.polazak,
        arrival: s.dolazak,
        airline: s.iata,
        number: s.broj
      }))
    };
  }

  /** Mock zapis -> interni model leta (isti oblik koji vraca Duffel). */
  normalize(zapis, { from, to, checkIn, checkOut, passengers, promenjenaCena, istekla }) {
    const odlazak = this._nogaUInterni(this._pomeriNogu(zapis.odlazak, checkIn));
    const povratak = checkOut
      ? this._nogaUInterni(this._pomeriNogu(zapis.povratak, checkOut))
      : null;

    const brojPutnika = Math.max(1, parseInt(passengers, 10) || 1);

    // Duffel vraca ukupnu cenu za celu ponudu (sve putnike, oba smera)
    let cena = zapis.cenaPoPutniku * brojPutnika * (povratak ? 1 : 0.6);
    if (promenjenaCena) cena += RAZLIKA_CENE;
    cena = Math.round(cena * 100) / 100;

    const offerId = this.napraviOfferId({
      flightId: zapis.id,
      from,
      to,
      checkIn,
      checkOut,
      passengers: brojPutnika
    }) + (promenjenaCena ? PROMENJENA_CENA : '') + (istekla ? ISTEKLA : '');

    const istice = istekla
      ? new Date(Date.now() - 60 * 1000)
      : new Date(Date.now() + VAZENJE_PONUDE_MIN * 60 * 1000);

    return {
      id: offerId,
      offerId,
      expiresAt: istice.toISOString(),

      from,
      to,
      // Ravna polja opisuju odlazak - dnevni plan i stariji prikaz ih koriste
      departure: odlazak?.departure || null,
      arrival: odlazak?.arrival || null,

      airline: zapis.avioKompanija,
      airlineIata: zapis.iata,
      number: odlazak?.segments?.[0]?.number || null,

      price: cena,
      currency: zapis.valuta || 'EUR',
      priceEUR: cena,

      // Rangiranje u Planneru radi nad ukupnim trajanjem i presedanjima
      duration: (odlazak?.duration || 0) + (povratak?.duration || 0),
      stops: (odlazak?.stops || 0) + (povratak?.stops || 0),

      outbound: odlazak,
      inbound: povratak,

      // Duffel trazi ove ID-jeve pri kreiranju narudzbine
      passengerIds: Array.from({ length: brojPutnika }, (_, i) => `pas_mock_${i + 1}`),

      source: 'mock'
    };
  }

  /**
   * Ucitavanje + filtriranje bez kesa.
   * Izdvojeno da bi DuffelFlightAdapter mogao da ga pozove kao fallback,
   * a da pritom ne upisuje drugi zapis u isti kes.
   */
  /** "44.79,20.45" ili { lat, lon } -> { lat, lon }; inace null. */
  _koordinate(vrednost) {
    if (!vrednost) return null;

    if (typeof vrednost === 'object') {
      const lat = Number(vrednost.lat);
      const lon = Number(vrednost.lon);

      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    }

    const [lat, lon] = String(vrednost).split(',').map(Number);

    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }

  ucitajIFiltriraj({ from, to, checkIn, checkOut, passengers = 1, odKoordinate, doKoordinate }) {
    const svi = loadMockData('flights.json');

    const trazenoOd = String(from || '').toUpperCase();
    const trazenoDo = String(to || '').toUpperCase();

    const rucni = svi
      .filter((z) => {
        const segmenti = z.odlazak?.segmenti || [];
        if (segmenti.length === 0) return false;

        return (
          segmenti[0].from?.toUpperCase() === trazenoOd &&
          segmenti[segmenti.length - 1].to?.toUpperCase() === trazenoDo
        );
      })
      .map((z) => this.normalize(z, { from: trazenoOd, to: trazenoDo, checkIn, checkOut, passengers }))
      .sort((a, b) => a.price - b.price)
      .slice(0, MAX_REZULTATA);

    if (rucni.length > 0) return rucni;

    /*
     * Za rute koje rucni mock ne pokriva (a to je cela Evropa osim
     * BEG -> ATH) ponude pravi deterministican generator, da carobnjak
     * moze da se prodje i bez kljuceva. Kompanija je
     * "Demo Air", pa se ne mesa sa stvarnim prevoznicima.
     */
    return demoLetovi({
      from: trazenoOd,
      to: trazenoDo,
      checkIn,
      checkOut,
      passengers,
      odKoordinate: this._koordinate(odKoordinate),
      doKoordinate: this._koordinate(doKoordinate)
    });
  }

  /**
   * Ponovna provera jedne mock ponude (spec §4.8 t.2).
   * Ponuda se rekonstruise iz `offerId`-ja, pa je odgovor deterministican
   * i posle restarta servisa - nema stanja koje bi se izgubilo.
   */
  ponuda(offerId) {
    const podaci = this.procitajOfferId(offerId);

    if (!podaci) {
      const greska = new Error(`Ponuda ${offerId} nije pronadjena`);
      greska.code = 'OFFER_NOT_FOUND';
      greska.statusCode = 404;
      throw greska;
    }

    const zapis = loadMockData('flights.json').find((z) => z.id === podaci.flightId);

    if (!zapis) {
      const greska = new Error(`Ponuda ${offerId} nije pronadjena`);
      greska.code = 'OFFER_NOT_FOUND';
      greska.statusCode = 404;
      throw greska;
    }

    return this.normalize(zapis, podaci);
  }

  async fetch(query) {
    const { from, to, checkIn, checkOut, passengers = 1 } = query;
    const queryKey = `flights-${from}-${to}-${checkIn}-${checkOut || 'oneway'}-${passengers}`;

    return this.withCache(queryKey, async () => this.ucitajIFiltriraj(query), {
      jeUpotrebljiv: ponudeSuUpotrebljive,
      preskociKes: jeTacno(query.refresh)
    });
  }
}

module.exports = FlightAdapter;
