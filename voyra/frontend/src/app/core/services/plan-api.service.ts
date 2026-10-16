import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { OdgovorCuvanja, Plan, ZahtevPlana } from '../models/plan.model';

/** Jedinstveni /v1 API orchestratora. */
@Injectable({ providedIn: 'root' })
export class PlanApiService {
  private readonly http = inject(HttpClient);

  /**
   * @param sacuvaj traži čuvanje putovanja (zahteva prijavu - zaglavlje X-Save-Trip)
   * @param tripId ažurira postojeće putovanje umesto kreiranja novog
   */
  napraviPlan(zahtev: ZahtevPlana, sacuvaj = false, tripId?: string): Observable<Plan> {
    let headers = new HttpHeaders();

    if (sacuvaj) headers = headers.set('X-Save-Trip', 'true');
    if (tripId) headers = headers.set('X-Trip-ID', tripId);

    return this.http.post<Plan>('/v1/plan', zahtev, { headers });
  }

  /**
   * Čuva TAČNO onaj plan koji je korisnik video (spec §9).
   * Bez novog generisanja - sesija se upisuje onakva kakva jeste.
   */
  sacuvajSesiju(sessionId: string): Observable<OdgovorCuvanja> {
    return this.http.post<OdgovorCuvanja>(`/v1/plan/${sessionId}/save`, {});
  }

  /** Sačuvana sesija plana - važi 24 h. */
  sesija(sessionId: string): Observable<Plan> {
    return this.http.get<Plan>(`/v1/plan/${sessionId}`);
  }
}
