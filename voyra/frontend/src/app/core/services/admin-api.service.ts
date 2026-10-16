import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiOdgovor } from '../models/api.model';
import { AdminKorisnik, StatistikaSistema } from '../models/admin.model';
import {
  AdminAtrakcija,
  IstaknutaDestinacija,
  Kategorija,
  RevizioniZapis
} from '../models/sadrzaj.model';
import { StatusNaloga, Uloga } from '../models/user.model';

/** Odgovor sa listom - admin rute uz `data` vraćaju i `count`. */
type Lista<T> = ApiOdgovor<T[]> & { count: number };

/** `PATCH /users/:id/status` javlja i da li je obaveštenje otišlo. */
export type OdgovorStatusa = ApiOdgovor<AdminKorisnik> & {
  obavestenje?: string | null;
  obavesten?: boolean;
};

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);

  korisnici(): Observable<ApiOdgovor<AdminKorisnik[]> & { count: number }> {
    return this.http.get<ApiOdgovor<AdminKorisnik[]> & { count: number }>('/api/admin/users');
  }

  /**
   * @param razlog opcion; upisuje se u revizioni zapis i u e-poruku
   *   koju korisnik dobija o odluci (spec §3.3)
   */
  promeniStatus(
    userId: string,
    status: StatusNaloga,
    razlog?: string | null
  ): Observable<OdgovorStatusa> {
    return this.http.patch<OdgovorStatusa>(`/api/admin/users/${userId}/status`, {
      status,
      ...(razlog ? { reason: razlog } : {})
    });
  }

  promeniUlogu(userId: string, uloga: Uloga): Observable<ApiOdgovor<AdminKorisnik>> {
    return this.http.patch<ApiOdgovor<AdminKorisnik>>(`/api/admin/users/${userId}/role`, { uloga });
  }

  obrisiKorisnika(userId: string): Observable<ApiOdgovor<{ deletedId: string }>> {
    return this.http.delete<ApiOdgovor<{ deletedId: string }>>(`/api/admin/users/${userId}`);
  }

  statistika(): Observable<ApiOdgovor<StatistikaSistema>> {
    return this.http.get<ApiOdgovor<StatistikaSistema>>('/api/admin/stats');
  }

  /** Revizioni zapisi (§4.9) - filteri su opcioni. */
  zapisi(filteri: {
    action?: string;
    adminId?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}): Observable<Lista<RevizioniZapis>> {
    let params = new HttpParams();

    for (const [k, v] of Object.entries(filteri)) {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    }

    return this.http.get<Lista<RevizioniZapis>>('/api/admin/logs', { params });
  }

  // ---------------------------------------------------------------
  // Kategorije interesovanja (spec §3.3, §9)
  // ---------------------------------------------------------------

  kategorije(): Observable<Lista<Kategorija>> {
    return this.http.get<Lista<Kategorija>>('/api/admin/categories');
  }

  kategorija(kljuc: string): Observable<ApiOdgovor<Kategorija>> {
    return this.http.get<ApiOdgovor<Kategorija>>(`/api/admin/categories/${kljuc}`);
  }

  kreirajKategoriju(telo: Partial<Kategorija>): Observable<ApiOdgovor<Kategorija>> {
    return this.http.post<ApiOdgovor<Kategorija>>('/api/admin/categories', telo);
  }

  izmeniKategoriju(kljuc: string, telo: Partial<Kategorija>): Observable<ApiOdgovor<Kategorija>> {
    return this.http.patch<ApiOdgovor<Kategorija>>(`/api/admin/categories/${kljuc}`, telo);
  }

  /** Meko brisanje - kategorija ostaje u sačuvanim putovanjima. */
  ugasiKategoriju(kljuc: string): Observable<ApiOdgovor<Kategorija>> {
    return this.http.delete<ApiOdgovor<Kategorija>>(`/api/admin/categories/${kljuc}`);
  }

  // ---------------------------------------------------------------
  // Atrakcije administratora (spec §4.5)
  // ---------------------------------------------------------------

  atrakcije(gradId: string): Observable<Lista<AdminAtrakcija>> {
    const params = new HttpParams().set('gradId', gradId);

    return this.http.get<Lista<AdminAtrakcija>>('/api/admin/attractions', { params });
  }

  kreirajAtrakciju(telo: Partial<AdminAtrakcija>): Observable<ApiOdgovor<AdminAtrakcija>> {
    return this.http.post<ApiOdgovor<AdminAtrakcija>>('/api/admin/attractions', telo);
  }

  izmeniAtrakciju(
    id: string,
    telo: Partial<AdminAtrakcija>
  ): Observable<ApiOdgovor<AdminAtrakcija>> {
    return this.http.patch<ApiOdgovor<AdminAtrakcija>>(`/api/admin/attractions/${id}`, telo);
  }

  ugasiAtrakciju(id: string): Observable<ApiOdgovor<AdminAtrakcija>> {
    return this.http.delete<ApiOdgovor<AdminAtrakcija>>(`/api/admin/attractions/${id}`);
  }

  // ---------------------------------------------------------------
  // Istaknute destinacije (spec §4.1)
  // ---------------------------------------------------------------

  destinacije(): Observable<Lista<IstaknutaDestinacija>> {
    return this.http.get<Lista<IstaknutaDestinacija>>('/api/admin/destinations');
  }

  kreirajDestinaciju(telo: {
    gradId: string;
    naslov?: string;
    opis?: string;
    slika?: unknown;
  }): Observable<ApiOdgovor<IstaknutaDestinacija>> {
    return this.http.post<ApiOdgovor<IstaknutaDestinacija>>('/api/admin/destinations', telo);
  }

  izmeniDestinaciju(
    id: string,
    telo: Partial<IstaknutaDestinacija>
  ): Observable<ApiOdgovor<IstaknutaDestinacija>> {
    return this.http.patch<ApiOdgovor<IstaknutaDestinacija>>(
      `/api/admin/destinations/${id}`,
      telo
    );
  }

  obrisiDestinaciju(id: string): Observable<ApiOdgovor<{ obrisanId: string }>> {
    return this.http.delete<ApiOdgovor<{ obrisanId: string }>>(`/api/admin/destinations/${id}`);
  }

  /** Novi redosled; prvi u listi je prvi na početnoj. */
  poredjajDestinacije(ids: string[]): Observable<Lista<IstaknutaDestinacija>> {
    return this.http.patch<Lista<IstaknutaDestinacija>>('/api/admin/destinations/order', { ids });
  }
}
