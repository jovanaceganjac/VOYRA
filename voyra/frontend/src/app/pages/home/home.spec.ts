import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { HomeComponent } from './home';
import { IstaknutaDestinacija, PopularnaDestinacija } from '../../core/models/sadrzaj.model';

const ISTAKNUTA: IstaknutaDestinacija = {
  id: 'd1',
  gradId: '264371',
  naziv: 'Atina',
  naslov: 'Atina',
  drzava: 'GR',
  drzavaNaziv: 'Grčka',
  lat: 37.98,
  lon: 23.72,
  opis: 'Akropolj i Plaka',
  slika: { url: 'https://primer.test/atina.jpg', credit: 'Wikimedia Commons' },
  redosled: 1,
  istaknuta: true
};

const POPULARNA: PopularnaDestinacija = {
  gradId: '3169070',
  naziv: 'Rim',
  drzava: 'IT',
  drzavaNaziv: 'Italija',
  lat: 41.89,
  lon: 12.48,
  brojPretraga: 5,
  brojSacuvanih: 1,
  score: 8
};

describe('HomeComponent (§4.1 destinacije)', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let komponenta: HomeComponent;
  let http: HttpTestingController;

  /** Odgovara na sve pozive koje početna šalje pri otvaranju. */
  const odgovori = (
    istaknute: IstaknutaDestinacija[],
    popularne: PopularnaDestinacija[]
  ): void => {
    http
      .match((z) => z.url.startsWith('/v1/cities/by-iata/'))
      .forEach((z) => z.flush({ success: true, data: null }, { status: 404, statusText: '' }));

    http
      .expectOne((z) => z.url === '/v1/destinations/featured')
      .flush({ success: true, data: istaknute, count: istaknute.length });

    http
      .expectOne((z) => z.url === '/v1/destinations/popular')
      .flush({ success: true, data: popularne, count: popularne.length });

    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });

    fixture = TestBed.createComponent(HomeComponent);
    komponenta = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const tekst = (): string => fixture.nativeElement.textContent as string;

  // ---------------------------------------------------------------
  // Provera 14: prazne liste znače da sekcija NE postoji
  // ---------------------------------------------------------------

  it('ne prikazuje sekcije kada su liste prazne', () => {
    odgovori([], []);

    expect(tekst()).not.toContain('Istaknute destinacije');
    expect(tekst()).not.toContain('Popularno poslednjih 30 dana');
    expect(fixture.nativeElement.querySelectorAll('.kartica-dest').length).toBe(0);
  });

  it('prikazuje istaknute kada ih ima', () => {
    odgovori([ISTAKNUTA], []);

    expect(tekst()).toContain('Istaknute destinacije');
    expect(tekst()).toContain('Atina');
    expect(tekst()).toContain('Akropolj i Plaka');
    // Potpis izvora slike stoji uz karticu
    expect(tekst()).toContain('Wikimedia Commons');

    // Popularne su i dalje prazne, pa te sekcije nema
    expect(tekst()).not.toContain('Popularno poslednjih 30 dana');
  });

  it('prikazuje popularne sa brojem pretraga', () => {
    odgovori([], [POPULARNA]);

    expect(tekst()).toContain('Popularno poslednjih 30 dana');
    expect(tekst()).toContain('Rim');
    expect(tekst()).toContain('5 pretraga');
  });

  it('klik na destinaciju vodi u korak 1 sa tim odredistem', () => {
    odgovori([ISTAKNUTA], []);

    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture.nativeElement.querySelector('.kartica-dest__dugme').click();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/planiranje', 1],
      jasmine.objectContaining({ queryParams: jasmine.objectContaining({ toCityId: '264371' }) })
    );
  });

  it('srpska promena broja uz pretrage', () => {
    expect(komponenta.opisPretraga(1)).toBe('1 pretraga');
    expect(komponenta.opisPretraga(3)).toBe('3 pretrage');
    expect(komponenta.opisPretraga(5)).toBe('5 pretraga');
    expect(komponenta.opisPretraga(11)).toBe('11 pretraga');
    expect(komponenta.opisPretraga(22)).toBe('22 pretrage');

    odgovori([], []);
  });
});
