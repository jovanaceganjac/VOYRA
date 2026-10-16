import { FormControl, FormGroup } from '@angular/forms';

import {
  lozinkeSePoklapaju,
  passwordValidator,
  proveriPravila
} from './password.validator';

describe('passwordValidator', () => {
  const proveri = (v: string) => passwordValidator(new FormControl(v));

  it('prihvata lozinku koja ispunjava sva pravila', () => {
    expect(proveri('SecurePass123!')).toBeNull();
  });

  it('prazno polje prepusta Validators.required', () => {
    expect(proveri('')).toBeNull();
  });

  it('odbija kratku lozinku', () => {
    const g = proveri('Ab1!');
    expect(g?.['lozinka'].duzina).toBeFalse();
  });

  it('odbija lozinku bez velikog slova', () => {
    const g = proveri('securepass123!');
    expect(g?.['lozinka'].veliko).toBeFalse();
  });

  it('odbija lozinku bez malog slova', () => {
    const g = proveri('SECUREPASS123!');
    expect(g?.['lozinka'].malo).toBeFalse();
  });

  it('odbija lozinku bez broja', () => {
    const g = proveri('SecurePass!');
    expect(g?.['lozinka'].broj).toBeFalse();
  });

  it('odbija lozinku bez specijalnog znaka', () => {
    const g = proveri('SecurePass123');
    expect(g?.['lozinka'].specijalni).toBeFalse();
  });

  it('prihvata sve znakove iz skupa !@#$%^&*', () => {
    for (const znak of ['!', '@', '#', '$', '%', '^', '&', '*']) {
      expect(proveri(`SecurePass123${znak}`))
        .withContext(`znak ${znak}`)
        .toBeNull();
    }
  });
});

describe('proveriPravila', () => {
  it('vraca stanje svakog pravila posebno', () => {
    expect(proveriPravila('Ab1!')).toEqual({
      duzina: false,
      veliko: true,
      malo: true,
      broj: true,
      specijalni: true
    });
  });
});

describe('lozinkeSePoklapaju', () => {
  const napraviFormu = (a: string, b: string) =>
    new FormGroup(
      { lozinka: new FormControl(a), potvrda: new FormControl(b) },
      { validators: [lozinkeSePoklapaju('lozinka', 'potvrda')] }
    );

  it('nema greske kada se lozinke poklapaju', () => {
    expect(napraviFormu('SecurePass123!', 'SecurePass123!').errors).toBeNull();
  });

  it('prijavljuje gresku kada se ne poklapaju', () => {
    expect(napraviFormu('SecurePass123!', 'Drugo123!').errors).toEqual({
      nePoklapajuSe: true
    });
  });

  it('ne prijavljuje gresku dok je potvrda prazna', () => {
    expect(napraviFormu('SecurePass123!', '').errors).toBeNull();
  });
});
