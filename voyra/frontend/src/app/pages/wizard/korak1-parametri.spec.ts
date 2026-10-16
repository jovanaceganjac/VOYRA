import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { Korak1Component } from './korak1-parametri';
import { Grad } from '../../core/models/grad.model';
import { PlanWizardService } from '../../core/services/plan-wizard.service';

/** Datum za N dana od danas, u ISO obliku. */
const zaDana = (n: number): string =>
  new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

/** Grad kakav vraca `/v1/cities` - samo polja koja korak 1 cita. */
const grad = (izmene: Partial<Grad>): Grad =>
  ({
    id: '1',
    naziv: 'Grad',
    nazivLokalni: 'Grad',
    nazivEn: 'City',
    drzava: 'RS',
    drzavaNaziv: 'Srbija',
    lat: 0,
    lon: 0,
    stanovnika: 1000,
    aerodrom: null,
    aerodromi: [],
    iataGrada: null,
    bezAerodroma: false,
    bezLeta: false,
    ...izmene
  }) as Grad;

const BEOGRAD = grad({
  id: '792680',
  naziv: 'Beograd',
  aerodrom: { iata: 'BEG', naziv: 'Nikola Tesla', udaljenostKm: 15 },
  aerodromi: [{ iata: 'BEG', naziv: 'Nikola Tesla', udaljenostKm: 15 }]
});

const ATINA = grad({
  id: '264371',
  naziv: 'Atina',
  drzava: 'GR',
  drzavaNaziv: 'Grčka',
  aerodrom: { iata: 'ATH', naziv: 'Eleftherios Venizelos', udaljenostKm: 21 },
  aerodromi: [{ iata: 'ATH', naziv: 'Eleftherios Venizelos', udaljenostKm: 21 }]
});

describe('Korak1Component (validacija §4.2)', () => {
  let fixture: ComponentFixture<Korak1Component>;
  let komponenta: Korak1Component;
  let wizard: PlanWizardService;
  let router: Router;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({
      imports: [Korak1Component],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });

    fixture = TestBed.createComponent(Korak1Component);
    komponenta = fixture.componentInstance;
    wizard = TestBed.inject(PlanWizardService);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);

    spyOn(router, 'navigate');

    fixture.detectChanges();

    // Shema preferencija stize sa servera; ovde je nije potrebno cekati
    http.match('/v1/preferences/schema').forEach((z) => z.flush({}, { status: 500, statusText: '' }));

    // Ponudjena ruta se trazi po IATA kodu, jer identifikatori nisu u kodu
    http
      .match((z) => z.url.startsWith('/v1/cities/by-iata/'))
      .forEach((z) =>
        z.flush({ success: true, data: z.request.url.endsWith('BEG') ? BEOGRAD : ATINA })
      );
  });

  afterEach(() => {
    sessionStorage.clear();
    http.verify();
  });

  const popuni = (izmene: Record<string, unknown> = {}): void => {
    komponenta.polaziste.set(BEOGRAD);
    komponenta.odrediste.set(ATINA);

    komponenta.forma.patchValue({
      checkIn: zaDana(30),
      checkOut: zaDana(34),
      passengers: 2,
      ...izmene
    });
  };

  it('ne pusta dalje bez datuma', () => {
    komponenta.dalje();

    expect(komponenta.forma.invalid).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(wizard.parametri()).toBeNull();
  });

  it('odbija povratak pre polaska', () => {
    popuni({ checkIn: zaDana(34), checkOut: zaDana(30) });
    komponenta.dalje();

    expect(komponenta.greske()).toContain('Datum povratka mora biti posle datuma polaska.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('odbija datum polaska u proslosti', () => {
    popuni({ checkIn: zaDana(-5), checkOut: zaDana(2) });
    komponenta.dalje();

    expect(komponenta.greske()).toContain('Datum polaska ne može biti u prošlosti.');
  });

  it('odbija putovanje duze od dozvoljenog', () => {
    popuni({ checkIn: zaDana(10), checkOut: zaDana(40) });
    komponenta.dalje();

    expect(komponenta.greske()?.[0]).toContain('najviše');
  });

  it('trazi bar jedan tip smestaja i bar jedno interesovanje', () => {
    popuni();
    komponenta.forma.patchValue({ accommodationTypes: [], interests: [] });
    komponenta.dalje();

    expect(komponenta.greske()).toContain('Izaberite bar jedan tip smeštaja.');
    expect(komponenta.greske()).toContain('Izaberite bar jedno interesovanje.');
  });

  it('odbija kraj dana pre pocetka', () => {
    popuni();
    komponenta.forma.patchValue({ dayStart: '20:00', dayEnd: '09:00' });
    komponenta.dalje();

    expect(komponenta.greske()).toContain('Kraj dana mora biti posle početka dana.');
  });

  it('prihvata prazan budzet i salje null - budzet nije obavezan', () => {
    popuni({ budget: null });
    komponenta.dalje();

    expect(komponenta.greske()).toBeNull();
    expect(wizard.parametri()?.budget).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/planiranje', 2]);
  });

  it('cuva identifikator grada, a IATA kod samo za pretragu leta', () => {
    popuni();
    komponenta.dalje();

    expect(wizard.parametri()?.fromCityId).toBe('792680');
    expect(wizard.parametri()?.toCityId).toBe('264371');
    expect(wizard.parametri()?.toCity?.naziv).toBe('Atina');

    expect(wizard.parametri()?.from).toBe('BEG');
    expect(wizard.parametri()?.to).toBe('ATH');
  });

  it('ne pusta dalje bez izabranog grada iz predloga', () => {
    popuni();
    komponenta.odrediste.set(null);
    komponenta.dalje();

    expect(komponenta.greske()).toContain('Izaberite polazište i odredište iz liste predloga.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('odbija isti grad kao polaziste i odrediste', () => {
    popuni();
    komponenta.odrediste.set(BEOGRAD);
    komponenta.dalje();

    expect(komponenta.greske()).toContain('Polazište i odredište moraju biti različiti.');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
