import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiOdgovor } from '../models/api.model';
import { ProfilKorisnika } from '../models/user.model';

/** Rute profila i telefona iz user-service-a (Task 10). */
@Injectable({ providedIn: 'root' })
export class UserApiService {
  private readonly http = inject(HttpClient);

  profil(): Observable<ApiOdgovor<ProfilKorisnika>> {
    return this.http.get<ApiOdgovor<ProfilKorisnika>>('/api/users/me');
  }

  /** Nov ili izmenjen broj gubi potvrdu i backend salje kod SMS-om. */
  izmeniProfil(izmene: {
    ime?: string;
    prezime?: string;
    phone?: string;
  }): Observable<ApiOdgovor<ProfilKorisnika> & { message?: string }> {
    return this.http.put<ApiOdgovor<ProfilKorisnika> & { message?: string }>(
      '/api/users/me',
      izmene
    );
  }

  /**
   * Promena lozinke (spec §4.10).
   *
   * Odgovor nosi NOV token: promena poništava sve ranije, pa se ovaj
   * odmah upisuje u `AuthService`.
   */
  promeniLozinku(
    trenutnaLozinka: string,
    novaLozinka: string
  ): Observable<{ success: boolean; message: string; token: string }> {
    return this.http.put<{ success: boolean; message: string; token: string }>(
      '/api/users/me/password',
      { trenutnaLozinka, novaLozinka }
    );
  }

  smsPreferenca(smsOptIn: boolean): Observable<ApiOdgovor<ProfilKorisnika>> {
    return this.http.patch<ApiOdgovor<ProfilKorisnika>>('/api/users/me/sms-preference', {
      smsOptIn
    });
  }
}
