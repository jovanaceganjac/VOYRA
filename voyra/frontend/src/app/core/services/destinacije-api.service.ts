import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

import { IstaknutaDestinacija, PopularnaDestinacija } from '../models/sadrzaj.model';

interface Lista<T> {
  success: boolean;
  data: T[];
  count: number;
}

/**
 * Destinacije za početnu stranu (spec §4.1).
 *
 * Obe liste smeju da budu prazne — početna tada ne prikazuje sekciju.
 * Greška se svodi na praznu listu: početna strana ne sme da se sruši
 * zato što jedan servis ne odgovara.
 */
@Injectable({ providedIn: 'root' })
export class DestinacijeApiService {
  private readonly http = inject(HttpClient);

  private istaknuteZahtev?: Observable<IstaknutaDestinacija[]>;
  private popularneZahtev?: Observable<PopularnaDestinacija[]>;

  /** Istaknute destinacije, redosledom koji je odredio administrator. */
  istaknute(): Observable<IstaknutaDestinacija[]> {
    if (!this.istaknuteZahtev) {
      this.istaknuteZahtev = this.http
        .get<Lista<IstaknutaDestinacija>>('/v1/destinations/featured')
        .pipe(
          map((o) => o.data ?? []),
          catchError(() => of([] as IstaknutaDestinacija[])),
          shareReplay(1)
        );
    }

    return this.istaknuteZahtev;
  }

  /** Popularno poslednjih 30 dana. */
  popularne(limit = 8): Observable<PopularnaDestinacija[]> {
    if (!this.popularneZahtev) {
      const params = new HttpParams().set('limit', String(limit));

      this.popularneZahtev = this.http
        .get<Lista<PopularnaDestinacija>>('/v1/destinations/popular', { params })
        .pipe(
          map((o) => o.data ?? []),
          catchError(() => of([] as PopularnaDestinacija[])),
          shareReplay(1)
        );
    }

    return this.popularneZahtev;
  }
}
