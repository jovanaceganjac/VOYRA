const IATA = /^[A-Z]{3}$/;
const VREME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Spec §4.2: putovanje traje najvise 14 dana (racunaju se svi dani u gradu). */
const MAX_TRAJANJE_DANA = 14;

const jeDatum = (v) => v && !Number.isNaN(new Date(v).getTime());

/** Ponoc danasnjeg dana - datum polaska ne sme biti u proslosti. */
const danas = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Validacija preferencija (spec §4.2).
 *
 * `schema` stize iz Planner Service-a, koji je jedini izvor dozvoljenih
 * vrednosti. Kada schema nije dostupna, proverava se samo oblik, a
 * pripadnost ostaje Planner-u - bolje nego da orchestrator drzi svoju
 * kopiju liste koja moze da zastari.
 */
const validirajPreferencije = (p, schema) => {
  const greske = [];

  if (p === undefined || p === null) return greske;

  if (typeof p !== 'object' || Array.isArray(p)) {
    greske.push('preferences mora biti objekat');
    return greske;
  }

  const dozvoljeno = (kljuc) => (schema && Array.isArray(schema[kljuc]) ? schema[kljuc] : null);

  const proveriJednu = (vrednost, kljuc, naziv) => {
    if (vrednost === undefined) return;

    const lista = dozvoljeno(kljuc);
    if (lista && !lista.includes(vrednost)) {
      greske.push(`${naziv} mora biti jedno od: ${lista.join(', ')}`);
    }
  };

  proveriJednu(p.transportPriority, 'transportPriority', 'transportPriority');
  proveriJednu(p.pace, 'pace', 'pace');

  const proveriListu = (vrednost, kljuc, naziv) => {
    if (vrednost === undefined) return;

    if (!Array.isArray(vrednost)) {
      greske.push(`${naziv} mora biti lista`);
      return;
    }

    const lista = dozvoljeno(kljuc);
    if (!lista) return;

    const nepoznate = vrednost.filter((v) => !lista.includes(v));
    if (nepoznate.length > 0) {
      greske.push(`${naziv}: nepoznata vrednost ${nepoznate.join(', ')}. Dozvoljene: ${lista.join(', ')}`);
    }
  };

  proveriListu(p.accommodationTypes, 'accommodationTypes', 'accommodationTypes');
  proveriListu(p.interests, 'interests', 'interests');

  if (p.minAccommodationRating !== undefined && p.minAccommodationRating !== null) {
    const ocena = Number(p.minAccommodationRating);

    if (!Number.isFinite(ocena) || ocena < 1 || ocena > 5) {
      greske.push('minAccommodationRating mora biti broj izmedju 1 i 5, ili null');
    }
  }

  const pocetak = p.dayStart;
  const kraj = p.dayEnd;

  if (pocetak !== undefined && !VREME.test(String(pocetak))) {
    greske.push('dayStart mora biti u obliku HH:MM');
  }

  if (kraj !== undefined && !VREME.test(String(kraj))) {
    greske.push('dayEnd mora biti u obliku HH:MM');
  }

  if (VREME.test(String(pocetak)) && VREME.test(String(kraj)) && String(kraj) <= String(pocetak)) {
    greske.push('dayEnd mora biti posle dayStart');
  }

  return greske;
};

/** Filteri iz §4.3 (broj presedanja i vreme polaska). */
const validirajFiltere = (f) => {
  const greske = [];

  if (f === undefined || f === null) return greske;

  if (typeof f !== 'object' || Array.isArray(f)) {
    greske.push('filteri mora biti objekat');
    return greske;
  }

  if (f.maxStops !== undefined && f.maxStops !== null) {
    const broj = Number(f.maxStops);
    if (!Number.isInteger(broj) || broj < 0) {
      greske.push('filteri.maxStops mora biti ceo broj najmanje 0');
    }
  }

  for (const kljuc of ['departureFrom', 'departureTo']) {
    if (f[kljuc] !== undefined && f[kljuc] !== null && !VREME.test(String(f[kljuc]))) {
      greske.push(`filteri.${kljuc} mora biti u obliku HH:MM`);
    }
  }

  return greske;
};

/**
 * Validira telo zahteva za /v1/plan.
 * Vraca SVE greske odjednom, da korisnik ne ispravlja jednu po jednu.
 *
 * @param {object} telo
 * @param {object|null} schema - dozvoljene vrednosti preferencija iz Planner-a
 * @returns {{ valid: boolean, errors: string[], value?: object }}
 */
const validatePlanRequest = (telo = {}, schema = null) => {
  const greske = [];

  const from = String(telo.from || '').trim().toUpperCase();
  const to = String(telo.to || '').trim().toUpperCase();

  /*
   * Grad se zadaje preko `fromCityId` / `toCityId`, a stari
   * oblik sa IATA kodom i dalje radi - sacuvana putovanja i postojeci
   * testovi ga koriste.
   */
  const fromCityId = telo.fromCityId ? String(telo.fromCityId).trim() : null;
  const toCityId = telo.toCityId ? String(telo.toCityId).trim() : null;

  if (!fromCityId && !IATA.test(from)) {
    greske.push('from mora biti IATA kod od 3 slova (npr. BEG) ili fromCityId');
  }

  if (!toCityId && !IATA.test(to)) {
    greske.push('to mora biti IATA kod od 3 slova (npr. ATH) ili toCityId');
  }

  if (fromCityId && toCityId && fromCityId === toCityId) {
    greske.push('polaziste i odrediste moraju biti razliciti');
  } else if (!fromCityId && !toCityId && IATA.test(from) && IATA.test(to) && from === to) {
    greske.push('from i to moraju biti razliciti');
  }

  if (!jeDatum(telo.checkIn)) {
    greske.push('checkIn mora biti validan datum');
  } else if (new Date(telo.checkIn) < danas()) {
    greske.push('checkIn ne sme biti u proslosti');
  }

  if (!jeDatum(telo.checkOut)) {
    greske.push('checkOut mora biti validan datum');
  } else if (jeDatum(telo.checkIn) && new Date(telo.checkOut) <= new Date(telo.checkIn)) {
    greske.push('checkOut mora biti posle checkIn-a');
  } else if (jeDatum(telo.checkIn)) {
    // Dan dolaska i dan povratka se broje (isto kao u Planner-u)
    const dana = Math.round((new Date(telo.checkOut) - new Date(telo.checkIn)) / 86400000) + 1;

    if (dana > MAX_TRAJANJE_DANA) {
      greske.push(`Putovanje moze trajati najvise ${MAX_TRAJANJE_DANA} dana (trazeno ${dana})`);
    }
  }

  // Spec §4.2: najmanje 1 putnik, BEZ gornje granice. Ogranicenje od 9
  // vazi za rezervaciju (spec §4.8), ne za planiranje.
  const putnici = telo.passengers === undefined ? 1 : Number(telo.passengers);
  if (!Number.isInteger(putnici) || putnici < 1) {
    greske.push('passengers mora biti ceo broj najmanje 1');
  }

  let budzet;
  if (telo.budget !== undefined && telo.budget !== null) {
    budzet = Number(telo.budget);
    if (!Number.isFinite(budzet) || budzet <= 0) {
      greske.push('budget mora biti broj veci od 0');
    }
  }

  greske.push(...validirajPreferencije(telo.preferences, schema));
  greske.push(...validirajFiltere(telo.filteri));

  if (greske.length > 0) return { valid: false, errors: greske };

  return {
    valid: true,
    errors: [],
    value: {
      from,
      to,
      fromCityId,
      toCityId,
      date: telo.date || telo.checkIn,
      checkIn: telo.checkIn,
      checkOut: telo.checkOut,
      passengers: putnici,
      guests: telo.guests ? Number(telo.guests) : putnici,
      budget: budzet,
      preferences: telo.preferences || undefined,
      selectedFlightOfferId: telo.selectedFlightOfferId || null,
      selectedAccommodationId: telo.selectedAccommodationId || null,
      filteri: telo.filteri || undefined,
      title: telo.title,
      description: telo.description
    }
  };
};

module.exports = {
  validatePlanRequest,
  validirajPreferencije,
  validirajFiltere,
  MAX_TRAJANJE_DANA
};
