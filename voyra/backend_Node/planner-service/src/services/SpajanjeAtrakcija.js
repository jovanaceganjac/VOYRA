const { haversineDistance } = require('../utils/distance');

/**
 * Ispod ove udaljenosti dve atrakcije se smatraju istim mestom.
 *
 * 150 m je otprilike jedan gradski blok. Uzeto je toliko jer se
 * koordinate istog objekta kod razlicitih izvora razilaze: OpenTripMap
 * cesto daje tacku na ulazu ili u sredistu poligona, a administrator
 * unosi tacku sa mape. Sire od toga bi spojilo dva susedna muzeja.
 */
const PRAG_ISTE_TACKE_KM = 0.15;

/** Naziv bez dijakritike, clanova i interpunkcije - za poredjenje. */
const normalizujNaziv = (naziv) =>
  String(naziv || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\b(the|a|an|le|la|les|il|el|der|die|das)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();

/**
 * Da li su dve atrakcije isto mesto.
 *
 * Dovoljan je JEDAN od dva uslova: isti naziv posle normalizacije, ili
 * rastojanje ispod 150 m. Naziv hvata slucaj kada se koordinate razlikuju
 * (razliciti izvori mere razlicite tacke istog objekta), a rastojanje
 * hvata slucaj kada isto mesto nosi dva imena („Partenon" i „Parthenon
 * Temple").
 */
const isteSu = (a, b) => {
  const nazivA = normalizujNaziv(a.name);
  const nazivB = normalizujNaziv(b.name);

  if (nazivA && nazivA === nazivB) return true;

  const imaKoordinate =
    Number.isFinite(Number(a.lat)) &&
    Number.isFinite(Number(a.lon)) &&
    Number.isFinite(Number(b.lat)) &&
    Number.isFinite(Number(b.lon));

  if (!imaKoordinate) return false;

  return (
    haversineDistance(Number(a.lat), Number(a.lon), Number(b.lat), Number(b.lon)) <
    PRAG_ISTE_TACKE_KM
  );
};

/**
 * SPAJANJE ATRAKCIJA ADMINISTRATORA SA EKSTERNIM (spec §4.5).
 *
 * Kada je isto mesto u oba izvora, ostaje zapis ADMINISTRATORA: njega je
 * neko proverio, dok spoljni izvor zna da ima pogresnu kategoriju ili
 * trajanje. Od eksternog zapisa se preuzima samo ono sto administrator
 * nije uneo - pre svega SLIKA i opis, da rucni unos ne bude siromasniji
 * od automatskog.
 *
 * @param {Array} eksterne - atrakcije iz Integration Service-a
 * @param {Array} adminske - atrakcije administratora (`source: 'admin'`)
 * @returns {{ spojene: Array, duplikata: number }}
 */
const spoji = (eksterne = [], adminske = []) => {
  if (adminske.length === 0) return { spojene: [...eksterne], duplikata: 0 };

  const spojene = [];
  let duplikata = 0;

  // Administratorove idu prve - one su te koje ostaju kod poklapanja
  const dopunjene = adminske.map((a) => {
    const par = eksterne.find((e) => isteSu(a, e));

    if (!par) return a;

    duplikata += 1;

    return {
      ...a,
      // Sve sto administrator nije uneo, a spoljni izvor ima
      image: a.image || par.image || null,
      imageSource: a.imageSource || par.imageSource || null,
      imageCredit: a.imageCredit || par.imageCredit || null,
      description: a.description || par.description || '',
      // Ocena posetilaca postoji samo kod spoljnog izvora
      rating: a.rating ?? par.rating ?? null,
      openingHours: a.openingHours || par.openingHours || undefined,
      // Oznaka ostaje `admin` - zapis je i dalje njegov
      source: 'admin',
      spojenoSaIzvorom: par.source || 'opentripmap'
    };
  });

  spojene.push(...dopunjene);

  for (const e of eksterne) {
    if (adminske.some((a) => isteSu(a, e))) continue;

    spojene.push(e);
  }

  return { spojene, duplikata };
};

module.exports = { spoji, isteSu, normalizujNaziv, PRAG_ISTE_TACKE_KM };
