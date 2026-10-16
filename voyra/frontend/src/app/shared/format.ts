import { aktivniJezik } from '../core/i18n/jezik';
import { prevedi, prevediBroj } from '../core/i18n/prevod';

/**
 * Formatiranje za prikaz. Backend vraća ISO datume i brojeve;
 * Angular-ov DatePipe bi tražio registraciju sr lokala, a ovde je
 * potrebno samo nekoliko oblika - pa su to čiste funkcije.
 */

/**
 * ISO zapis se cita TEKSTUALNO, bez `new Date`.
 *
 * Vremena leta su lokalno vreme aerodroma (Duffel: `departing_at`), a
 * satnica plana je obican "HH:MM" - ni jedno ni drugo nije trenutak u
 * vremenu. Kad bi se cinili preko `Date`, prikaz bi se menjao sa zonom
 * pregledaca: sletanje u 14:15 uz plan koji pocinje u 13:45.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

/** Srpski zapis brojeva (1.234,50) ili engleski (1,234.50), po aktivnom jeziku. */
const jeSrpski = (): boolean => aktivniJezik() === 'sr';

/** 2026-05-10 -> 10.05.2026. (srpski) / 10/05/2026 (engleski). */
export const datum = (iso: string | null | undefined): string => {
  const m = String(iso ?? '').match(ISO);
  if (!m) return '-';

  return jeSrpski() ? `${m[3]}.${m[2]}.${m[1]}.` : `${m[3]}/${m[2]}/${m[1]}`;
};

/** 2027-06-15 -> „sreda, 15. jun" / „Tuesday, 15 June" */
export const datumSaDanom = (iso: string | null | undefined): string => {
  const m = String(iso ?? '').match(ISO);
  if (!m) return '-';

  // Dan u nedelji se racuna iz kalendarskog datuma (podne UTC, da
  // prelazak na zimsko/letnje vreme ne pomeri dan)
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '-';

  return prevedi('format.datumSaDanom', {
    dan: prevedi('format.dani').split('|')[d.getUTCDay()],
    broj: Number(m[3]),
    mesec: prevedi('format.meseci').split('|')[Number(m[2]) - 1]
  });
};

/** 2026-05-10T08:35:00 -> 08:35 */
export const vreme = (iso: string | null | undefined): string => {
  const m = String(iso ?? '').match(ISO);
  if (!m?.[4]) return '-';

  return `${m[4]}:${m[5]}`;
};

/** 145 -> 2 h 25 min */
export const trajanje = (minuta: number | null | undefined): string => {
  if (minuta === null || minuta === undefined || !Number.isFinite(minuta)) return '-';

  const sati = Math.floor(minuta / 60);
  const ostatak = Math.round(minuta % 60);

  if (sati === 0) return `${ostatak} min`;
  if (ostatak === 0) return `${sati} h`;

  return `${sati} h ${ostatak} min`;
};

/** 1234.5 -> 1.234,50 EUR */
export const novac = (iznos: number | null | undefined, valuta = 'EUR'): string => {
  if (iznos === null || iznos === undefined || !Number.isFinite(iznos)) return '-';

  const [hiljade, decimale] = jeSrpski() ? ['.', ','] : [',', '.'];

  const formatiran = iznos
    .toFixed(2)
    .replace('.', decimale)
    .replace(new RegExp(`\\B(?=(\\d{3})+(?!\\d)(?=\\${decimale}))`, 'g'), hiljade);

  return `${formatiran} ${valuta}`;
};

/** 12.4 -> 12,4 km  |  <1 km se prikazuje u metrima */
export const razdaljina = (km: number | null | undefined): string => {
  if (km === null || km === undefined || !Number.isFinite(km)) return '-';
  if (km < 1) return `${Math.round(km * 1000)} m`;

  return `${km.toFixed(1).replace('.', jeSrpski() ? ',' : '.')} km`;
};

/** Broj presedanja u tekst. */
export const presedanja = (broj: number): string => {
  if (broj === 0) return prevedi('format.direktanLet');

  return prevediBroj('format.presedanje', broj);
};

/**
 * Prelaz između dve aktivnosti: „12 min pešice · 0,9 km".
 * Bez podatka o kretanju vraća prazan tekst, pa se red ne prikazuje.
 */
export const prelaz = (
  minuta: number | null | undefined,
  nacin: string | null | undefined,
  km: number | null | undefined
): string => {
  if (!Number.isFinite(minuta as number)) return '';

  const kako = prevedi(nacin === 'prevoz' ? 'format.prevozom' : 'format.pesice');
  const koliko = Number.isFinite(km as number) ? ` · ${razdaljina(km)}` : '';

  return `${minuta} min ${kako}${koliko}`;
};
