/**
 * PARSER OSM `opening_hours`.
 *
 * Geoapify prosledjuje sirove OSM tagove, pa i `opening_hours`. Taj
 * format je specifikacija za sebe: ume da opise sezone, praznike,
 * "poslednji utorak u mesecu" i slicno. Ovde se NAMERNO citaju samo
 * jednostavni oblici, a sve ostalo se odbija - plan tada koristi procenu
 * po kategoriji i oznacava je sa `openingHoursEstimated: true`.
 *
 * Bolje priznati "ne znam" nego pogresno procitati slozeno pravilo i
 * poslati korisnika pred zatvorena vrata.
 *
 * Prihvata se:
 *   "09:00-17:00"            - bez dana, vazi svaki dan
 *   "Mo-Su 09:00-17:00"      - raspon dana
 *   "Mo-Fr 08:30-16:00"      - raspon dana
 *   "24/7"                   - non-stop
 *
 * Odbija se sve ostalo: vise pravila (`;` ili `,`), sezone
 * ("Nov-Mar 08:30-15:00"), praznici (`PH`), `off`, `sunrise-sunset`,
 * "on appointment", otvoreni kraj (`+`).
 */

/** `HH:MM-HH:MM`, uz dozvoljeno `24:00` kao kraj dana. */
const RASPON = /^([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-4]):([0-5]\d)$/;

/** Oznake dana koje OSM koristi. */
const DANI = /^(Mo|Tu|We|Th|Fr|Sa|Su)(\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/i;

/** Sve sto znaci "ovo je slozeno pravilo". */
const SLOZENO = /[;,]|PH|SH|off|sunrise|sunset|appointment|\+|week|\[|easter/i;

/** "9:00" -> "09:00" */
const dopuni = (h, m) => `${String(h).padStart(2, '0')}:${m}`;

/**
 * @param {string} tekst - vrednost OSM taga `opening_hours`
 * @returns {{open: string, close: string}|null} `null` kada oblik nije
 *   jednostavan - pozivalac tada koristi procenu po kategoriji
 */
const procitajRadnoVreme = (tekst) => {
  const ulaz = String(tekst || '').trim();

  if (!ulaz) return null;

  // Non-stop: OSM ga pise kao `24/7`
  if (/^24\s*\/\s*7$/.test(ulaz)) return { open: '00:00', close: '24:00' };

  if (SLOZENO.test(ulaz)) return null;

  /*
   * Praznine oko crtice se skidaju PRE razdvajanja po prazninama.
   * `RASPON` ih dozvoljava, ali bez ovoga do njega nikada ne bi ni dosle:
   * „Mo-Su 09:00 - 17:00" bi se razdvojilo u cetiri dela i bilo odbijeno
   * kao slozeno pravilo, iako je jednostavno.
   */
  const delovi = ulaz.replace(/\s*-\s*/g, '-').split(/\s+/).filter(Boolean);

  // Samo vreme, bez dana: "09:00-17:00"
  if (delovi.length === 1) {
    const m = delovi[0].match(RASPON);
    if (!m) return null;

    return { open: dopuni(m[1], m[2]), close: dopuni(m[3], m[4]) };
  }

  // Dani pa vreme: "Mo-Su 09:00-17:00"
  if (delovi.length === 2) {
    if (!DANI.test(delovi[0])) return null;

    const m = delovi[1].match(RASPON);
    if (!m) return null;

    return { open: dopuni(m[1], m[2]), close: dopuni(m[3], m[4]) };
  }

  return null;
};

module.exports = { procitajRadnoVreme, RASPON, DANI, SLOZENO };
