/**
 * Normalizacija naziva za pretragu gradova.
 *
 * Cilj: da „munch", „münch" i „Munchen" nadju isti grad. Dijakritika se
 * skida preko Unicode dekompozicije (NFD), a slova koja se tako ne
 * razlazu - đ, ł, ø, ß, æ - imaju svoj prevod.
 */

/** Slova koja NFD ne razlaze na osnovno slovo + znak. */
const POSEBNA = {
  đ: 'dj',
  Đ: 'dj',
  ð: 'd',
  ł: 'l',
  Ł: 'l',
  ø: 'o',
  Ø: 'o',
  ß: 'ss',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  þ: 'th',
  Þ: 'th',
  ı: 'i',
  İ: 'i'
};

/**
 * "München" -> "munchen", "Kraków" -> "krakow", "Đakovica" -> "djakovica".
 * Sve sto nije slovo ili cifra postaje razmak, pa se visak razmaka skida.
 */
const normalizuj = (tekst) => {
  const zamenjeno = String(tekst || '')
    .split('')
    .map((z) => POSEBNA[z] ?? z)
    .join('');

  return zamenjeno
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

/**
 * Oblici pod kojima se grad pronalazi.
 *
 * Uz ceo naziv ide i prva rec ("frankfurt" za "Frankfurt am Main"), jer
 * korisnik retko kuca ceo zvanican naziv.
 */
const obliciZaPretragu = (nazivi) => {
  const skup = new Set();

  for (const n of nazivi) {
    const osnovni = normalizuj(n);
    if (!osnovni) continue;

    skup.add(osnovni);

    const prvaRec = osnovni.split(' ')[0];
    if (prvaRec.length >= 3) skup.add(prvaRec);
  }

  return [...skup];
};

/** Haversine rastojanje u kilometrima. */
const udaljenostKm = (a, b) => {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;

  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
};

module.exports = { normalizuj, obliciZaPretragu, udaljenostKm, POSEBNA };
