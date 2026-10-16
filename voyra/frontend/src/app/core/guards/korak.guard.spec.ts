import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { korakGuard } from './korak.guard';
import { PlanWizardService, ParametriPutovanja } from '../services/plan-wizard.service';
import { Let, Smestaj } from '../models/plan.model';

const PARAMETRI: ParametriPutovanja = {
  from: 'BEG',
  to: 'ATH',
  fromCityId: '792680',
  toCityId: '264371',
  fromCity: null,
  toCity: null,
  checkIn: '2027-06-10',
  checkOut: '2027-06-14',
  passengers: 2,
  budget: null,
  preferences: {
    transportPriority: 'balans',
    accommodationTypes: ['hotel'],
    minAccommodationRating: null,
    interests: ['kultura'],
    pace: 'umeren',
    dayStart: '09:00',
    dayEnd: '20:00'
  }
};

/** Ruta koraka: broj stoji u `data`, kao u app.routes.ts. */
const ruta = (korak: number): ActivatedRouteSnapshot =>
  ({ data: { korak }, paramMap: { get: () => null } }) as unknown as ActivatedRouteSnapshot;

const stanje = {} as RouterStateSnapshot;

const pokreni = (korak: number): boolean | UrlTree =>
  TestBed.runInInjectionContext(() => korakGuard(ruta(korak), stanje)) as boolean | UrlTree;

describe('korakGuard', () => {
  let wizard: PlanWizardService;

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    wizard = TestBed.inject(PlanWizardService);
  });

  afterEach(() => sessionStorage.clear());

  it('bez parametara pusta samo korak 1', () => {
    expect(pokreni(1)).toBeTrue();
    expect(String(pokreni(2))).toBe('/planiranje/1');
    expect(String(pokreni(4))).toBe('/planiranje/1');
  });

  it('preusmerava na PRVI nezavrsen korak, ne na pocetak', () => {
    wizard.postaviParametre(PARAMETRI);

    expect(pokreni(2)).toBeTrue();
    expect(String(pokreni(4))).toBe('/planiranje/2');
  });

  it('pusta unazad na vec zavrseni korak', () => {
    wizard.postaviParametre(PARAMETRI);
    wizard.postaviLet({ offerId: 'off_1' } as Let);

    expect(pokreni(1)).toBeTrue();
    expect(pokreni(2)).toBeTrue();
    expect(pokreni(3)).toBeTrue();
  });

  it('pusta na korak 4 kada su izbori napravljeni', () => {
    wizard.postaviParametre(PARAMETRI);
    wizard.postaviLet({ offerId: 'off_1' } as Let);
    wizard.postaviSmestaj({ id: 'ACC001' } as Smestaj);

    expect(pokreni(4)).toBeTrue();
  });

  it('posle osvezavanja stranice ne vraca korisnika unazad', () => {
    wizard.postaviParametre(PARAMETRI);
    wizard.postaviLet({ offerId: 'off_1' } as Let);

    // Nova instanca: u memoriji ostaje samo zapamcen id iz sessionStorage
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(PlanWizardService);

    expect(pokreni(3)).toBeTrue();
  });
});
