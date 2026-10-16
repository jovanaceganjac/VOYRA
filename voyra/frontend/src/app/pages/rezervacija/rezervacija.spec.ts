import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { RezervacijaComponent } from './rezervacija';

const LET = {
  offerId: 'off_1',
  id: 'off_1',
  airline: 'Olympic Air',
  airlineIata: 'OA',
  from: 'BEG',
  to: 'ATH',
  price: 328,
  currency: 'EUR',
  outbound: {
    departure: '2027-06-10T09:45:00',
    arrival: '2027-06-10T12:15:00',
    duration: 150,
    stops: 0,
    segments: []
  },
  inbound: {
    departure: '2027-06-14T13:30:00',
    arrival: '2027-06-14T16:00:00',
    duration: 150,
    stops: 0,
    segments: []
  }
};

const PUTOVANJE = {
  _id: 'trip1',
  title: 'Beograd → Atina',
  from: 'BEG',
  to: 'ATH',
  checkIn: '2027-06-10',
  checkOut: '2027-06-14',
  passengers: 2,
  status: 'NACRT',
  itinerary: { flights: [LET], selectedFlight: LET, itinerary: [], totalDays: 5 }
};

const PROVERA = (izmene: Record<string, unknown> = {}) => ({
  valid: true,
  offerId: 'off_1',
  expiresAt: null,
  priceChanged: false,
  oldPrice: 328,
  newPrice: 328,
  currency: 'EUR',
  passengersAllowed: 9,
  passengersRequired: 2,
  flight: LET,
  explicit: true,
  warnings: [],
  ...izmene
});

describe('RezervacijaComponent (§4.8)', () => {
  let fixture: ComponentFixture<RezervacijaComponent>;
  let k: RezervacijaComponent;
  let http: HttpTestingController;

  /** Pravi komponentu i odgovara na učitavanje putovanja. */
  const napravi = (trip: Record<string, unknown> = {}) => {
    fixture = TestBed.createComponent(RezervacijaComponent);
    k = fixture.componentInstance;
    fixture.detectChanges();

    http.expectOne('/v1/trips/trip1').flush({
      success: true,
      data: { ...PUTOVANJE, ...trip },
      editable: true,
      version: 'v1'
    });

    fixture.detectChanges();
  };

  /** Odgovara na profil (putnik 1 se popunjava iz njega). */
  const profil = (podaci: Record<string, unknown> = {}) => {
    const zahtevi = http.match('/api/users/me');

    zahtevi.forEach((z) =>
      z.flush({
        success: true,
        data: {
          ime: 'Jovana',
          prezime: 'Ceganjac',
          email: 'jovana@voyra.test',
          phone: null,
          ...podaci
        }
      })
    );
  };

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({
      imports: [RezervacijaComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['id', 'trip1']]) } }
        }
      ]
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => sessionStorage.clear());

  // ---------------------------------------------------------------
  // 10. Cena i istekla ponuda
  // ---------------------------------------------------------------

  it('ista cena pušta dalje bez dodatne potvrde', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(PROVERA());
    profil();
    fixture.detectChanges();

    expect(k.mozeNaPutnike()).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cena je potvrđena');
  });

  it('promenjena cena blokira „Dalje" dok se ne prihvati', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(
      PROVERA({ priceChanged: true, oldPrice: 328, newPrice: 388 })
    );
    profil();
    fixture.detectChanges();

    expect(k.mozeNaPutnike()).toBeFalse();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Cena se promenila');
    expect(el.textContent).toContain('Prihvatam novu cenu');

    k.prihvacenaCena.set(true);
    expect(k.mozeNaPutnike()).toBeTrue();
  });

  it('410 pokreće osvežavanje ponude', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(
      { error: 'OFFER_EXPIRED', message: 'istekla' },
      { status: 410, statusText: 'Gone' }
    );

    const osvezavanje = http.expectOne('/v1/trips/trip1/flight/refresh');

    osvezavanje.flush({ success: true, found: true, priceChanged: false, version: 'v2' });

    // Pronađen isti let -> ponuda se proverava ponovo
    http.expectOne('/api/bookings/validate').flush(PROVERA());
    profil();
    fixture.detectChanges();

    expect(k.mozeNaPutnike()).toBeTrue();
  });

  it('kada istog leta nema, nudi alternative sa upozorenjem o danima', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(
      { error: 'OFFER_EXPIRED' },
      { status: 410, statusText: 'Gone' }
    );

    http.expectOne('/v1/trips/trip1/flight/refresh').flush({
      success: true,
      found: false,
      alternatives: [{ ...LET, offerId: 'off_2', recommended: true }],
      version: 'v2'
    });

    profil();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;

    expect(k.alternative().length).toBe(1);
    expect(el.textContent).toContain('Isti let više nije dostupan');
    expect(el.textContent).toContain('menja vremena prvog i poslednjeg dana');
  });

  // ---------------------------------------------------------------
  // 11. Putnik 1 iz profila
  // ---------------------------------------------------------------

  it('putnik 1 se popunjava iz profila', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(PROVERA());
    profil({ phone: { number: '+381641234567', smsOptIn: true } });
    fixture.detectChanges();

    const prvi = k.putnici.at(0).value;

    expect(prvi.givenName).toBe('Jovana');
    expect(prvi.familyName).toBe('Ceganjac');
    expect(prvi.email).toBe('jovana@voyra.test');
    expect(prvi.phoneNumber).toBe('+381641234567');
  });

  it('profil bez telefona ostavlja polje prazno', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(PROVERA());
    profil({ phone: null });
    fixture.detectChanges();

    expect(k.putnici.at(0).value.phoneNumber).toBe('');
  });

  it('putnika ima tačno koliko i putovanje', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(PROVERA());
    profil();

    expect(k.putnici.length).toBe(2);
  });

  // ---------------------------------------------------------------
  // 12. Dvostruki klik šalje jedan zahtev
  // ---------------------------------------------------------------

  it('„Potvrdi rezervaciju" šalje tačno jedan zahtev i pri dvostrukom kliku', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(PROVERA());
    profil();

    k.naKorak(3);
    k.potvrdaTestRezima.set(true);

    k.potvrdi();
    k.potvrdi();

    const zahtevi = http.match('/api/bookings');
    expect(zahtevi.length).toBe(1);

    zahtevi[0].flush({
      success: true,
      bookingId: 'BK1',
      status: 'CONFIRMED',
      bookingReference: 'RZPNX8',
      totalPrice: 328,
      currency: 'EUR',
      confirmationPdf: null,
      emailSent: true,
      tripStatus: 'REZERVISANO'
    });

    fixture.detectChanges();

    expect(k.korak()).toBe(4);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('RZPNX8');
  });

  it('bez potvrde test režima dugme ne radi', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(PROVERA());
    profil();

    k.naKorak(3);
    k.potvrdi();

    http.expectNone('/api/bookings');
    expect(k.mozeDaPotvrdi()).toBeFalse();
  });

  // ---------------------------------------------------------------
  // Više od 9 putnika i stara putovanja
  // ---------------------------------------------------------------

  it('iznad 9 putnika prikazuje poruku bez forme', () => {
    napravi({ passengers: 12 });

    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('u više delova');
    expect(el.querySelector('form')).toBeNull();
    http.expectNone('/api/bookings/validate');
  });

  it('staro putovanje bez izbora leta nosi napomenu', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(
      PROVERA({ explicit: false, warnings: ['FLIGHT_NOT_EXPLICIT'] })
    );
    profil();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'nije sačuvan izbor leta'
    );
  });

  it('test režim je naglašen', () => {
    napravi();
    http.expectOne('/api/bookings/validate').flush(PROVERA());
    profil();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Test režim');
  });

  afterEach(() => http.verify());
});
