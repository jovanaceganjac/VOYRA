import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter
} from '@angular/router';

import { adminGuard } from './admin.guard';
import { routes } from '../../app.routes';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';
import { AuthService } from '../services/auth.service';
import { Uloga } from '../models/user.model';

const KLJUC_TOKEN = 'voyra_token';
const KLJUC_KORISNIK = 'voyra_korisnik';

const napraviToken = (uloga: Uloga): string => {
  const sadrzaj = {
    id: 'abc',
    korisnickoIme: uloga === 'admin' ? 'admin' : 'marko123',
    email: 'x@voyra.local',
    uloga,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(sadrzaj)}.potpis`;
};

/** Prijavljuje korisnika pre nego sto se TestBed napravi. */
const prijavi = (uloga: Uloga): void => {
  localStorage.setItem(KLJUC_TOKEN, napraviToken(uloga));
  localStorage.setItem(
    KLJUC_KORISNIK,
    JSON.stringify({
      id: 'abc',
      ime: 'Test',
      prezime: 'Testic',
      korisnickoIme: uloga === 'admin' ? 'admin' : 'marko123',
      uloga,
      status: 'odobren'
    })
  );
};

const pripremi = (): void => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
  });
};

const stanje = (url: string): RouterStateSnapshot => ({ url }) as RouterStateSnapshot;
const ruta = {} as ActivatedRouteSnapshot;

const pokreni = (guard: typeof authGuard, url = '/profil') =>
  TestBed.runInInjectionContext(() => guard(ruta, stanje(url)));

describe('authGuard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('propusta prijavljenog korisnika', () => {
    prijavi('korisnik');
    pripremi();

    expect(pokreni(authGuard)).toBeTrue();
  });

  it('salje gosta na prijavu sa returnUrl', () => {
    pripremi();

    const rezultat = pokreni(authGuard, '/profil');
    const router = TestBed.inject(Router);

    expect(rezultat instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(rezultat as UrlTree)).toBe('/prijava?returnUrl=%2Fprofil');
  });
});

describe('adminGuard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('propusta administratora', () => {
    prijavi('admin');
    pripremi();

    expect(pokreni(adminGuard, '/admin')).toBeTrue();
  });

  it('vraca obicnog korisnika na pocetnu', () => {
    prijavi('korisnik');
    pripremi();

    const rezultat = pokreni(adminGuard, '/admin');
    const router = TestBed.inject(Router);

    expect(rezultat instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(rezultat as UrlTree)).toBe('/');
  });

  it('gosta salje na prijavu, ne na pocetnu', () => {
    pripremi();

    const rezultat = pokreni(adminGuard, '/admin');
    const router = TestBed.inject(Router);

    expect(router.serializeUrl(rezultat as UrlTree)).toBe('/prijava?returnUrl=%2Fadmin');
  });

  /*
   * panel je podeljen na odeljke, pa guard mora da stoji na
   * SVAKOM. Bez toga bi direktan ulazak u `/admin/korisnici` zaobisao
   * proveru - roditelj tada ne prolazi kroz navigaciju.
   */
  it('stoji na svakom odeljku admin panela (§10)', () => {
    const ODELJCI = [
      '',
      'zahtevi',
      'korisnici',
      'destinacije',
      'atrakcije',
      'kategorije',
      'statistika'
    ];

    const admin = routes.find((r) => r.path === 'admin');

    expect(admin).withContext('ruta /admin postoji').toBeDefined();
    expect(admin?.canActivate).withContext('roditelj je zasticen').toContain(adminGuard);

    const deca = admin?.children ?? [];

    expect(deca.length).withContext('svi odeljci su u rutama').toBe(ODELJCI.length);

    for (const putanja of ODELJCI) {
      const opis = putanja || '(pregled)';
      const dete = deca.find((r) => r.path === putanja);

      expect(dete).withContext(`odeljak ${opis} postoji`).toBeDefined();
      expect(dete?.canActivate).withContext(`odeljak ${opis} je zasticen`).toContain(adminGuard);
    }
  });
});

describe('guestGuard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('propusta gosta na prijavu', () => {
    pripremi();

    expect(pokreni(guestGuard, '/prijava')).toBeTrue();
  });

  it('prijavljenog korisnika vraca na pocetnu', () => {
    prijavi('korisnik');
    pripremi();

    const rezultat = pokreni(guestGuard, '/prijava');
    const router = TestBed.inject(Router);

    expect(rezultat instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(rezultat as UrlTree)).toBe('/');
  });
});

describe('AuthService - istek tokena i guard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('istekao token znaci da authGuard ne propusta', () => {
    const sadrzaj = {
      id: 'abc',
      korisnickoIme: 'marko123',
      email: 'x@voyra.local',
      uloga: 'korisnik',
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 60
    };

    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    localStorage.setItem(KLJUC_TOKEN, `${b64({ alg: 'HS256' })}.${b64(sadrzaj)}.potpis`);
    pripremi();

    expect(TestBed.inject(AuthService).isLoggedIn()).toBeFalse();
    expect(pokreni(authGuard) instanceof UrlTree).toBeTrue();
  });
});
