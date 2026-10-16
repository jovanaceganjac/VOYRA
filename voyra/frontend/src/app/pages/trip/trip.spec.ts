import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { TripComponent } from './trip';
import { CEKANJE_PREGLEDA_MS } from '../../core/services/plan-edit.service';

const atrakcija = (id: string) => ({
  id,
  name: id,
  city: 'Athens',
  category: 'kultura',
  categories: ['kultura'],
  lat: 37.97,
  lon: 23.72,
  description: '',
  price: 0,
  currency: 'EUR',
  duration: 60,
  rating: 4,
  views: 0,
  order: 1,
  startTime: '09:00',
  endTime: '10:00'
});

const dan = (broj: number, atrakcije: unknown[]) => ({
  day: broj,
  date: `2027-06-${9 + broj}`,
  flight: null,
  accommodation: null,
  attractions: atrakcije,
  totalDistance: 1,
  estimatedBudget: 0,
  availableFrom: '09:00',
  availableTo: '20:00',
  note: null,
  lunch: null
});

const PUTOVANJE = {
  _id: 'trip1',
  title: 'Beograd → Atina',
  from: 'BEG',
  to: 'ATH',
  checkIn: '2027-06-10',
  checkOut: '2027-06-14',
  passengers: 2,
  budget: 1500,
  status: 'NACRT',
  createdAt: '2027-01-01T00:00:00.000Z',
  itinerary: {
    flights: [],
    accommodations: [],
    itinerary: [dan(1, [atrakcija('A1'), atrakcija('A2')]), dan(2, [atrakcija('B1')])],
    totalDays: 2,
    totalBudget: { flights: 100, accommodations: 200, attractions: 0, total: 300, currency: 'EUR' }
  }
};

describe('TripComponent (stranica putovanja §4.6)', () => {
  let fixture: ComponentFixture<TripComponent>;
  let komponenta: TripComponent;
  let http: HttpTestingController;

  const napravi = (izmene: Record<string, unknown> = {}, editable = true) => {
    fixture = TestBed.createComponent(TripComponent);
    komponenta = fixture.componentInstance;
    fixture.detectChanges();

    http.expectOne('/v1/trips/trip1').flush({
      success: true,
      data: { ...PUTOVANJE, ...izmene },
      editable,
      version: 'v1'
    });

    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TripComponent],
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

  it('učitava putovanje i prikazuje naziv i status', () => {
    napravi();

    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Beograd → Atina');
    expect(el.textContent).toContain('Nacrt');
  });

  // ---------------------------------------------------------------
  // 15. canDeactivate
  // ---------------------------------------------------------------

  it('bez režima izmene nema nesačuvanih izmena', () => {
    napravi();

    expect(komponenta.imaNesacuvanih()).toBeFalse();
  });

  it('otvoren režim izmene bez promena i dalje nema nesačuvanih', () => {
    napravi();
    komponenta.pocniIzmenu();

    expect(komponenta.imaNesacuvanih()).toBeFalse();
  });

  it('posle izmene ima nesačuvanih, a posle odbacivanja nema', fakeAsync(() => {
    napravi();
    komponenta.pocniIzmenu();
    komponenta.izmena.ukloni(1, 'A1');

    expect(komponenta.imaNesacuvanih()).toBeTrue();

    komponenta.odbaciIzmene();
    expect(komponenta.imaNesacuvanih()).toBeFalse();

    tick(CEKANJE_PREGLEDA_MS);
    http.match(() => true).forEach((z) => z.flush({ success: true, days: [], totalBudget: null }));
  }));

  // ---------------------------------------------------------------
  // 16. Konflikt verzije
  // ---------------------------------------------------------------

  it('konflikt verzije nudi oba izbora', fakeAsync(() => {
    napravi();
    komponenta.pocniIzmenu();
    komponenta.izmena.ukloni(1, 'A1');

    tick(CEKANJE_PREGLEDA_MS);
    http.match('/v1/trips/trip1/days/preview').forEach((z) =>
      z.flush({ success: true, days: [dan(1, [atrakcija('A2')])], totalBudget: null })
    );
    fixture.detectChanges();

    komponenta.sacuvaj();

    http.expectOne('/v1/trips/trip1/days').flush(
      {
        success: false,
        error: 'VERSION_CONFLICT',
        message: 'Putovanje je u međuvremenu izmenjeno',
        currentVersion: 'v2'
      },
      { status: 409, statusText: 'Conflict' }
    );

    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;

    expect(komponenta.konflikt()).toBeTrue();
    expect(el.textContent).toContain('Putovanje je u međuvremenu izmenjeno');
    expect(el.textContent).toContain('Zadrži moje izmene');
    expect(el.textContent).toContain('Učitaj novu verziju');
  }));

  it('„Zadrži moje izmene" povlači novu verziju pa ponovo šalje izmene', fakeAsync(() => {
    napravi();
    komponenta.pocniIzmenu();
    komponenta.izmena.ukloni(1, 'A1');

    tick(CEKANJE_PREGLEDA_MS);
    http.match('/v1/trips/trip1/days/preview').forEach((z) =>
      z.flush({ success: true, days: [dan(1, [atrakcija('A2')])], totalBudget: null })
    );

    komponenta.sacuvaj();
    http.expectOne('/v1/trips/trip1/days').flush(
      { error: 'VERSION_CONFLICT', message: 'konflikt' },
      { status: 409, statusText: 'Conflict' }
    );

    komponenta.zadrziMojeIzmene();

    // Prvo se povuče nova verzija...
    http.expectOne('/v1/trips/trip1').flush({
      success: true,
      data: PUTOVANJE,
      editable: true,
      version: 'v2'
    });

    // ...pa se izmene šalju iznad nje
    const cuvanje = http.expectOne('/v1/trips/trip1/days');
    expect(cuvanje.request.body.version).toBe('v2');

    cuvanje.flush({ success: true, data: PUTOVANJE, editable: true, version: 'v3' });

    expect(komponenta.konflikt()).toBeFalse();
    expect(komponenta.uIzmeni()).toBeFalse();
  }));

  // ---------------------------------------------------------------
  // Status koji se ne menja
  // ---------------------------------------------------------------

  it('otkazano putovanje se ne može izmeniti', () => {
    napravi({ status: 'OTKAZANO' }, false);

    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('se više ne menja');
    expect(el.querySelector('button')?.textContent).not.toContain('Izmeni plan');

    komponenta.pocniIzmenu();
    expect(komponenta.uIzmeni()).toBeFalse();
  });

  it('dijalog „Generiši ponovo" objašnjava šta se gubi', () => {
    napravi();
    komponenta.potvrdaGenerisanja.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('ručne izmene će se izgubiti');
    expect(el.textContent).toContain('Let i smeštaj ostaju isti');
  });

  afterEach(() => http.verify());
});
