import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { OdgovorPrijave, Uloga } from '../models/user.model';

const KLJUC_TOKEN = 'voyra_token';
const KLJUC_KORISNIK = 'voyra_korisnik';

/** Pravi JWT istog oblika kao user-service, sa zadatim istekom. */
const napraviToken = (opcije: { uloga?: Uloga; istekZaSekundi?: number } = {}): string => {
  const sadrzaj = {
    id: '6ab287303e940b70a30080e3',
    korisnickoIme: 'marko123',
    email: 'marko@test.com',
    uloga: opcije.uloga ?? 'korisnik',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (opcije.istekZaSekundi ?? 3600)
  };

  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(sadrzaj)}.potpis`;
};

const ODGOVOR_PRIJAVE: OdgovorPrijave = {
  success: true,
  token: napraviToken(),
  user: {
    id: '6ab287303e940b70a30080e3',
    ime: 'Marko',
    prezime: 'Markovic',
    korisnickoIme: 'marko123',
    uloga: 'korisnik',
    status: 'odobren'
  }
};

describe('AuthService', () => {
  let http: HttpTestingController;

  const napravi = (): AuthService => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('pocinje neprijavljen kada nema tokena', () => {
    const s = napravi();

    expect(s.isLoggedIn()).toBeFalse();
    expect(s.currentUser()).toBeNull();
  });

  it('cuva token i korisnika posle uspesne prijave', () => {
    const s = napravi();

    s.login({ korisnickoIme: 'marko123', lozinka: 'SecurePass123!' }).subscribe();

    const zahtev = http.expectOne('/api/users/login');
    expect(zahtev.request.method).toBe('POST');
    zahtev.flush(ODGOVOR_PRIJAVE);

    expect(localStorage.getItem(KLJUC_TOKEN)).toBe(ODGOVOR_PRIJAVE.token);
    expect(s.isLoggedIn()).toBeTrue();
    expect(s.currentUser()?.korisnickoIme).toBe('marko123');
    expect(s.isAdmin()).toBeFalse();
  });

  it('isAdmin je tacno samo za ulogu admin', () => {
    const s = napravi();

    s.login({ korisnickoIme: 'admin', lozinka: 'AdminPassword123!' }).subscribe();

    http.expectOne('/api/users/login').flush({
      ...ODGOVOR_PRIJAVE,
      token: napraviToken({ uloga: 'admin' }),
      user: { ...ODGOVOR_PRIJAVE.user, korisnickoIme: 'admin', uloga: 'admin' as Uloga }
    });

    expect(s.isAdmin()).toBeTrue();
  });

  it('obnavlja sesiju iz localStorage-a pri pokretanju', () => {
    localStorage.setItem(KLJUC_TOKEN, napraviToken());
    localStorage.setItem(KLJUC_KORISNIK, JSON.stringify(ODGOVOR_PRIJAVE.user));

    const s = napravi();

    expect(s.isLoggedIn()).toBeTrue();
    expect(s.currentUser()?.ime).toBe('Marko');
  });

  it('brise istekao token pri pokretanju, bez poziva servera', () => {
    localStorage.setItem(KLJUC_TOKEN, napraviToken({ istekZaSekundi: -60 }));
    localStorage.setItem(KLJUC_KORISNIK, JSON.stringify(ODGOVOR_PRIJAVE.user));

    const s = napravi();

    expect(s.isLoggedIn()).toBeFalse();
    expect(localStorage.getItem(KLJUC_TOKEN)).toBeNull();
    http.verify(); // nijedan HTTP zahtev nije poslat
  });

  it('brise pokvaren token pri pokretanju', () => {
    localStorage.setItem(KLJUC_TOKEN, 'ovo-nije-jwt');

    const s = napravi();

    expect(s.isLoggedIn()).toBeFalse();
    expect(localStorage.getItem(KLJUC_TOKEN)).toBeNull();
  });

  it('rekonstruise korisnika iz tokena kada zapis o korisniku fali', () => {
    localStorage.setItem(KLJUC_TOKEN, napraviToken({ uloga: 'admin' }));

    const s = napravi();

    expect(s.isLoggedIn()).toBeTrue();
    expect(s.currentUser()?.korisnickoIme).toBe('marko123');
    expect(s.isAdmin()).toBeTrue();
  });

  it('logout brise token i korisnika', () => {
    localStorage.setItem(KLJUC_TOKEN, napraviToken());
    localStorage.setItem(KLJUC_KORISNIK, JSON.stringify(ODGOVOR_PRIJAVE.user));

    const s = napravi();
    s.logout();

    expect(s.isLoggedIn()).toBeFalse();
    expect(localStorage.getItem(KLJUC_TOKEN)).toBeNull();
    expect(localStorage.getItem(KLJUC_KORISNIK)).toBeNull();
  });

  it('registracija ne cuva token (nalog ceka odobrenje)', () => {
    const s = napravi();

    s.register({
      ime: 'Test',
      prezime: 'Testic',
      email: 'test@voyra.local',
      korisnickoIme: 'test_novi',
      lozinka: 'SecurePass123!',
      lozinkaConfirm: 'SecurePass123!'
    }).subscribe();

    http.expectOne('/api/users/register').flush({
      success: true,
      message: 'Korisnik je registrovan',
      userId: 'abc',
      phone: null
    });

    expect(s.isLoggedIn()).toBeFalse();
    expect(localStorage.getItem(KLJUC_TOKEN)).toBeNull();
  });

  it('refreshProfile dopunjuje korisnika email-om i telefonom', () => {
    localStorage.setItem(KLJUC_TOKEN, napraviToken());
    localStorage.setItem(KLJUC_KORISNIK, JSON.stringify(ODGOVOR_PRIJAVE.user));

    const s = napravi();
    s.refreshProfile().subscribe();

    http.expectOne('/api/users/me').flush({
      success: true,
      data: {
        _id: '6ab287303e940b70a30080e3',
        ime: 'Marko',
        prezime: 'Markovic',
        email: 'marko@test.com',
        korisnickoIme: 'marko123',
        uloga: 'korisnik',
        status: 'odobren',
        phone: { number: '+381601234567', smsOptIn: true }
      },
      statusCode: 200
    });

    expect(s.currentUser()?.email).toBe('marko@test.com');
    expect(s.currentUser()?.phone?.smsOptIn).toBeTrue();
  });
});
