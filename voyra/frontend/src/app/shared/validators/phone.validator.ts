import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Isti format kao PHONE_REGEX u user-service-u: + i 10-14 cifara. */
const FORMAT = /^\+[0-9]{10,14}$/;

/** Ista normalizacija kao na backendu, da korisnik ne mora da pogadja oblik. */
export const normalizujBroj = (broj: string): string => {
  let t = String(broj ?? '').trim().replace(/[\s\-().]/g, '');
  if (t.startsWith('00')) t = `+${t.slice(2)}`;
  return t;
};

/** Telefon je opcion; prazno polje je ispravno. */
export const phoneValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const sirovo: string = control.value ?? '';
  if (!sirovo.trim()) return null;

  return FORMAT.test(normalizujBroj(sirovo)) ? null : { telefon: true };
};
