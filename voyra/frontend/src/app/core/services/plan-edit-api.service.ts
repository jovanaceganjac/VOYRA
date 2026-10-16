import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Dan, UkupanTrosak } from '../models/plan.model';
import { Putovanje } from '../models/trip.model';

/** Jedan izmenjen dan: samo broj dana i redosled identifikatora. */
export interface IzmenaDana {
  day: number;
  attractionIds: string[];
}

/** Odgovor `GET /v1/trips/:id`. */
export interface OdgovorPutovanja {
  success: boolean;
  data: Putovanje;
  /** Po statusu (§4.9): menja se samo NACRT i REZERVISANO. */
  editable: boolean;
  /** `updatedAt` putovanja; uslov za čuvanje. */
  version: string | null;
}

/** Odgovor na `preview` - novi dani i novi trošak, ništa sačuvano. */
export interface OdgovorPregleda {
  success: boolean;
  days: Dan[];
  totalBudget: UkupanTrosak;
  version: string | null;
}

export interface OdgovorOptimizacije {
  success: boolean;
  day: Dan;
  totalBudget: UkupanTrosak;
  version: string | null;
}

/**
 * Izmena plana (spec §4.6).
 *
 * Klijent šalje SAMO identifikatore atrakcija; server ih razrešava iz
 * plana ili iz liste za odredište. Tako se ne može podmetnuti atrakcija
 * sa izmišljenom cenom ili koordinatama - isto pravilo kao kod izbora
 * leta u čarobnjaku.
 */
@Injectable({ providedIn: 'root' })
export class PlanEditApiService {
  private readonly http = inject(HttpClient);

  putovanje(id: string): Observable<OdgovorPutovanja> {
    return this.http.get<OdgovorPutovanja>(`/v1/trips/${id}`);
  }

  /** Nova vremena bez čuvanja. */
  pregled(id: string, days: IzmenaDana[]): Observable<OdgovorPregleda> {
    return this.http.post<OdgovorPregleda>(`/v1/trips/${id}/days/preview`, { days });
  }

  /** Čuvanje; `version` sprečava pregaženje tuđe izmene. */
  sacuvaj(
    id: string,
    days: IzmenaDana[],
    version: string | null
  ): Observable<OdgovorPutovanja> {
    return this.http.put<OdgovorPutovanja>(`/v1/trips/${id}/days`, { days, version });
  }

  /** „Optimizuj redosled" za jedan dan; rezultat je lokalna izmena. */
  optimizuj(id: string, dan: number, attractionIds: string[]): Observable<OdgovorOptimizacije> {
    return this.http.post<OdgovorOptimizacije>(`/v1/trips/${id}/days/${dan}/optimize`, {
      attractionIds
    });
  }

  /** „Generiši ponovo" - let i smeštaj ostaju isti. */
  generisiPonovo(id: string): Observable<OdgovorPutovanja> {
    return this.http.post<OdgovorPutovanja>(`/v1/trips/${id}/regenerate`, {});
  }
}
