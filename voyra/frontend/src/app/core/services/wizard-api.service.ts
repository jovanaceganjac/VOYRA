import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Atrakcija, Let, Preferencije, Smestaj } from '../models/plan.model';

/** Zajednički omotač odgovora koraka čarobnjaka. */
export interface OdgovorPonuda<T> {
  success: boolean;
  data: T[];
  count: number;
  /** Odakle podaci potiču: `duffel`, `liteapi`, `cache`, `mock`… */
  source: string | null;
  warnings?: string[];
  durationMs?: number;
}

/** Filteri iz §4.3 - primenjuju se samo u koraku 2. */
export interface FilteriLeta {
  maxStops?: number | null;
  departureFrom?: string | null;
  departureTo?: string | null;
}

/** Filteri iz §4.4 - samo u koraku 3. */
export interface FilteriSmestaja {
  accommodationTypes?: string[];
  minAccommodationRating?: number | null;
  maxPricePerNight?: number | null;
}

/**
 * Rute koraka čarobnjaka (spec §4.2).
 *
 * Plan i čuvanje idu kroz `PlanApiService`; ovde su samo pretrage koje
 * koraci 2, 3 i stranica „Atrakcije" koriste.
 */
@Injectable({ providedIn: 'root' })
export class WizardApiService {
  private readonly http = inject(HttpClient);

  /** Prazne vrednosti se ne šalju - inače bi `maxStops=` bio filter. */
  private dodaj(params: HttpParams, kljuc: string, vrednost: unknown): HttpParams {
    if (vrednost === null || vrednost === undefined || vrednost === '') return params;

    return params.set(kljuc, String(vrednost));
  }

  /** Korak 2: rangirane ponude letova. */
  letovi(
    p: {
      from: string;
      to: string;
      /** Identifikatori gradova - server iz njih uzima koordinate (§4.2). */
      fromCityId?: string | null;
      toCityId?: string | null;
      checkIn: string;
      checkOut: string;
      passengers: number;
      budget?: number | null;
    },
    preferencije: Pick<Preferencije, 'transportPriority'>,
    filteri: FilteriLeta = {}
  ): Observable<OdgovorPonuda<Let>> {
    let params = new HttpParams()
      .set('from', p.from)
      .set('to', p.to)
      .set('checkIn', p.checkIn)
      .set('checkOut', p.checkOut)
      .set('passengers', String(p.passengers))
      .set('transportPriority', preferencije.transportPriority);

    params = this.dodaj(params, 'fromCityId', p.fromCityId);
    params = this.dodaj(params, 'toCityId', p.toCityId);
    params = this.dodaj(params, 'budget', p.budget);
    params = this.dodaj(params, 'maxStops', filteri.maxStops);
    params = this.dodaj(params, 'departureFrom', filteri.departureFrom);
    params = this.dodaj(params, 'departureTo', filteri.departureTo);

    return this.http.get<OdgovorPonuda<Let>>('/v1/flights', { params });
  }

  /**
   * Korak 3: rangirane ponude smeštaja.
   *
   * `flightPrice` je cena izabranog leta - server iz nje računa preostali
   * budžet za preporuku (§6.1).
   */
  smestaj(
    p: {
      to: string;
      toCityId?: string | null;
      checkIn: string;
      checkOut: string;
      guests: number;
      budget?: number | null;
      flightPrice?: number | null;
    },
    filteri: FilteriSmestaja = {}
  ): Observable<OdgovorPonuda<Smestaj>> {
    let params = new HttpParams()
      .set('to', p.to)
      .set('checkIn', p.checkIn)
      .set('checkOut', p.checkOut)
      .set('guests', String(p.guests));

    params = this.dodaj(params, 'toCityId', p.toCityId);
    params = this.dodaj(params, 'budget', p.budget);
    params = this.dodaj(params, 'flightPrice', p.flightPrice);
    params = this.dodaj(params, 'minAccommodationRating', filteri.minAccommodationRating);
    params = this.dodaj(params, 'maxPricePerNight', filteri.maxPricePerNight);

    if (filteri.accommodationTypes?.length) {
      params = params.set('accommodationTypes', filteri.accommodationTypes.join(','));
    }

    return this.http.get<OdgovorPonuda<Smestaj>>('/v1/accommodations', { params });
  }

  /**
   * Stranica „Atrakcije" (§10).
   *
   * `toCityId` je izbor iz predloga; `to` (IATA kod) ostaje zbog starih
   * adresa i zato što server i dalje prima oba oblika.
   */
  atrakcije(
    to: string,
    interesovanja: string[],
    toCityId: string | null = null
  ): Observable<OdgovorPonuda<Atrakcija>> {
    let params = new HttpParams().set('to', to);

    params = this.dodaj(params, 'toCityId', toCityId);

    if (interesovanja.length > 0) params = params.set('interests', interesovanja.join(','));

    return this.http.get<OdgovorPonuda<Atrakcija>>('/v1/attractions', { params });
  }
}
