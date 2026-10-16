import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ProfileComponent } from './profile';
import { AuthService } from '../../core/services/auth.service';

const PROFIL = {
  _id: '1',
  ime: 'Demo',
  prezime: 'Korisnik',
  email: 'demo@voyra.local',
  korisnickoIme: 'demo',
  uloga: 'korisnik',
  status: 'odobren',
  phone: null
};

/**
 * Provera 9: forma za promenu lozinke — pravila, potvrda i
 * prikaz vremena čekanja pri 429.
 */
describe('ProfileComponent — promena lozinke (§4.10)', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let k: ProfileComponent;
  let http: HttpTestingController;

  const popuni = (izmene: Record<string, string> = {}): void => {
    k.formaLozinke.patchValue({
      trenutnaLozinka: 'VoyraDemo1!',
      novaLozinka: 'NovaLoz123!',
      potvrda: 'NovaLoz123!',
      ...izmene
    });
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });

    fixture = TestBed.createComponent(ProfileComponent);
    k = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    fixture.detectChanges();

    // Profil se učitava u konstruktoru
    http
      .match((z) => z.url === '/api/users/me')
      .forEach((z) => z.flush({ success: true, data: PROFIL }));

    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    http.verify();
  });

  it('ne salje slabu novu lozinku', () => {
    popuni({ novaLozinka: 'slaba', potvrda: 'slaba' });
    k.promeniLozinku();

    http.expectNone((z) => z.url === '/api/users/me/password');
    expect(k.formaLozinke.controls.novaLozinka.hasError('lozinka')).toBeTrue();
  });

  it('trazi da se potvrda poklapa', () => {
    popuni({ potvrda: 'DrugaLoz123!' });
    k.promeniLozinku();

    http.expectNone((z) => z.url === '/api/users/me/password');
    expect(k.lozinkeSeNePoklapaju()).toBeTrue();
  });

  it('trazi trenutnu lozinku', () => {
    popuni({ trenutnaLozinka: '' });
    k.promeniLozinku();

    http.expectNone((z) => z.url === '/api/users/me/password');
    expect(k.formaLozinke.controls.trenutnaLozinka.hasError('required')).toBeTrue();
  });

  it('salje ispravnu promenu i zamenjuje token', () => {
    const auth = TestBed.inject(AuthService);
    const zameni = spyOn(auth, 'zameniToken');

    popuni();
    k.promeniLozinku();

    const zahtev = http.expectOne((z) => z.url === '/api/users/me/password');

    expect(zahtev.request.method).toBe('PUT');
    expect(zahtev.request.body).toEqual({
      trenutnaLozinka: 'VoyraDemo1!',
      novaLozinka: 'NovaLoz123!'
    });

    zahtev.flush({ success: true, message: 'Lozinka je promenjena.', token: 'nov.token.ovde' });

    expect(zameni).toHaveBeenCalledWith('nov.token.ovde');
    // Forma se prazni, da lozinka ne ostane u DOM-u
    expect(k.formaLozinke.getRawValue().novaLozinka).toBe('');
  });

  it('prikazuje gresku servera kada trenutna lozinka nije tacna', () => {
    popuni();
    k.promeniLozinku();

    http.expectOne((z) => z.url === '/api/users/me/password').flush(
      {
        success: false,
        error: 'WRONG_PASSWORD',
        message: 'Trenutna lozinka nije tacna',
        statusCode: 400
      },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(k.greskaLozinke()).toBe('Trenutna lozinka nije tacna');
    expect(k.cekanjeSek()).toBe(0);
  });

  it('prikazuje vreme cekanja pri 429', () => {
    popuni();
    k.promeniLozinku();

    http.expectOne((z) => z.url === '/api/users/me/password').flush(
      {
        success: false,
        error: 'RATE_LIMIT',
        message: 'Previse pogresnih pokusaja',
        retryAfter: 540,
        statusCode: 429
      },
      { status: 429, statusText: 'Too Many Requests' }
    );

    expect(k.cekanjeSek()).toBe(540);
    expect(k.opisCekanja()).toBe('9 minuta');

    fixture.detectChanges();

    const tekst = fixture.nativeElement.textContent as string;
    expect(tekst).toContain('Pokušajte ponovo za 9 minuta');
  });

  it('prenosi listu gresaka validacije sa servera', () => {
    popuni();
    k.promeniLozinku();

    http.expectOne((z) => z.url === '/api/users/me/password').flush(
      {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Neispravni podaci',
        errors: ['Nova lozinka mora imati najmanje 8 karaktera'],
        statusCode: 400
      },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(k.greskeLozinke()).toEqual(['Nova lozinka mora imati najmanje 8 karaktera']);
  });
});
