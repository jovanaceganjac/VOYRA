import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

import { prevedi } from '../../core/i18n/prevod';

/**
 * Validatori za podatke o putniku (spec §4.8 t.3).
 *
 * Pravila su ista kao na serveru, a oba potiču iz zvanične Duffel
 * dokumentacije („Create an order", polja `passengers.*`):
 * https://duffel.com/docs/api/v2/orders/create-order
 *
 * Ovde su da bi korisnik grešku video pre slanja; server ih svejedno
 * proverava ponovo - klijentu se ne veruje.
 */

/** Duffel: "mr", "ms", "mrs", "miss", "dr". `naziv` je ključ prevoda. */
export const TITULE = [
  { vrednost: 'mr', naziv: 'putnik.titule.mr' },
  { vrednost: 'ms', naziv: 'putnik.titule.ms' },
  { vrednost: 'mrs', naziv: 'putnik.titule.mrs' },
  { vrednost: 'miss', naziv: 'putnik.titule.miss' },
  { vrednost: 'dr', naziv: 'putnik.titule.dr' }
];

export const POLOVI = [
  { vrednost: 'm', naziv: 'putnik.polovi.m' },
  { vrednost: 'f', naziv: 'putnik.polovi.f' }
];

/** Ime i prezime zajedno najviše 40 znakova (Duffel). */
export const MAX_IME_PREZIME = 40;

/**
 * Dozvoljeni znakovi: razmak, `-`, `'` i slova iz ASCII, Latin-1
 * Supplement i Latin Extended-A skupova.
 *
 * Srpska slova (č, ć, ž, š, đ) SU u Latin Extended-A, pa prolaze -
 * ćirilica ne.
 */
const DOZVOLJENI_ZNAKOVI = /^[A-Za-zÀ-ÿĀ-ſ '-]+$/;
const IZUZECI = /[ÆæĲĳŒœÞð]/;

/** E.164; isti oblik kao u profilu korisnika. */
export const E164 = /^\+[1-9]\d{7,14}$/;

/** Ime ili prezime po Duffel pravilima. */
export const imePutnikaValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const tekst = String(c.value ?? '').trim();
  if (!tekst) return null;

  if (tekst.length < 2) return { kratkoIme: true };
  if (!DOZVOLJENI_ZNAKOVI.test(tekst) || IZUZECI.test(tekst)) return { nelatinica: true };

  return null;
};

export const telefonE164Validator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const tekst = String(c.value ?? '').trim();
  if (!tekst) return null;

  return E164.test(tekst) ? null : { e164: true };
};

/** Godine na zadati datum - punoletstvo se meri na dan povratka. */
export const godineNa = (bornOn: string, datum: string): number | null => {
  const rodjen = new Date(`${String(bornOn).slice(0, 10)}T00:00:00Z`);
  const kada = new Date(`${String(datum).slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(rodjen.getTime()) || Number.isNaN(kada.getTime())) return null;

  let godine = kada.getUTCFullYear() - rodjen.getUTCFullYear();
  const mesec = kada.getUTCMonth() - rodjen.getUTCMonth();

  if (mesec < 0 || (mesec === 0 && kada.getUTCDate() < rodjen.getUTCDate())) godine -= 1;

  return godine;
};

/**
 * Datum rođenja: u prošlosti i punoletan na dan povratka.
 *
 * Pretraga je rađena za odrasle putnike (`type: adult`), pa dete ne sme
 * da se pošalje kao odrasla osoba.
 */
export const datumRodjenjaValidator =
  (datumPovratka: string): ValidatorFn =>
  (c: AbstractControl): ValidationErrors | null => {
    const tekst = String(c.value ?? '').trim();
    if (!tekst) return null;

    const datum = new Date(`${tekst}T00:00:00Z`);
    if (Number.isNaN(datum.getTime())) return { datum: true };
    if (datum >= new Date()) return { uBuducnosti: true };

    const godine = godineNa(tekst, datumPovratka);

    return godine !== null && godine < 18 ? { maloletan: true } : null;
  };

/** Ime + prezime zajedno ≤ 40 znakova - proverava se nad grupom. */
export const duzinaImenaValidator: ValidatorFn = (grupa: AbstractControl): ValidationErrors | null => {
  const ime = String(grupa.get('givenName')?.value ?? '').trim();
  const prezime = String(grupa.get('familyName')?.value ?? '').trim();

  if (!ime || !prezime) return null;

  return `${ime}${prezime}`.length > MAX_IME_PREZIME ? { predugoIme: true } : null;
};

/** Poruka za jedno polje; prazan string kada greške nema. */
export const porukaZaPolje = (greske: ValidationErrors | null | undefined): string => {
  if (!greske) return '';

  if (greske['required']) return prevedi('putnik.obavezno');
  if (greske['kratkoIme']) return prevedi('putnik.kratkoIme');
  if (greske['nelatinica']) return prevedi('putnik.nelatinica');
  if (greske['email']) return prevedi('putnik.email');
  if (greske['e164']) return prevedi('putnik.e164');
  if (greske['uBuducnosti']) return prevedi('putnik.uBuducnosti');
  if (greske['maloletan']) return prevedi('putnik.maloletan');
  if (greske['datum']) return prevedi('putnik.datum');
  if (greske['predugoIme']) return prevedi('putnik.predugoIme', { max: MAX_IME_PREZIME });

  return prevedi('putnik.neispravno');
};
