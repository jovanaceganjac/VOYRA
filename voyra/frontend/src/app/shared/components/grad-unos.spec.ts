import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { GradUnosComponent } from './grad-unos';
import { Grad } from '../../core/models/grad.model';

const grad = (izmene: Partial<Grad>): Grad =>
  ({
    id: '1',
    naziv: 'Grad',
    nazivLokalni: 'Grad',
    nazivEn: 'City',
    drzava: 'DE',
    drzavaNaziv: 'Nemačka',
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

const MINHEN = grad({
  id: '2867714',
  naziv: 'Minhen',
  stanovnika: 1260391,
  aerodrom: { iata: 'MUC', naziv: 'München Airport', udaljenostKm: 28.6 },
  aerodromi: [{ iata: 'MUC', naziv: 'München Airport', udaljenostKm: 28.6 }]
});

const MINHENSTAJN = grad({
  id: '2661513',
  naziv: 'Münchenstein',
  drzava: 'CH',
  drzavaNaziv: 'Švajcarska',
  stanovnika: 11851,
  aerodrom: { iata: 'BSL', naziv: 'EuroAirport', udaljenostKm: 12.4 },
  aerodromi: [{ iata: 'BSL', naziv: 'EuroAirport', udaljenostKm: 12.4 }]
});

const BLED = grad({
  id: '3203925',
  naziv: 'Bled',
  drzava: 'SI',
  drzavaNaziv: 'Slovenija',
  stanovnika: 5181,
  aerodrom: { iata: 'LJU', naziv: 'Ljubljana', udaljenostKm: 30.8 },
  aerodromi: [{ iata: 'LJU', naziv: 'Ljubljana', udaljenostKm: 30.8 }],
  bezAerodroma: true
});

describe('GradUnosComponent (ARIA combobox, §4.2)', () => {
  let fixture: ComponentFixture<GradUnosComponent>;
  let komponenta: GradUnosComponent;
  let http: HttpTestingController;

  /** Polje za unos u iscrtanoj komponenti. */
  const polje = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('input[role="combobox"]');

  const stavke = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="option"]'));

  /** Kucanje: postavlja vrednost i pušta `input` dogadjaj, kao korisnik. */
  const upisi = (tekst: string): void => {
    const p = polje();
    p.value = tekst;
    p.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const taster = (key: string): void => {
    polje().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  };

  /** Odgovor servera za jedan upit. */
  const odgovori = (upit: string, gradovi: Grad[]): void => {
    const zahtevi = http.match((z) => z.url === '/v1/cities' && z.params.get('q') === upit);

    expect(zahtevi.length).toBe(1);
    zahtevi[0].flush({ success: true, data: gradovi, count: gradovi.length });

    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GradUnosComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    fixture = TestBed.createComponent(GradUnosComponent);
    komponenta = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    fixture.componentRef.setInput('idPolja', 'grad-test');
    fixture.componentRef.setInput('oznaka', 'Odredište');

    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  // ---------------------------------------------------------------
  // Provera 11: tastatura, ARIA i odlaganje poziva
  // ---------------------------------------------------------------

  it('ne poziva server za manje od dva znaka', fakeAsync(() => {
    upisi('m');
    tick(500);

    http.expectNone((z) => z.url === '/v1/cities');
    expect(polje().getAttribute('aria-expanded')).toBe('false');
  }));

  it('salje JEDAN poziv za niz pritisaka (odlaganje 200 ms)', fakeAsync(() => {
    upisi('mi');
    tick(80);
    upisi('min');
    tick(80);
    upisi('minh');

    // Pre isteka odlaganja nema nijednog poziva
    http.expectNone((z) => z.url === '/v1/cities');

    tick(200);
    odgovori('minh', [MINHEN]);

    expect(komponenta.predlozi().length).toBe(1);
  }));

  it('novi upit odbacuje odgovor prethodnog (switchMap)', fakeAsync(() => {
    upisi('be');
    tick(200);

    const prvi = http.expectOne((z) => z.url === '/v1/cities' && z.params.get('q') === 'be');

    upisi('beog');
    tick(200);

    // Zakasneli odgovor na „be" ne sme da prekrije rezultat za „beog"
    prvi.flush({ success: true, data: [MINHENSTAJN], count: 1 });
    odgovori('beog', [MINHEN]);

    expect(komponenta.predlozi().map((g) => g.id)).toEqual([MINHEN.id]);
  }));

  it('nosi ARIA obrazac: combobox, listbox, option i aria-activedescendant', fakeAsync(() => {
    const p = polje();

    expect(p.getAttribute('role')).toBe('combobox');
    expect(p.getAttribute('aria-autocomplete')).toBe('list');
    expect(p.getAttribute('aria-expanded')).toBe('false');
    expect(p.getAttribute('aria-activedescendant')).toBeNull();

    upisi('minh');
    tick(200);
    odgovori('minh', [MINHEN, MINHENSTAJN]);

    expect(p.getAttribute('aria-expanded')).toBe('true');

    const lista = fixture.nativeElement.querySelector('[role="listbox"]');
    expect(lista.id).toBe(p.getAttribute('aria-controls'));

    // Prvi predlog je aktivan odmah, da Enter ima sta da izabere
    expect(p.getAttribute('aria-activedescendant')).toBe(stavke()[0].id);
    expect(stavke()[0].getAttribute('aria-selected')).toBe('true');
    expect(stavke()[1].getAttribute('aria-selected')).toBe('false');
  }));

  it('strelice menjaju aktivan predlog, Enter ga bira', fakeAsync(() => {
    upisi('minh');
    tick(200);
    odgovori('minh', [MINHEN, MINHENSTAJN]);

    taster('ArrowDown');
    expect(komponenta.aktivni()).toBe(1);
    expect(polje().getAttribute('aria-activedescendant')).toBe(stavke()[1].id);

    taster('ArrowUp');
    expect(komponenta.aktivni()).toBe(0);

    taster('Enter');

    expect(komponenta.izabran()?.id).toBe(MINHEN.id);
    expect(polje().value).toBe('Minhen, Nemačka');
    expect(polje().getAttribute('aria-expanded')).toBe('false');
  }));

  it('strelica gore sa prvog predloga ide na zadnji', fakeAsync(() => {
    upisi('minh');
    tick(200);
    odgovori('minh', [MINHEN, MINHENSTAJN]);

    taster('ArrowUp');

    expect(komponenta.aktivni()).toBe(1);
  }));

  it('Esc zatvara listu, drugi Esc prazni polje', fakeAsync(() => {
    upisi('minh');
    tick(200);
    odgovori('minh', [MINHEN]);

    taster('Escape');

    expect(komponenta.otvoreno()).toBeFalse();
    expect(polje().value).toBe('minh');

    taster('Escape');

    expect(polje().value).toBe('');
    expect(komponenta.izabran()).toBeNull();
  }));

  it('kucanje posle izbora ponistava izabran grad', fakeAsync(() => {
    upisi('minh');
    tick(200);
    odgovori('minh', [MINHEN]);
    taster('Enter');

    expect(komponenta.izabran()).not.toBeNull();

    upisi('minhe');
    tick(200);
    odgovori('minhe', [MINHEN]);

    // Vrednost ne sme da zaostane za tekstom u polju
    expect(komponenta.izabran()).toBeNull();
  }));

  it('predlog pise grad, drzavu i aerodrom sa udaljenoscu', fakeAsync(() => {
    upisi('minh');
    tick(200);
    odgovori('minh', [MINHEN]);

    //   oko razdvojnika drži „· MUC 29 km" u jednom redu
    const tekst = stavke()[0].textContent?.replace(/ /g, ' ').trim();

    expect(tekst).toBe('Minhen, Nemačka · MUC 29 km');
  }));

  it('grad bez sopstvenog aerodroma to izricito kaze', fakeAsync(() => {
    upisi('bled');
    tick(200);
    odgovori('bled', [BLED]);

    expect(stavke()[0].textContent).toContain('najbliži aerodrom LJU, 31 km');

    taster('Enter');

    // Posle izbora stoji napomena o transferu (§2.4)
    expect(fixture.nativeElement.textContent).toContain('uračunat u prvi i poslednji dan');
  }));

  it('grad postavljen izvan komponente upisuje se u polje', () => {
    fixture.componentRef.setInput('izabran', BLED);
    fixture.detectChanges();

    expect(polje().value).toBe('Bled, Slovenija');
  });
});
