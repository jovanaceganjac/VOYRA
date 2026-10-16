import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminAtrakcijeComponent } from './atrakcije';
import { Grad } from '../../../core/models/grad.model';
import { Kategorija } from '../../../core/models/sadrzaj.model';

const ATINA = {
  id: '264371',
  naziv: 'Atina',
  nazivLokalni: 'Athina',
  nazivEn: 'Athens',
  drzava: 'GR',
  drzavaNaziv: 'Grčka',
  lat: 37.98376,
  lon: 23.72784,
  stanovnika: 664046,
  aerodrom: null,
  aerodromi: [],
  iataGrada: null,
  bezAerodroma: false,
  bezLeta: false
} as Grad;

const KATEGORIJE: Kategorija[] = [
  {
    kljuc: 'kultura',
    naziv: 'Kultura',
    opis: '',
    eksterneKategorije: ['cultural'],
    geoapifyKategorije: ['tourism.sights'],
    trajanjePoseteMin: 60,
    radnoVreme: { open: '09:00', close: '18:00' },
    redosled: 1,
    aktivna: true
  }
];

describe('AdminAtrakcijeComponent (forma, §4.5)', () => {
  let fixture: ComponentFixture<AdminAtrakcijeComponent>;
  let k: AdminAtrakcijeComponent;
  let http: HttpTestingController;

  /** Ispravno popunjena forma - pojedinacni testovi kvare po jedno polje. */
  const popuni = (izmene: Record<string, unknown> = {}): void => {
    k.forma.patchValue({
      naziv: 'Probna atrakcija',
      lat: ATINA.lat + 0.01,
      lon: ATINA.lon + 0.01,
      trajanjeMin: 60,
      otvara: '',
      zatvara: '',
      slikaUrl: '',
      slikaCredit: '',
      ...izmene
    });

    if (k.izabraneKategorije().length === 0) k.prebaci('kultura');
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminAtrakcijeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    fixture = TestBed.createComponent(AdminAtrakcijeComponent);
    k = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    fixture.detectChanges();

    // Kategorije se ucitavaju u konstruktoru
    http
      .expectOne((z) => z.url === '/api/admin/categories')
      .flush({ success: true, data: KATEGORIJE, count: 1 });

    // Grad se bira kroz pretragu; ovde se postavlja direktno
    k.grad.set(ATINA);
    k.izabraniGrad.set(ATINA);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('racuna udaljenost od centra grada', () => {
    popuni();

    // 0.01 stepen po obe ose je oko 1,4 km na sirini Atine
    expect(k.udaljenost()).toBeGreaterThan(0.5);
    expect(k.udaljenost()).toBeLessThan(3);
  });

  it('„Preuzmi koordinate centra grada" popunjava polja', () => {
    k.centarGrada();

    expect(k.forma.getRawValue().lat).toBe(ATINA.lat);
    expect(k.forma.getRawValue().lon).toBe(ATINA.lon);
    expect(k.udaljenost()).toBe(0);
  });

  it('odbija koordinate dalje od 50 km', () => {
    // Pariz
    popuni({ lat: 48.85, lon: 2.35 });
    k.sacuvaj();

    http.expectNone((z) => z.method === 'POST');
    expect(k.greskaForme()).toContain('km od centra grada');
  });

  it('trazi bar jednu kategoriju', () => {
    popuni();
    k.prebaci('kultura');

    k.sacuvaj();

    http.expectNone((z) => z.method === 'POST');
    expect(k.greskaForme()).toBe('Izaberite bar jednu kategoriju.');
  });

  it('odbija trajanje van opsega 15-600', () => {
    popuni({ trajanjeMin: 5 });
    k.sacuvaj();

    http.expectNone((z) => z.method === 'POST');
    expect(k.greskaForme()).toBe('Popunite obavezna polja ispravno.');
  });

  it('trazi i pocetak i kraj radnog vremena, ili nijedno', () => {
    popuni({ otvara: '10:00' });
    k.sacuvaj();

    http.expectNone((z) => z.method === 'POST');
    expect(k.greskaForme()).toContain('i vreme otvaranja i vreme zatvaranja');
  });

  it('odbija isto vreme otvaranja i zatvaranja', () => {
    popuni({ otvara: '10:00', zatvara: '10:00' });
    k.sacuvaj();

    http.expectNone((z) => z.method === 'POST');
    expect(k.greskaForme()).toContain('ne smeju biti isti');
  });

  it('trazi potpis uz sliku', () => {
    popuni({ slikaUrl: 'https://primer.test/slika.jpg' });
    k.sacuvaj();

    http.expectNone((z) => z.method === 'POST');
    expect(k.greskaForme()).toBe('Uz sliku je obavezan potpis izvora.');
  });

  it('salje ispravnu atrakciju sa gradom i kategorijama', () => {
    popuni({ otvara: '10:00', zatvara: '18:00' });
    k.sacuvaj();

    const zahtev = http.expectOne((z) => z.method === 'POST' && z.url === '/api/admin/attractions');

    expect(zahtev.request.body.gradId).toBe(ATINA.id);
    expect(zahtev.request.body.kategorije).toEqual(['kultura']);
    expect(zahtev.request.body.radnoVreme).toEqual({ open: '10:00', close: '18:00' });
    expect(k.greskaForme()).toBeNull();

    zahtev.flush({ success: true, data: { id: 'a1' } });

    // Posle cuvanja se lista osvezava
    http.expectOne((z) => z.url === '/api/admin/attractions' && z.method === 'GET').flush({
      success: true,
      data: [],
      count: 0
    });
  });

  it('prikazuje listu gresaka koju server posalje', () => {
    popuni();
    k.sacuvaj();

    http.expectOne((z) => z.method === 'POST').flush(
      { success: false, error: 'VALIDATION_ERROR', message: 'Nije ispravno', errors: ['naziv je obavezan'] },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(k.greskeServera()).toEqual(['naziv je obavezan']);
  });
});
