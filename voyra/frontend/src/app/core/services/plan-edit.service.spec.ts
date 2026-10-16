import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { CEKANJE_PREGLEDA_MS, PlanEditService } from './plan-edit.service';
import { Atrakcija, Dan } from '../models/plan.model';
import { Putovanje } from '../models/trip.model';

const atrakcija = (id: string, ime = id): Atrakcija =>
  ({
    id,
    name: ime,
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
  }) as Atrakcija;

const dan = (broj: number, atrakcije: Atrakcija[]): Dan =>
  ({
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
  }) as Dan;

const putovanje = (): Putovanje =>
  ({
    _id: 'trip1',
    title: 'BEG -> ATH',
    from: 'BEG',
    to: 'ATH',
    passengers: 2,
    status: 'NACRT',
    itinerary: {
      flights: [],
      accommodations: [],
      itinerary: [dan(1, [atrakcija('A1'), atrakcija('A2')]), dan(2, [atrakcija('B1')])],
      totalDays: 2,
      totalBudget: { flights: 100, accommodations: 200, attractions: 0, total: 300 }
    }
  }) as unknown as Putovanje;

describe('PlanEditService (režim izmene §4.6)', () => {
  let servis: PlanEditService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), PlanEditService]
    });

    servis = TestBed.inject(PlanEditService);
    http = TestBed.inject(HttpTestingController);

    servis.pocni(putovanje(), 'v1');
  });

  const ids = (broj: number) =>
    (servis.dani().find((d) => d.day === broj)?.attractions ?? []).map((a) => a.id);

  // ---------------------------------------------------------------
  // 13. Stek za poništavanje
  // ---------------------------------------------------------------

  it('tri izmene i tri poništavanja vraćaju početno stanje', fakeAsync(() => {
    const pocetno = { dan1: ids(1), dan2: ids(2) };

    servis.premesti(1, 'A1', 2);
    servis.ukloni(2, 'B1');
    servis.dodaj(1, atrakcija('C9'));

    expect(ids(1)).not.toEqual(pocetno.dan1);

    servis.ponisti();
    servis.ponisti();
    servis.ponisti();

    expect(ids(1)).toEqual(pocetno.dan1);
    expect(ids(2)).toEqual(pocetno.dan2);
    expect(servis.mozePonistiti()).toBeFalse();

    tick(CEKANJE_PREGLEDA_MS);
    http.match(() => true).forEach((z) => z.flush({ success: true, days: [], totalBudget: null }));
  }));

  it('poništavanje bez izmena ne radi ništa', () => {
    const pre = ids(1);

    servis.ponisti();

    expect(ids(1)).toEqual(pre);
  });

  it('pomeranje gore i dole menja redosled u danu', fakeAsync(() => {
    servis.pomeriDole(1, 'A1');
    expect(ids(1)).toEqual(['A2', 'A1']);

    servis.pomeriGore(1, 'A1');
    expect(ids(1)).toEqual(['A1', 'A2']);

    tick(CEKANJE_PREGLEDA_MS);
    http.match(() => true).forEach((z) => z.flush({ success: true, days: [], totalBudget: null }));
  }));

  it('prva aktivnost ne može gore, poslednja ne može dole', () => {
    servis.pomeriGore(1, 'A1');
    servis.pomeriDole(1, 'A2');

    expect(ids(1)).toEqual(['A1', 'A2']);
  });

  // ---------------------------------------------------------------
  // 14. Debounce: tri brze izmene -> jedan zahtev
  // ---------------------------------------------------------------

  it('tri brze izmene prave JEDAN zahtev za preračunavanje', fakeAsync(() => {
    servis.pomeriDole(1, 'A1');
    tick(50);
    servis.pomeriGore(1, 'A1');
    tick(50);
    servis.ukloni(1, 'A2');

    // Pre isteka čekanja nijedan zahtev nije otišao
    http.expectNone('/v1/trips/trip1/days/preview');

    tick(CEKANJE_PREGLEDA_MS);

    const zahtevi = http.match('/v1/trips/trip1/days/preview');
    expect(zahtevi.length).toBe(1);

    // Šalje se poslednje stanje, ne prvo
    expect(zahtevi[0].request.body.days[0].attractionIds).toEqual(['A1']);

    zahtevi[0].flush({
      success: true,
      days: [{ ...dan(1, [atrakcija('A1')]), totalDistance: 0 }],
      totalBudget: { flights: 100, accommodations: 200, attractions: 0, total: 300 }
    });

    expect(servis.racuna()).toBeFalse();
  }));

  it('šalju se samo izmenjeni dani', fakeAsync(() => {
    servis.ukloni(2, 'B1');
    tick(CEKANJE_PREGLEDA_MS);

    const zahtev = http.expectOne('/v1/trips/trip1/days/preview');
    expect(zahtev.request.body.days.length).toBe(1);
    expect(zahtev.request.body.days[0].day).toBe(2);

    zahtev.flush({ success: true, days: [], totalBudget: null });
  }));

  it('neuspeh preračunavanja ostavlja stara vremena i prijavljuje grešku', fakeAsync(() => {
    servis.ukloni(1, 'A2');
    tick(CEKANJE_PREGLEDA_MS);

    http.expectOne('/v1/trips/trip1/days/preview').flush(
      { message: 'pao' },
      { status: 500, statusText: 'Server Error' }
    );

    expect(servis.greska()).toContain('Vremena');
    expect(ids(1)).toEqual(['A1']);
  }));

  // ---------------------------------------------------------------
  // Odbacivanje i stanje „ima izmena"
  // ---------------------------------------------------------------

  it('„Odbaci izmene" vraća sačuvano stanje', fakeAsync(() => {
    servis.ukloni(1, 'A1');
    expect(servis.imaIzmena()).toBeTrue();

    servis.odbaci();

    expect(servis.imaIzmena()).toBeFalse();
    expect(ids(1)).toEqual(['A1', 'A2']);

    tick(CEKANJE_PREGLEDA_MS);
    http.match(() => true).forEach((z) => z.flush({ success: true, days: [], totalBudget: null }));
  }));

  it('broji aktivnosti koje krše radno vreme', fakeAsync(() => {
    servis.ukloni(1, 'A2');
    tick(CEKANJE_PREGLEDA_MS);

    const zatvorena = { ...atrakcija('A1'), violation: 'zatvoreno' } as Atrakcija;

    http.expectOne('/v1/trips/trip1/days/preview').flush({
      success: true,
      days: [dan(1, [zatvorena])],
      totalBudget: null
    });

    expect(servis.brojKrsenja()).toBe(1);
  }));

  afterEach(() => http.verify());
});
