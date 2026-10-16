import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { postaviJezik } from '../../core/i18n/jezik';

import { ItinerarComponent } from './itinerar';
import { Atrakcija, Dan, Itinerar, Let, Smestaj } from '../../core/models/plan.model';

const atrakcija = (izmene: Partial<Atrakcija> = {}): Atrakcija =>
  ({
    id: 'A1',
    name: 'Akropolis',
    city: 'Athens',
    category: 'kultura',
    categories: ['kultura'],
    lat: 37.97,
    lon: 23.72,
    description: 'Drevno utvrđenje',
    price: 20,
    currency: 'EUR',
    duration: 120,
    rating: 4.8,
    views: 0,
    order: 1,
    startTime: '09:00',
    endTime: '11:00',
    ...izmene
  }) as Atrakcija;

const dan = (izmene: Partial<Dan> = {}): Dan =>
  ({
    day: 1,
    date: '2027-06-10',
    flight: null,
    accommodation: null,
    attractions: [atrakcija()],
    totalDistance: 2,
    estimatedBudget: 20,
    availableFrom: '09:00',
    availableTo: '20:00',
    note: null,
    lunch: null,
    ...izmene
  }) as Dan;

const itinerar = (izmene: Partial<Itinerar> = {}): Itinerar =>
  ({
    flights: [],
    accommodations: [],
    itinerary: [dan()],
    totalDays: 1,
    totalBudget: { flights: 0, accommodations: 0, attractions: 40, total: 40, currency: 'EUR' },
    ...izmene
  }) as Itinerar;

describe('ItinerarComponent', () => {
  let fixture: ComponentFixture<ItinerarComponent>;

  const napravi = (it: Itinerar, upozorenja: string[] = []): HTMLElement => {
    fixture = TestBed.createComponent(ItinerarComponent);
    fixture.componentRef.setInput('itinerar', it);
    fixture.componentRef.setInput('upozorenja', upozorenja);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    // Nazivi kategorija idu kroz PreferencijeService (koji ume da učita shemu)
    TestBed.configureTestingModule({
      imports: [ItinerarComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
  });

  it('prikazuje satnicu aktivnosti', () => {
    const el = napravi(itinerar());

    expect(el.textContent).toContain('09:00');
    expect(el.textContent).toContain('Akropolis');
    expect(el.textContent).not.toContain('satnica nije dostupna');
  });

  // ---------------------------------------------------------------
  // Stariji sacuvani planovi (ranije nemaju satnicu)
  // ---------------------------------------------------------------
  it('star plan bez satnice prikazuje napomenu umesto praznih sati', () => {
    const star = itinerar({
      itinerary: [dan({ attractions: [atrakcija({ startTime: undefined, endTime: undefined })] })]
    });

    const el = napravi(star);

    expect(el.textContent).toContain('satnica nije dostupna');
    expect(el.textContent).toContain('Akropolis');
  });

  it('star plan bez selectedFlight uzima prvu ponudu iz liste', () => {
    const star = itinerar({
      flights: [{ offerId: 'off_1', airline: 'Olympic Air', price: 300 } as Let],
      accommodations: [{ id: 'ACC1', name: 'Hotel Acropolis View' } as Smestaj]
    });

    const el = napravi(star);

    expect(el.textContent).toContain('Olympic Air');
    expect(el.textContent).toContain('Hotel Acropolis View');
  });

  // ---------------------------------------------------------------
  // Krsenje radnog vremena (§6.4)
  // ---------------------------------------------------------------
  it('označava aktivnost koja pada van radnog vremena', () => {
    const sa = itinerar({
      itinerary: [dan({ attractions: [atrakcija({ violation: 'zatvoreno' })] })]
    });

    const el = napravi(sa);

    expect(el.querySelector('.krsenje')).not.toBeNull();
    expect(el.textContent).toContain('Objekat je zatvoren u vreme dolaska');
  });

  it('bez kršenja nema ni oznake', () => {
    expect(napravi(itinerar()).querySelector('.krsenje')).toBeNull();
  });

  // ---------------------------------------------------------------
  // Atrakcije koje nisu stale u plan (§6.4)
  // ---------------------------------------------------------------
  it('izostavljene atrakcije prikazuje sa razlogom', () => {
    const sa = itinerar({
      removedAttractions: [
        { ...atrakcija({ id: 'A9', name: 'Muzej Akropolis' }), reason: 'nema vremena', day: 2 }
      ]
    });

    const el = napravi(sa);

    expect(el.textContent).toContain('Atrakcije koje nisu stale u plan (1)');
    expect(el.textContent).toContain('Muzej Akropolis');
    expect(el.textContent).toContain('nema vremena');
  });

  it('bez izostavljenih nema tog odeljka', () => {
    expect(napravi(itinerar()).textContent).not.toContain('Atrakcije koje nisu stale');
  });

  // ---------------------------------------------------------------
  // Upozorenja
  // ---------------------------------------------------------------
  it('spaja upozorenja plana i spoljna, bez ponavljanja', () => {
    const el = napravi(itinerar({ warnings: ['Isto upozorenje', 'Iz plana'] }), [
      'Isto upozorenje',
      'Spolja'
    ]);

    const poruke = [...el.querySelectorAll('.poruka--info')].map((p) => p.textContent?.trim());

    expect(poruke.filter((p) => p === 'Isto upozorenje').length).toBe(1);
    expect(poruke).toContain('Iz plana');
    expect(poruke).toContain('Spolja');
  });

  it('prazan dan nosi obrazloženje iz plana', () => {
    const el = napravi(
      itinerar({
        itinerary: [dan({ attractions: [], note: 'Nema dovoljno vremena za aktivnosti' })]
      })
    );

    expect(el.textContent).toContain('Nema dovoljno vremena za aktivnosti');
  });

  // ---------------------------------------------------------------
  // Izvor podataka se ne prikazuje (duffel, liteapi, mock...)
  // ---------------------------------------------------------------
  it('kartica plana ne prikazuje izvore podataka', () => {
    const el = napravi(
      itinerar({
        flights: [{ offerId: 'off_1', airline: 'Duffel Airways', price: 300 } as unknown as Let],
        accommodations: [{ id: 'lp_1', name: 'Hotel', type: 'hotel' } as unknown as Smestaj],
        meta: {
          destinationCity: 'Rim',
          destinationCountry: 'IT',
          sources: { flights: 'duffel', accommodations: 'liteapi', attractions: 'opentripmap' },
          attractionsFound: 1,
          daysWithoutAttractions: 0
        }
      } as Partial<Itinerar>)
    );

    const tekst = (el.textContent ?? '').toLowerCase();

    expect(tekst).not.toContain('izvor podataka');
    for (const izvor of ['liteapi', 'opentripmap', 'geoapify', 'mock', 'duffel (uživo)']) {
      expect(tekst).not.toContain(izvor);
    }
  });

  // ---------------------------------------------------------------
  // Dvojezičnost
  // ---------------------------------------------------------------
  describe('na engleskom', () => {
    beforeEach(() => postaviJezik('en'));
    afterEach(() => postaviJezik('sr'));

    it('naslovi i oznake su na engleskom, poznata poruka servera je prevedena', () => {
      const el = napravi(
        itinerar({
          itinerary: [dan({ attractions: [], note: 'Nema dovoljno vremena za aktivnosti' })]
        })
      );

      expect(el.textContent).toContain('Day-by-day plan');
      expect(el.textContent).toContain('Cost breakdown');
      expect(el.textContent).toContain('There is not enough time for activities');
      expect(el.textContent).not.toContain('Plan po danima');
    });
  });
});
