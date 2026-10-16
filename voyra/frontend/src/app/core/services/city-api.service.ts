import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';

import { Grad } from '../models/grad.model';

/** Ispod ovoliko znakova se ne traži — tako kaže i server. */
export const MIN_ZNAKOVA = 2;

interface OdgovorListe {
  success: boolean;
  data: Grad[];
  count: number;
}

interface OdgovorGrada {
  success: boolean;
  data: Grad;
}

/**
 * Pretraga gradova (spec §4.2).
 *
 * Ide na `/v1/cities`, koji traži nad sopstvenom bazom — Nominatim se za
 * pretragu dok korisnik kuca NE koristi, to njihova pravila korišćenja
 * izričito zabranjuju.
 *
 * Odgovori se pamte u memoriji: korisnik briše slova i vraća se na isti
 * prefiks, a lista gradova se menja samo pri uvozu podataka.
 */
@Injectable({ providedIn: 'root' })
export class CityApiService {
  private readonly http = inject(HttpClient);

  private readonly kesPretrage = new Map<string, Observable<Grad[]>>();
  private readonly kesGradova = new Map<string, Grad>();

  /**
   * @returns predlozi, ili prazna lista kada je upit prekratak ili poziv
   *   padne — polje za unos ne treba da se sruši zbog pretrage
   */
  pretrazi(upit: string, limit = 8): Observable<Grad[]> {
    const q = upit.trim();

    if (q.length < MIN_ZNAKOVA) return of([]);

    const kljuc = `${q.toLowerCase()}|${limit}`;
    const zapamceno = this.kesPretrage.get(kljuc);

    if (zapamceno) return zapamceno;

    const params = new HttpParams().set('q', q).set('limit', String(limit));

    const tok = this.http.get<OdgovorListe>('/v1/cities', { params }).pipe(
      map((o) => o.data ?? []),
      tap((gradovi) => gradovi.forEach((g) => this.kesGradova.set(g.id, g))),
      catchError(() => of([] as Grad[])),
      // `shareReplay` da paralelni pozivi za isti prefiks ne idu dvaput
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.kesPretrage.set(kljuc, tok);

    return tok;
  }

  /** Jedan grad po identifikatoru (iz URL-a ili sačuvanog stanja). */
  jedan(id: string): Observable<Grad | null> {
    const zapamcen = this.kesGradova.get(String(id));

    if (zapamcen) return of(zapamcen);

    return this.http.get<OdgovorGrada>(`/v1/cities/${encodeURIComponent(id)}`).pipe(
      map((o) => o.data ?? null),
      tap((g) => g && this.kesGradova.set(g.id, g)),
      catchError(() => of(null))
    );
  }

  /**
   * Grad kome pripada IATA kod.
   *
   * Služi starim adresama (`?from=BEG&to=ATH`) i sačuvanim putovanjima,
   * koja nose samo kod.
   */
  poIataKodu(kod: string): Observable<Grad | null> {
    const oznaka = String(kod || '').toUpperCase();

    if (!/^[A-Z]{3}$/.test(oznaka)) return of(null);

    return this.http
      .get<OdgovorGrada>(`/v1/cities/by-iata/${encodeURIComponent(oznaka)}`)
      .pipe(
        map((o) => o.data ?? null),
        tap((g) => g && this.kesGradova.set(g.id, g)),
        catchError(() => of(null))
      );
  }

  /** Grad iz `cityId` ako postoji, inače iz IATA koda — za URL i stanje. */
  razresi(cityId: string | null | undefined, iata: string | null | undefined) {
    if (cityId) return this.jedan(String(cityId));
    if (iata) return this.poIataKodu(String(iata));

    return of(null);
  }
}
