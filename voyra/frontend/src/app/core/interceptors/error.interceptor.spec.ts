import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { errorInterceptor } from './error.interceptor';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

const KLJUC_TOKEN = 'voyra_token';
const KLJUC_KORISNIK = 'voyra_korisnik';

/** Token sa rokom u budućnosti - AuthService ga ne odbacuje pri startu. */
const napraviToken = (): string => {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const sadrzaj = {
    id: 'abc',
    korisnickoIme: 'demo',
    email: 'demo@voyra.local',
    uloga: 'korisnik',
    tv: 0,
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(sadrzaj)}.potpis`;
};

const prijavi = (): void => {
  localStorage.setItem(KLJUC_TOKEN, napraviToken());
  localStorage.setItem(
    KLJUC_KORISNIK,
    JSON.stringify({ id: 'abc', korisnickoIme: 'demo', uloga: 'korisnik', status: 'odobren' })
  );
};

/**
 * Provera 10: `TOKEN_REVOKED` odjavljuje korisnika, sa
 * porukom koja kaže da je nalog promenjen - a ne samo „sesija je
 * istekla", što ne bi objasnilo zašto se dogodilo posle par minuta.
 */
describe('errorInterceptor — opoziv tokena', () => {
  let http: HttpClient;
  let kontroler: HttpTestingController;
  let auth: AuthService;
  let toast: ToastService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    prijavi();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });

    http = TestBed.inject(HttpClient);
    kontroler = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    toast = TestBed.inject(ToastService);
    router = TestBed.inject(Router);

    spyOn(router, 'navigate');
  });

  afterEach(() => {
    localStorage.clear();
    kontroler.verify();
  });

  /** Šalje zahtev i odgovara zadatom greškom. */
  const posalji = (telo: Record<string, unknown>, status = 401): void => {
    http.get('/api/users/me').subscribe({ next: () => {}, error: () => {} });

    kontroler.expectOne('/api/users/me').flush(telo, { status, statusText: 'Unauthorized' });
  };

  it('odjavljuje korisnika i kaze da je nalog promenjen', () => {
    const info = spyOn(toast, 'info');

    expect(auth.isLoggedIn()).toBeTrue();

    posalji({
      success: false,
      error: 'TOKEN_REVOKED',
      message: 'Sesija je istekla ili je nalog promenjen. Prijavite se ponovo.',
      statusCode: 401
    });

    expect(auth.isLoggedIn()).toBeFalse();
    expect(localStorage.getItem(KLJUC_TOKEN)).toBeNull();

    expect(info).toHaveBeenCalledWith(
      'Sesija je istekla ili je nalog promenjen. Prijavite se ponovo.'
    );

    expect(router.navigate).toHaveBeenCalled();
  });

  it('obican 401 zadrzava staru poruku o isteklo sesiji', () => {
    const info = spyOn(toast, 'info');

    posalji({ success: false, error: 'UNAUTHORIZED', message: 'Nevazeci token', statusCode: 401 });

    expect(auth.isLoggedIn()).toBeFalse();
    expect(info).toHaveBeenCalledWith('Sesija je istekla. Prijavite se ponovo.');
  });

  it('503 sa gateway-a ne odjavljuje korisnika', () => {
    const greska = spyOn(toast, 'greska');

    posalji(
      {
        success: false,
        error: 'AUTH_UNAVAILABLE',
        message: 'Provera naloga trenutno nije moguca.',
        statusCode: 503
      },
      503
    );

    // Pad servisa ne sme da izbaci korisnika iz aplikacije
    expect(auth.isLoggedIn()).toBeTrue();
    expect(greska).toHaveBeenCalled();
  });
});
