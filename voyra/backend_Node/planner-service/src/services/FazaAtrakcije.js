const {
  ALFA_INTERESOVANJA,
  RADNO_VREME,
  TRAJANJE_POSETE,
  PODRAZUMEVANA_KATEGORIJA
} = require('../config/preferencije');

/**
 * FAZA 3: izbor atrakcija (spec §6.2).
 *
 *   ocena = ALFA * poklapanje + (1 - ALFA) * popularnost
 *
 * `poklapanje` je udeo kategorija atrakcije koje su medju izabranim
 * interesovanjima, a `popularnost` je ocena izvora svedena na [0, 1].
 * Atrakcije se biraju pohlepno po opadajucoj oceni, dok se ne dostigne
 * ciljni broj ili dok zbir trajanja poseta ne predje raspolozivo vreme.
 */

/** Kategorije atrakcije, u obliku liste. Stari zapisi imaju jednu. */
const kategorije = (a) => {
  if (Array.isArray(a.categories) && a.categories.length > 0) return a.categories;
  if (a.category) return [a.category];

  return [PODRAZUMEVANA_KATEGORIJA];
};

/**
 * Trajanje posete i radno vreme po kategoriji.
 *
 * Kategorije uredjuje administrator, pa vrednosti stizu iz kataloga.
 * Kada katalog nije prosledjen (jedinicni testovi, rezervni rezim),
 * koriste se ugradjene konstante - ponasanje je tada isto kao pre.
 */
const izKataloga = (katalog) => ({
  trajanje: katalog?.trajanje || TRAJANJE_POSETE,
  radnoVreme: katalog?.radnoVreme || RADNO_VREME
});

/**
 * Udeo kategorija atrakcije koje korisnik zeli.
 *
 * Udeo, a ne "ima/nema": atrakcija koja je i muzej i kultura, a korisnik
 * je izabrao samo muzeje, ne treba da bude izjednacena sa atrakcijom
 * koja je iskljucivo muzej. Bez izabranih interesovanja sve su jednake.
 */
const poklapanje = (a, interesovanja) => {
  if (!Array.isArray(interesovanja) || interesovanja.length === 0) return 1;

  const svoje = kategorije(a);
  if (svoje.length === 0) return 0;

  const pogodjene = svoje.filter((k) => interesovanja.includes(k)).length;

  return pogodjene / svoje.length;
};

/** Ocena izvora (skala do 5) svedena na [0, 1]. Bez ocene = 0.5. */
const popularnost = (a) => {
  const ocena = Number(a.rating);

  if (!Number.isFinite(ocena) || ocena <= 0) return 0.5;

  return Math.max(0, Math.min(1, ocena / 5));
};

/** Trajanje posete: iz izvora, inace procena po prvoj kategoriji. */
const trajanjePosete = (a, katalog = null) => {
  const iz = Number(a.duration);
  if (Number.isFinite(iz) && iz > 0) return iz;

  const { trajanje } = izKataloga(katalog);
  const prva = kategorije(a)[0];

  return trajanje[prva] ?? trajanje.ostalo ?? TRAJANJE_POSETE.ostalo;
};

/**
 * Radno vreme: iz izvora ako ga ima, inace procena po kategoriji.
 * Procena se uvek oznaci, da se u prikazu ne predstavi kao podatak.
 */
const radnoVreme = (a, katalog = null) => {
  if (a.openingHours?.open && a.openingHours?.close) {
    return { openingHours: a.openingHours, openingHoursEstimated: false };
  }

  const { radnoVreme: mapa } = izKataloga(katalog);
  const prva = kategorije(a)[0];

  return {
    openingHours: mapa[prva] ?? mapa.ostalo ?? RADNO_VREME.ostalo,
    openingHoursEstimated: true
  };
};

/** Ocenjuje sve atrakcije; ne bira nista. Koristi je i ruta /attractions. */
const oceniAtrakcije = (atrakcije, interesovanja, katalog = null) =>
  (atrakcije || []).map((a) => {
    const p = poklapanje(a, interesovanja);
    const pop = popularnost(a);
    const ocena = ALFA_INTERESOVANJA * p + (1 - ALFA_INTERESOVANJA) * pop;

    return {
      ...a,
      categories: kategorije(a),
      duration: trajanjePosete(a, katalog),
      ...radnoVreme(a, katalog),
      // Izvor vise ne filtrira po interesovanjima, pa se
      // u odgovoru oznacava sta je van onoga sto je korisnik izabrao
      outsideInterests: p === 0,
      score: Math.round(ocena * 1000) / 1000,
      scoreBreakdown: {
        interesovanja: Math.round(ALFA_INTERESOVANJA * p * 1000) / 1000,
        popularnost: Math.round((1 - ALFA_INTERESOVANJA) * pop * 1000) / 1000
      }
    };
  });

/**
 * Pohlepni izbor po opadajucoj oceni (spec §6.2), u DVA PROLAZA.
 *
 * Prvo se bira iz onoga sto se poklapa sa interesovanjima, pa tek ako
 * toga nema dovoljno, dan se dopunjuje atrakcijama van interesovanja.
 *
 * Zasto dva prolaza, kad ocena vec daje prednost poklapanju: sa
 * `alfa = 0,7` vrlo popularna atrakcija van interesovanja (ocena 0,3)
 * moze da prestigne slabije ocenjenu unutar njih (0,7 * 0,5 = 0,35 je
 * blizu). Tempo i interesovanja su izricit izbor korisnika, pa se
 * poklapanje postuje strogo, a popularnost odlucuje unutar svake grupe.
 *
 * @param {Array} atrakcije
 * @param {object} p - { interesovanja, ciljniBroj, raspolozivoMinuta, katalog }
 * @returns {{ izabrane: Array, sve: Array }}
 */
const izaberiAtrakcije = (
  atrakcije,
  { interesovanja, ciljniBroj, raspolozivoMinuta, katalog = null }
) => {
  const sve = oceniAtrakcije(atrakcije, interesovanja, katalog).sort((a, b) => b.score - a.score);

  const izabrane = [];
  let potroseno = 0;

  const uzmiIz = (kandidati) => {
    for (const a of kandidati) {
      if (izabrane.length >= ciljniBroj) return;

      // Vreme kretanja jos nije poznato (zavisi od rasporeda po danima),
      // pa se ovde gleda samo zbir trajanja poseta
      if (potroseno + a.duration > raspolozivoMinuta) continue;

      izabrane.push(a);
      potroseno += a.duration;
    }
  };

  uzmiIz(sve.filter((a) => !a.outsideInterests));
  uzmiIz(sve.filter((a) => a.outsideInterests));

  return { izabrane, sve };
};

module.exports = {
  izaberiAtrakcije,
  oceniAtrakcije,
  poklapanje,
  popularnost,
  trajanjePosete,
  radnoVreme,
  kategorije
};
