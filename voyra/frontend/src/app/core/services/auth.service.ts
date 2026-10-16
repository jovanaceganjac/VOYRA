import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import {
  JwtSadrzaj,
  OdgovorPrijave,
  OdgovorRegistracije,
  ProfilKorisnika,
  PrijavljeniKorisnik,
  ZahtevPrijave,
  ZahtevRegistracije
} from '../models/user.model';
import { ApiOdgovor } from '../models/api.model';

const KLJUC_TOKEN = 'voyra_token';
const KLJUC_KORISNIK = 'voyra_korisnik';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _korisnik = signal<PrijavljeniKorisnik | null>(null);
  readonly currentUser = this._korisnik.asReadonly();

  readonly isLoggedIn = computed(() => this._korisnik() !== null);
  readonly isAdmin = computed(() => this._korisnik()?.uloga === 'admin');

  constructor() {
    this.ucitajIzMemorije();
  }

  // ---------------------------------------------------------------
  // Token
  // ---------------------------------------------------------------

  get token(): string | null {
    return localStorage.getItem(KLJUC_TOKEN);
  }

  /** Dekodira JWT payload bez provere potpisa - potpis proverava backend. */
  private dekodiraj(token: string): JwtSadrzaj | null {
    try {
      const deo = token.split('.')[1];
      if (!deo) return null;

      const json = atob(deo.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(escape(json))) as JwtSadrzaj;
    } catch {
      return null;
    }
  }

  private jeIstekao(token: string): boolean {
    const sadrzaj = this.dekodiraj(token);
    if (!sadrzaj?.exp) return true;

    return sadrzaj.exp * 1000 <= Date.now();
  }

  /**
   * Pri pokretanju: istekao ili neispravan token se brise lokalno,
   * bez poziva servera.
   */
  private ucitajIzMemorije(): void {
    const token = this.token;
    if (!token) return;

    if (this.jeIstekao(token)) {
      this.ocisti();
      return;
    }

    const sacuvan = localStorage.getItem(KLJUC_KORISNIK);

    if (sacuvan) {
      try {
        this._korisnik.set(JSON.parse(sacuvan) as PrijavljeniKorisnik);
        return;
      } catch {
        /* pokvaren zapis - pada na rekonstrukciju iz tokena */
      }
    }

    const sadrzaj = this.dekodiraj(token);

    if (sadrzaj) {
      this._korisnik.set({
        id: sadrzaj.id,
        ime: '',
        prezime: '',
        korisnickoIme: sadrzaj.korisnickoIme,
        uloga: sadrzaj.uloga,
        status: 'odobren',
        email: sadrzaj.email
      });
    }
  }

  private sacuvaj(token: string, korisnik: PrijavljeniKorisnik): void {
    localStorage.setItem(KLJUC_TOKEN, token);
    localStorage.setItem(KLJUC_KORISNIK, JSON.stringify(korisnik));
    this._korisnik.set(korisnik);
  }

  private ocisti(): void {
    localStorage.removeItem(KLJUC_TOKEN);
    localStorage.removeItem(KLJUC_KORISNIK);
    this._korisnik.set(null);
  }

  // ---------------------------------------------------------------
  // Operacije
  // ---------------------------------------------------------------

  login(podaci: ZahtevPrijave): Observable<OdgovorPrijave> {
    return this.http
      .post<OdgovorPrijave>('/api/users/login', podaci)
      .pipe(tap((o) => this.sacuvaj(o.token, o.user)));
  }

  register(podaci: ZahtevRegistracije): Observable<OdgovorRegistracije> {
    return this.http.post<OdgovorRegistracije>('/api/users/register', podaci);
  }

  logout(): void {
    this.ocisti();
  }

  /**
   * Zamenjuje token posle promene lozinke.
   *
   * Promena poništava sve ranije tokene, pa server odmah izdaje nov za
   * ovu sesiju — bez ovoga bi korisnik bio odjavljen baš tamo gde je
   * upravo uneo novu lozinku. Korisnik ostaje isti.
   */
  zameniToken(token: string): void {
    const korisnik = this._korisnik();

    if (!korisnik) return;

    this.sacuvaj(token, korisnik);
  }

  /** Dopunjuje korisnika podacima kojih nema u odgovoru prijave (email, telefon). */
  refreshProfile(): Observable<ApiOdgovor<ProfilKorisnika>> {
    return this.http.get<ApiOdgovor<ProfilKorisnika>>('/api/users/me').pipe(
      tap((o) => {
        const p = o.data;

        const korisnik: PrijavljeniKorisnik = {
          id: p._id,
          ime: p.ime,
          prezime: p.prezime,
          korisnickoIme: p.korisnickoIme,
          uloga: p.uloga,
          status: p.status,
          email: p.email,
          phone: p.phone
        };

        this._korisnik.set(korisnik);
        localStorage.setItem(KLJUC_KORISNIK, JSON.stringify(korisnik));
      })
    );
  }
}
