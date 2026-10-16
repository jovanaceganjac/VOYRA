const { TEZINE_LETA, KAZNA_PRESEDANJA } = require('../config/preferencije');
const { minutiIzIso, uMinute } = require('../utils/vreme');

/**
 * FAZA 1: rangiranje letova (spec §6.1).
 *
 *   score = w_c * c + w_t * t + p * brojPresedanja
 *
 * `c` i `t` su cena i ukupno trajanje normalizovani na [0, 1] min-max
 * normalizacijom U OKVIRU dobijenog skupa ponuda. Normalizacija u okviru
 * skupa (a ne prema fiksnoj konstanti) znaci da ocena uvek koristi ceo
 * raspon: najjeftinija ponuda dobija 0, najskuplja 1, bez obzira na to
 * da li se poredi 50 EUR i 80 EUR ili 500 EUR i 900 EUR.
 *
 * Manji skor je bolji.
 */

/**
 * Min-max normalizacija. Kada su sve vrednosti iste (ili ima samo jedna
 * ponuda), vraca 0 za sve - taj cinilac tada ne razlikuje ponude, pa ne
 * sme ni da utice na poredak. Time se izbegava i deljenje nulom.
 */
const normalizuj = (vrednosti) => {
  const konacne = vrednosti.filter((v) => Number.isFinite(v));

  if (konacne.length === 0) return vrednosti.map(() => 0);

  const min = Math.min(...konacne);
  const max = Math.max(...konacne);
  const raspon = max - min;

  if (raspon === 0) return vrednosti.map(() => 0);

  return vrednosti.map((v) => (Number.isFinite(v) ? (v - min) / raspon : 1));
};

const cena = (let_) => Number(let_.priceEUR ?? let_.price ?? 0);

/**
 * Filteri iz §4.3: broj presedanja i vreme polaska ODLASKA.
 * `maxStops` se odnosi na jedan smer - putnik bira "direktan let",
 * a ne "najvise jedno presedanje u oba smera zajedno".
 */
const primeniFiltere = (letovi, filteri = {}) => {
  const { maxStops, departureFrom, departureTo } = filteri;

  const odMin = uMinute(departureFrom);
  const doMin = uMinute(departureTo);
  const maxPresedanja = Number.isFinite(Number(maxStops)) ? Number(maxStops) : null;

  return letovi.filter((f) => {
    if (maxPresedanja !== null) {
      const odlazak = f.outbound?.stops ?? f.stops ?? 0;
      const povratak = f.inbound?.stops ?? 0;

      if (Math.max(odlazak, povratak) > maxPresedanja) return false;
    }

    if (odMin !== null || doMin !== null) {
      const polazak = minutiIzIso(f.outbound?.departure ?? f.departure);
      if (polazak === null) return false;

      if (odMin !== null && polazak < odMin) return false;
      if (doMin !== null && polazak > doMin) return false;
    }

    return true;
  });
};

/**
 * Rangira ponude i oznacava tacno jednu preporucenu.
 *
 * Budzet NE odseca nista (spec §4.7): skuplje ponude ostaju u listi sa
 * `overBudget: true`, pa korisnik sam odlucuje.
 *
 * @param {Array} letovi - ponude iz Integration Service-a
 * @param {object} opcije - { transportPriority, budget, filteri }
 */
const rangirajLetove = (letovi, { transportPriority = 'balans', budget = null, filteri = {} } = {}) => {
  const filtrirani = primeniFiltere(letovi || [], filteri);

  if (filtrirani.length === 0) return [];

  const tezine = TEZINE_LETA[transportPriority] || TEZINE_LETA.balans;

  const cene = normalizuj(filtrirani.map(cena));
  const trajanja = normalizuj(filtrirani.map((f) => Number(f.duration ?? 0)));

  const rangirani = filtrirani.map((f, i) => {
    // Ukupan broj presedanja na celom putu (oba smera)
    const presedanja = (f.outbound?.stops ?? f.stops ?? 0) + (f.inbound?.stops ?? 0);

    const deoCene = tezine.cena * cene[i];
    const deoTrajanja = tezine.trajanje * trajanja[i];
    const deoPresedanja = KAZNA_PRESEDANJA * presedanja;

    return {
      ...f,
      score: Math.round((deoCene + deoTrajanja + deoPresedanja) * 1000) / 1000,
      scoreBreakdown: {
        cena: Math.round(deoCene * 1000) / 1000,
        trajanje: Math.round(deoTrajanja * 1000) / 1000,
        presedanja: Math.round(deoPresedanja * 1000) / 1000
      },
      overBudget: budget ? cena(f) > budget : false,
      recommended: false
    };
  });

  rangirani.sort((a, b) => a.score - b.score || cena(a) - cena(b));
  rangirani[0].recommended = true;

  return rangirani;
};

module.exports = { rangirajLetove, primeniFiltere, normalizuj };
