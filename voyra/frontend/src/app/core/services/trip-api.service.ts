import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiOdgovor } from '../models/api.model';
import { Putovanje, StatusPutovanja } from '../models/trip.model';

@Injectable({ providedIn: 'root' })
export class TripApiService {
  private readonly http = inject(HttpClient);

  lista(status?: StatusPutovanja): Observable<ApiOdgovor<Putovanje[]> & { count: number }> {
    const putanja = status ? `/api/trips?status=${status}` : '/api/trips';
    return this.http.get<ApiOdgovor<Putovanje[]> & { count: number }>(putanja);
  }

  jedno(id: string): Observable<ApiOdgovor<Putovanje>> {
    return this.http.get<ApiOdgovor<Putovanje>>(`/api/trips/${id}`);
  }

  izmeni(id: string, izmene: Partial<Putovanje>): Observable<ApiOdgovor<Putovanje>> {
    return this.http.put<ApiOdgovor<Putovanje>>(`/api/trips/${id}`, izmene);
  }

  /** Spec §4.9: otkazuje i rezervaciju leta, ako postoji. */
  otkazi(id: string): Observable<ApiOdgovor<Putovanje>> {
    return this.http.patch<ApiOdgovor<Putovanje>>(`/api/trips/${id}/cancel`, {});
  }

  obrisi(id: string): Observable<ApiOdgovor<{ deletedId: string }>> {
    return this.http.delete<ApiOdgovor<{ deletedId: string }>>(`/api/trips/${id}`);
  }
}
