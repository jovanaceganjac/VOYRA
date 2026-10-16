import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Pravila iz specifikacije §11 - ista kao Joi sema u user-service-u. */
export interface PravilaLozinke {
  duzina: boolean;
  veliko: boolean;
  malo: boolean;
  broj: boolean;
  specijalni: boolean;
}

export const proveriPravila = (v: string): PravilaLozinke => ({
  duzina: v.length >= 8,
  veliko: /[A-Z]/.test(v),
  malo: /[a-z]/.test(v),
  broj: /\d/.test(v),
  specijalni: /[!@#$%^&*]/.test(v)
});

/**
 * Lozinka: >= 8 karaktera, veliko i malo slovo, broj i znak !@#$%^&*
 */
export const passwordValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const v: string = control.value ?? '';
  if (!v) return null;

  const p = proveriPravila(v);
  const sveIspunjeno = Object.values(p).every(Boolean);

  return sveIspunjeno ? null : { lozinka: p };
};

/**
 * Poredi dva polja u formi (lozinka i potvrda).
 * Greska se postavlja na samu formu, ne na polje.
 */
export const lozinkeSePoklapaju = (
  poljeLozinka: string,
  poljePotvrda: string
): ValidatorFn => {
  return (grupa: AbstractControl): ValidationErrors | null => {
    const a = grupa.get(poljeLozinka)?.value;
    const b = grupa.get(poljePotvrda)?.value;

    if (!a || !b) return null;

    return a === b ? null : { nePoklapajuSe: true };
  };
};
