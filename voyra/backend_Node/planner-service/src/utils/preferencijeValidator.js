const {
  PRIORITETI_PREVOZA,
  TIPOVI_SMESTAJA,
  INTERESOVANJA,
  TEMPO,
  PODRAZUMEVANE_PREFERENCIJE
} = require('../config/preferencije');

const VREME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "09:30" -> 570 minuta od ponoci. */
const uMinute = (hhmm) => {
  const m = String(hhmm || '').match(VREME);
  if (!m) return null;

  return Number(m[1]) * 60 + Number(m[2]);
};

/** 570 -> "09:30" */
const uVreme = (minuta) => {
  const ceo = ((Math.round(minuta) % 1440) + 1440) % 1440;
  const h = Math.floor(ceo / 60);
  const m = ceo % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Validacija i dopuna preferencija (spec §4.2).
 *
 * Vraca SVE greske odjednom, kao i ostala validacija u sistemu. Kada
 * preferencija nema, vracaju se podrazumevane - stari zahtevi bez
 * `preferences` moraju i dalje da rade.
 *
 * @param {object} ulaz
 * @param {string[]} [dozvoljenaInteresovanja] - aktivne kategorije iz
 * baze. Bez njih se koriste ugradjene konstante, pa
 *   validacija radi i kada Trip Service nije dostupan.
 * @returns {{ valid: boolean, errors: string[], value?: object }}
 */
const validirajPreferencije = (ulaz, dozvoljenaInteresovanja = null) => {
  const greske = [];
  const p = ulaz && typeof ulaz === 'object' ? ulaz : {};

  const dozvoljena =
    Array.isArray(dozvoljenaInteresovanja) && dozvoljenaInteresovanja.length > 0
      ? dozvoljenaInteresovanja
      : INTERESOVANJA;

  // --- prioritet prevoza ---
  const prioritet = p.transportPriority ?? PODRAZUMEVANE_PREFERENCIJE.transportPriority;

  if (!PRIORITETI_PREVOZA.includes(prioritet)) {
    greske.push(
      `transportPriority mora biti jedno od: ${PRIORITETI_PREVOZA.join(', ')}`
    );
  }

  // --- tipovi smestaja ---
  let tipovi = p.accommodationTypes ?? PODRAZUMEVANE_PREFERENCIJE.accommodationTypes;

  if (!Array.isArray(tipovi)) {
    greske.push('accommodationTypes mora biti lista');
    tipovi = PODRAZUMEVANE_PREFERENCIJE.accommodationTypes;
  } else {
    const nepoznati = tipovi.filter((t) => !TIPOVI_SMESTAJA.includes(t));

    if (nepoznati.length > 0) {
      greske.push(
        `Nepoznat tip smestaja: ${nepoznati.join(', ')}. Dozvoljeni: ${TIPOVI_SMESTAJA.join(', ')}`
      );
    }

    // Prazna lista bi odsekla sve ponude - tretira se kao "svi tipovi"
    if (tipovi.length === 0) tipovi = [...TIPOVI_SMESTAJA];
  }

  // --- minimalna ocena ---
  const ocenaUlaz = p.minAccommodationRating ?? PODRAZUMEVANE_PREFERENCIJE.minAccommodationRating;
  let minOcena = null;

  if (ocenaUlaz !== null && ocenaUlaz !== undefined && ocenaUlaz !== '') {
    minOcena = Number(ocenaUlaz);

    if (!Number.isFinite(minOcena) || minOcena < 1 || minOcena > 5) {
      greske.push('minAccommodationRating mora biti broj izmedju 1 i 5, ili null');
      minOcena = null;
    }
  }

  // --- interesovanja ---
  let interesovanja = p.interests ?? PODRAZUMEVANE_PREFERENCIJE.interests;

  if (!Array.isArray(interesovanja)) {
    greske.push('interests mora biti lista');
    interesovanja = [...PODRAZUMEVANE_PREFERENCIJE.interests];
  } else {
    const nepoznata = interesovanja.filter((i) => !dozvoljena.includes(i));

    if (nepoznata.length > 0) {
      greske.push(
        `Nepoznato interesovanje: ${nepoznata.join(', ')}. Dozvoljena: ${dozvoljena.join(', ')}`
      );
    }

    if (interesovanja.length === 0) interesovanja = [...PODRAZUMEVANE_PREFERENCIJE.interests];
  }

  // --- tempo ---
  const tempo = p.pace ?? PODRAZUMEVANE_PREFERENCIJE.pace;

  if (!TEMPO.includes(tempo)) {
    greske.push(`pace mora biti jedno od: ${TEMPO.join(', ')}`);
  }

  // --- pocetak i kraj dana ---
  const pocetak = p.dayStart ?? PODRAZUMEVANE_PREFERENCIJE.dayStart;
  const kraj = p.dayEnd ?? PODRAZUMEVANE_PREFERENCIJE.dayEnd;

  const pocetakMin = uMinute(pocetak);
  const krajMin = uMinute(kraj);

  if (pocetakMin === null) greske.push('dayStart mora biti u obliku HH:MM');
  if (krajMin === null) greske.push('dayEnd mora biti u obliku HH:MM');

  if (pocetakMin !== null && krajMin !== null && krajMin <= pocetakMin) {
    greske.push('dayEnd mora biti posle dayStart');
  }

  if (greske.length > 0) return { valid: false, errors: greske };

  return {
    valid: true,
    errors: [],
    value: {
      transportPriority: prioritet,
      accommodationTypes: [...new Set(tipovi)],
      minAccommodationRating: minOcena,
      interests: [...new Set(interesovanja)],
      pace: tempo,
      dayStart: pocetak,
      dayEnd: kraj
    }
  };
};

module.exports = { validirajPreferencije, uMinute, uVreme };
