const VREME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "09:30" -> 570 minuta od ponoci; null kada oblik nije HH:MM. */
const uMinute = (hhmm) => {
  const m = String(hhmm || '').match(VREME);
  if (!m) return null;

  return Number(m[1]) * 60 + Number(m[2]);
};

/**
 * 570 -> "09:30".
 * Vrednosti preko ponoci se obrcu (25:10 -> 01:10), jer noćni zivot
 * radi i posle ponoci.
 */
const uVreme = (minuta) => {
  const ceo = ((Math.round(minuta) % 1440) + 1440) % 1440;
  const h = Math.floor(ceo / 60);
  const m = ceo % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Datum i vreme se iz ISO zapisa citaju TEKSTUALNO, bez `new Date`.
 *
 * Vremena leta su lokalno vreme aerodroma (Duffel: `departing_at`), pa
 * bi svako pretvaranje u `Date` uvelo zonu servera ili pregledaca: isti
 * let bi u planu imao jedno vreme, a na kartici leta drugo. Ceo plan
 * zato radi sa satnicom "kako pise", a ne sa trenutkom u vremenu.
 */
const ISO_VREME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)/;

/** Minuti od ponoci iz ISO vremena, po lokalnom vremenu odredista. */
const minutiIzIso = (iso) => {
  const m = String(iso || '').match(ISO_VREME);
  if (!m) return null;

  return Number(m[2]) * 60 + Number(m[3]);
};

/** Datum (YYYY-MM-DD) iz ISO vremena. */
const datumIzIso = (iso) => {
  const tekst = String(iso || '');
  const m = tekst.match(ISO_VREME);

  if (m) return m[1];

  // Cist datum bez vremena ("2027-06-10")
  return /^\d{4}-\d{2}-\d{2}$/.test(tekst) ? tekst : null;
};

/**
 * Da li je [pocetak, kraj) unutar radnog vremena.
 *
 * Radno vreme koje prelazi ponoc (20:00-02:00) se obradjuje tako sto se
 * kraj pomera za 24 h, pa se poredi i pomereni interval.
 */
const uRadnomVremenu = (pocetakMin, krajMin, radnoVreme) => {
  if (!radnoVreme) return true;

  const otvara = uMinute(radnoVreme.open);
  const zatvara = uMinute(radnoVreme.close);

  if (otvara === null) return true;

  // "24:00" ne prolazi regularni izraz, a znaci kraj dana
  const zatvaranje = radnoVreme.close === '24:00' ? 1440 : zatvara;
  if (zatvaranje === null) return true;

  // Ceo dan otvoreno
  if (otvara === 0 && zatvaranje >= 1440) return true;

  if (zatvaranje > otvara) {
    return pocetakMin >= otvara && krajMin <= zatvaranje;
  }

  // Preko ponoci: 20:00-02:00 znaci [20:00, 26:00)
  return pocetakMin >= otvara && krajMin <= zatvaranje + 1440;
};

module.exports = { uMinute, uVreme, minutiIzIso, datumIzIso, uRadnomVremenu };
