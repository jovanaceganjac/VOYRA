/**
 * OBUHVAT: koje države ulaze u referentne podatke o gradovima.
 *
 * Ovo je KONFIGURACIJA, ne kod - spisak se menja ovde i posle toga se
 * ponovo pokrene `npm run import:gradovi`. Nista drugo ne treba dirati.
 *
 * Obuhvaceno je:
 *   - sve drzave geografske Evrope,
 *   - Turska i Kipar, kao ceste turisticke destinacije.
 *
 * NIJE obuhvaceno:
 *   - Rusija i Belorusija - od 2022. nema redovnih letova izmedju EU i
 *     tih zemalja, pa provajderi (Duffel) ne bi ni mogli da ponude let.
 *     Kada se to promeni, dodaju se 'RU' i 'BY' i uvoz se ponovi.
 */
const EVROPA_DRZAVE = {
  // --- Zapadna Evropa ---
  AT: 'Austrija',
  BE: 'Belgija',
  CH: 'Švajcarska',
  DE: 'Nemačka',
  FR: 'Francuska',
  LI: 'Lihtenštajn',
  LU: 'Luksemburg',
  MC: 'Monako',
  NL: 'Holandija',

  // --- Južna Evropa ---
  AD: 'Andora',
  ES: 'Španija',
  GI: 'Gibraltar',
  GR: 'Grčka',
  IT: 'Italija',
  MT: 'Malta',
  PT: 'Portugal',
  SM: 'San Marino',
  VA: 'Vatikan',

  // --- Severna Evropa ---
  DK: 'Danska',
  EE: 'Estonija',
  FI: 'Finska',
  FO: 'Farska ostrva',
  GB: 'Ujedinjeno Kraljevstvo',
  IE: 'Irska',
  IS: 'Island',
  LT: 'Litvanija',
  LV: 'Letonija',
  NO: 'Norveška',
  SE: 'Švedska',

  // --- Srednja i istočna Evropa ---
  BG: 'Bugarska',
  CZ: 'Češka',
  HU: 'Mađarska',
  MD: 'Moldavija',
  PL: 'Poljska',
  RO: 'Rumunija',
  SK: 'Slovačka',
  UA: 'Ukrajina',

  // --- Jugoistočna Evropa ---
  AL: 'Albanija',
  BA: 'Bosna i Hercegovina',
  HR: 'Hrvatska',
  ME: 'Crna Gora',
  MK: 'Severna Makedonija',
  RS: 'Srbija',
  SI: 'Slovenija',
  XK: 'Kosovo',

  // --- Kavkaz i istočni Mediteran ---
  AM: 'Jermenija',
  AZ: 'Azerbejdžan',
  CY: 'Kipar',
  GE: 'Gruzija',
  TR: 'Turska'
};

/** ISO-2 oznake, radi brze provere pri uvozu. */
const OZNAKE_DRZAVA = Object.keys(EVROPA_DRZAVE);

/** Srpski naziv drzave; nepoznata oznaka ostaje kakva jeste. */
const nazivDrzave = (iso) => EVROPA_DRZAVE[String(iso || '').toUpperCase()] || iso || '';

/** Da li drzava ulazi u obuhvat. */
const uEvropi = (iso) => Boolean(EVROPA_DRZAVE[String(iso || '').toUpperCase()]);

module.exports = { EVROPA_DRZAVE, OZNAKE_DRZAVA, nazivDrzave, uEvropi };
