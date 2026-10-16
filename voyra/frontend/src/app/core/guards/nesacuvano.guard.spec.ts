import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  provideRouter
} from '@angular/router';

import { MozeDaIma, nesacuvanoGuard } from './nesacuvano.guard';

const prazno = {} as ActivatedRouteSnapshot;
const stanje = {} as RouterStateSnapshot;

const pokreni = (komponenta: MozeDaIma): boolean =>
  TestBed.runInInjectionContext(
    () => nesacuvanoGuard(komponenta, prazno, stanje, stanje) as boolean
  );

describe('nesacuvanoGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('pušta bez pitanja kada nema nesačuvanih izmena', () => {
    const potvrda = spyOn(window, 'confirm');

    expect(pokreni({ imaNesacuvanih: () => false })).toBeTrue();
    expect(potvrda).not.toHaveBeenCalled();
  });

  it('traži potvrdu kada izmene postoje', () => {
    const potvrda = spyOn(window, 'confirm').and.returnValue(true);

    expect(pokreni({ imaNesacuvanih: () => true })).toBeTrue();
    expect(potvrda).toHaveBeenCalled();
  });

  it('zadržava korisnika na stranici kada odustane', () => {
    spyOn(window, 'confirm').and.returnValue(false);

    expect(pokreni({ imaNesacuvanih: () => true })).toBeFalse();
  });

  it('ne puca kada komponenta ne ume da odgovori', () => {
    expect(pokreni({} as MozeDaIma)).toBeTrue();
  });
});
