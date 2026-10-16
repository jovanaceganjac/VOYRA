import { TestBed } from '@angular/core/testing';

import { PlanWizardService, ParametriPutovanja } from './plan-wizard.service';
import { Let, Plan, Smestaj } from '../models/plan.model';

const KLJUC = 'voyra_carobnjak';

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
  budget: 1500,
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

const let_ = (offerId = 'off_1'): Let =>
  ({ offerId, id: offerId, price: 300, priceEUR: 300 }) as Let;

const smestaj = (id = 'ACC001'): Smestaj => ({ id, name: 'Hotel', totalPrice: 400 }) as Smestaj;

const plan = (): Plan => ({ planSessionId: 'PSN_1', savedTripId: null }) as Plan;

/** Nova instanca servisa - konstruktor cita sessionStorage. */
const noviServis = (): PlanWizardService => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});

  return TestBed.inject(PlanWizardService);
};

describe('PlanWizardService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  afterEach(() => sessionStorage.clear());

  // ---------------------------------------------------------------
  // TEST 1: zavisnosti koraka
  // ---------------------------------------------------------------
  describe('zavisnosti koraka', () => {
    it('novi parametri ponistavaju let, smestaj i plan', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);
      s.postaviLet(let_());
      s.postaviSmestaj(smestaj());
      s.postaviPlan(plan());

      s.postaviParametre({ ...PARAMETRI, passengers: 3 });

      expect(s.izabraniLet()).toBeNull();
      expect(s.izabraniSmestaj()).toBeNull();
      expect(s.plan()).toBeNull();
      expect(s.prviNezavrsenKorak()).toBe(2);
    });

    it('drugi let ponistava izbor smestaja, jer se menja preostali budzet', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);
      s.postaviLet(let_('off_1'));
      s.postaviSmestaj(smestaj());

      s.postaviLet(let_('off_2'));

      expect(s.izabraniSmestaj()).toBeNull();
      expect(s.prviNezavrsenKorak()).toBe(3);
    });

    it('vratiLet obnavlja raniji izbor bez ponistavanja kasnijih koraka', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);
      s.postaviLet(let_('off_1'));
      s.postaviSmestaj(smestaj());

      s.vratiLet(let_('off_1'));

      expect(s.izabraniSmestaj()).not.toBeNull();
      expect(s.prviNezavrsenKorak()).toBe(4);
    });

    it('svestan nastavak bez leta zavrsava korak 2', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);
      expect(s.prviNezavrsenKorak()).toBe(2);

      s.nastaviBezLeta();
      expect(s.prviNezavrsenKorak()).toBe(3);

      s.nastaviBezSmestaja();
      expect(s.prviNezavrsenKorak()).toBe(4);
    });

    it('istekla ponuda (410) ponistava izbor i vraca korisnika na korak 2', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);
      s.postaviLet(let_());
      s.postaviSmestaj(smestaj());

      s.ponistiIzborLeta();

      expect(s.izabraniLet()).toBeNull();
      expect(s.prviNezavrsenKorak()).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // TEST 2: sessionStorage
  // ---------------------------------------------------------------
  describe('sessionStorage', () => {
    it('cuva parametre i identifikatore, ali ne i same ponude', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);
      s.postaviLet(let_('off_7'));
      s.postaviSmestaj(smestaj('ACC009'));

      const sacuvano = JSON.parse(sessionStorage.getItem(KLJUC) as string);

      expect(sacuvano.parametri.to).toBe('ATH');
      expect(sacuvano.letOfferId).toBe('off_7');
      expect(sacuvano.smestajId).toBe('ACC009');
      expect(JSON.stringify(sacuvano)).not.toContain('"price"');
    });

    it('cuva identifikator grada, pa se izbor vraca posle osvezavanja', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);

      const sacuvano = JSON.parse(sessionStorage.getItem(KLJUC) as string);

      // Izbor je grad, a ne tekst iz polja
      expect(sacuvano.parametri.fromCityId).toBe('792680');
      expect(sacuvano.parametri.toCityId).toBe('264371');

      const posle = noviServis();

      expect(posle.parametri()?.toCityId).toBe('264371');
      expect(posle.parametri()?.from).toBe('BEG');
    });

    it('posle osvezavanja stranice koraci ostaju zavrseni po zapamcenom id-u', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);
      s.postaviLet(let_('off_7'));
      s.postaviSmestaj(smestaj('ACC009'));

      const posle = noviServis();

      expect(posle.izabraniLet()).toBeNull();
      expect(posle.zapamcenLetId()).toBe('off_7');
      expect(posle.zapamcenSmestajId()).toBe('ACC009');
      expect(posle.prviNezavrsenKorak()).toBe(4);
    });

    it('ostecen zapis se odbacuje, a carobnjak krece od koraka 1', () => {
      sessionStorage.setItem(KLJUC, '{ ovo nije json');

      const s = noviServis();

      expect(s.parametri()).toBeNull();
      expect(s.prviNezavrsenKorak()).toBe(1);
      expect(sessionStorage.getItem(KLJUC)).toBeNull();
    });

    it('radi i kada skladiste baca izuzetak (privatni prozor)', () => {
      const pukni = (): never => {
        throw new DOMException('odbijeno', 'SecurityError');
      };

      spyOn(Storage.prototype, 'getItem').and.callFake(pukni);
      spyOn(Storage.prototype, 'setItem').and.callFake(pukni);
      spyOn(Storage.prototype, 'removeItem').and.callFake(pukni);

      const s = noviServis();

      expect(() => s.postaviParametre(PARAMETRI)).not.toThrow();
      expect(() => s.postaviLet(let_())).not.toThrow();
      expect(() => s.ocisti()).not.toThrow();
      expect(s.sacuvanaSesija()).toBeNull();
    });

    it('cuva id sesije, pa se plan posle osvezavanja ucitava bez ponovnog racunanja', () => {
      const s = TestBed.inject(PlanWizardService);

      s.postaviParametre(PARAMETRI);
      s.postaviPlan(plan());

      expect(noviServis().sacuvanaSesija()).toBe('PSN_1');
    });
  });
});
