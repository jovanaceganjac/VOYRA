const {
  TEZINE_SMESTAJA,
  NORMALIZOVANA_OCENA_BEZ_PODATKA
} = require('../config/preferencije');
const { normalizuj } = require('./FazaLetovi');

/**
 * FAZA 2: rangiranje smestaja (spec §6.1).
 *
 * Filter po tipu i oceni, pa rangiranje po ceni, udaljenosti od centra i
 * oceni - sve normalizovano na [0, 1] u okviru dobijenog skupa.
 *
 * Preporuka je najbolje rangirana ponuda koja staje u PREOSTALI budzet
 * (budzet - cena leta - procena ulaznica). Ako takve nema, preporucuje se
 * najjeftinija uz upozorenje. Nista se ne odseca (spec §4.7).
 */

const cenaPoNoci = (s) => Number(s.priceEUR ?? s.pricePerNight ?? s.price ?? 0);

/**
 * Da li ponuda UOPSTE ima ocenu.
 *
 * `Number(null)` je 0, a ne NaN, pa bi obicna provera `Number.isFinite`
 * smestaj bez ocene tretirala kao ocenjen nulom - i izbacila ga na
 * filteru minimalne ocene, suprotno §4.4.
 */
const imaOcenu = (s) =>
  s.rating !== null && s.rating !== undefined && s.rating !== '' && Number.isFinite(Number(s.rating));
const ukupnaCena = (s) => Number(s.totalPrice ?? cenaPoNoci(s) * (s.nights || 1));

/**
 * Filteri iz §4.4.
 *
 * Smestaj bez ocene (`rating: null`) PROLAZI filter po oceni: izvor
 * nema podatak, a to nije isto sto i losa ocena. Takva ponuda nosi
 * `ratingUnknown: true`, pa moze da se naznaci u prikazu.
 */
const primeniFiltere = (smestaji, { accommodationTypes, minAccommodationRating, maxPricePerNight } = {}) => {
  const tipovi = Array.isArray(accommodationTypes) && accommodationTypes.length > 0
    ? accommodationTypes
    : null;

  const minOcena = Number.isFinite(Number(minAccommodationRating))
    ? Number(minAccommodationRating)
    : null;

  const maxCena = Number.isFinite(Number(maxPricePerNight)) ? Number(maxPricePerNight) : null;

  return smestaji.filter((s) => {
    if (tipovi && !tipovi.includes(s.type)) return false;

    // Smestaj bez ocene PROLAZI: izvor nema podatak, a to nije losa ocena
    if (minOcena !== null && imaOcenu(s) && Number(s.rating) < minOcena) {
      return false;
    }

    if (maxCena !== null && cenaPoNoci(s) > maxCena) return false;

    return true;
  });
};

/**
 * @param {Array} smestaji
 * @param {object} opcije - { preferencije, budget, flightPrice, attractionsEstimate }
 */
const rangirajSmestaj = (smestaji, opcije = {}) => {
  const {
    preferencije = {},
    budget = null,
    flightPrice = 0,
    attractionsEstimate = 0
  } = opcije;

  const filtrirani = primeniFiltere(smestaji || [], {
    accommodationTypes: preferencije.accommodationTypes,
    minAccommodationRating: preferencije.minAccommodationRating,
    maxPricePerNight: opcije.maxPricePerNight
  });

  if (filtrirani.length === 0) {
    return { ponude: [], upozorenja: [] };
  }

  const cene = normalizuj(filtrirani.map(cenaPoNoci));

  // Bez podatka o udaljenosti se uzima najveca vrednost u skupu, da
  // nepoznata udaljenost ne bi bila prednost
  const distance = normalizuj(
    filtrirani.map((s) => (Number.isFinite(Number(s.distanceToCenter)) ? Number(s.distanceToCenter) : NaN))
  );

  // Ocena je jedini cinilac gde je VECE bolje, pa se okrece: 1 - ocena
  const sveOcene = filtrirani.map((s) => (imaOcenu(s) ? Number(s.rating) : NaN));
  const normalizovaneOcene = normalizuj(sveOcene);

  const rangirani = filtrirani.map((s, i) => {
    const bezOcene = !imaOcenu(filtrirani[i]);

    const deoCene = TEZINE_SMESTAJA.cena * cene[i];
    const deoDistance = TEZINE_SMESTAJA.distanca * distance[i];
    const deoOcene =
      TEZINE_SMESTAJA.ocena *
      (bezOcene ? NORMALIZOVANA_OCENA_BEZ_PODATKA : 1 - normalizovaneOcene[i]);

    return {
      ...s,
      ratingUnknown: bezOcene,
      score: Math.round((deoCene + deoDistance + deoOcene) * 1000) / 1000,
      scoreBreakdown: {
        cena: Math.round(deoCene * 1000) / 1000,
        distanca: Math.round(deoDistance * 1000) / 1000,
        ocena: Math.round(deoOcene * 1000) / 1000
      },
      recommended: false
    };
  });

  rangirani.sort((a, b) => a.score - b.score || cenaPoNoci(a) - cenaPoNoci(b));

  const upozorenja = [];

  // --- Preporuka (spec §6.1) ---
  if (!budget) {
    rangirani[0].recommended = true;
  } else {
    const preostalo = budget - Number(flightPrice || 0) - Number(attractionsEstimate || 0);
    const uBudzetu = rangirani.find((s) => ukupnaCena(s) <= preostalo);

    if (uBudzetu) {
      uBudzetu.recommended = true;
    } else {
      // Nijedna ponuda ne staje u preostali budzet - bira se najjeftinija
      const najjeftiniji = [...rangirani].sort((a, b) => ukupnaCena(a) - ukupnaCena(b))[0];
      najjeftiniji.recommended = true;

      upozorenja.push(
        preostalo > 0
          ? `Nijedan smeštaj ne staje u preostali budžet (${Math.round(preostalo)} EUR) — ` +
            'preporučen je najjeftiniji'
          : 'Let je potrošio ceo budžet — preporučen je najjeftiniji smeštaj'
      );
    }
  }

  rangirani.forEach((s) => {
    s.overBudget = budget ? ukupnaCena(s) > budget : false;
  });

  return { ponude: rangirani, upozorenja };
};

module.exports = { rangirajSmestaj, primeniFiltere, cenaPoNoci, ukupnaCena, imaOcenu };
