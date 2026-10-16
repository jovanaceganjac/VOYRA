import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Let } from '../models/plan.model';
import { Putovanje } from '../models/trip.model';

/** Podaci o putniku; ista pravila kao na serveru (spec §4.8 t.3). */
export interface Putnik {
  title: string;
  givenName: string;
  familyName: string;
  gender: string;
  bornOn: string;
  email: string;
  phoneNumber: string;
}

/** Odgovor `POST /api/bookings/validate`. */
export interface ProveraPonude {
  valid: boolean;
  offerId: string;
  expiresAt: string | null;
  priceChanged: boolean;
  oldPrice: number;
  newPrice: number;
  currency: string;
  passengersAllowed: number;
  passengersRequired: number;
  /** Let koji će biti rezervisan - prikazuje se pre potvrde. */
  flight: Let;
  /** `false` za putovanja sačuvana pre nego što se izbor leta čuvao. */
  explicit: boolean;
  warnings?: string[];
  source?: string | null;
}

export interface OdgovorRezervacije {
  success: boolean;
  bookingId: string;
  status: string;
  bookingReference: string | null;
  totalPrice: number;
  currency: string;
  confirmationPdf: string | null;
  emailSent: boolean;
  tripStatus?: string;
  bookingDate?: string;
  warnings?: string[];
}

/** Odgovor `POST /v1/trips/:id/flight/refresh`. */
export interface OsvezenaPonuda {
  success: boolean;
  found: boolean;
  oldPrice?: number;
  newPrice?: number;
  priceChanged?: boolean;
  currency?: string;
  flight?: Let;
  /** Kada isti let više ne postoji - rangirane zamene. */
  alternatives?: Let[];
  oldFlight?: Let;
  version: string | null;
}

export interface ZamenaLeta {
  success: boolean;
  trip: Putovanje;
  flight: Let;
  /** Dani čija se satnica promenila zbog drugih vremena leta. */
  changedDays: { day: number; availableFrom: string; availableTo: string }[];
  version: string | null;
}

/** Rezervacija kako je stranica putovanja prikazuje. */
export interface Rezervacija {
  bookingId: string;
  tripId: string;
  status: string;
  totalPrice: number;
  currency: string;
  createdAt: string;
  cancelledAt?: string | null;
  flights: { bookingReference?: string | null; status: string }[];
  confirmations?: { flight_pdf_url?: string | null };
}

/**
 * Rezervacija leta (spec §4.8).
 *
 * Sve ide u test režimu: tok je potpun, ali bez stvarne kupovine.
 */
@Injectable({ providedIn: 'root' })
export class BookingApiService {
  private readonly http = inject(HttpClient);

  /** Korak 1: provera ponude i cene. */
  proveri(tripId: string, offerId?: string): Observable<ProveraPonude> {
    return this.http.post<ProveraPonude>('/api/bookings/validate', { tripId, offerId });
  }

  /** Osvežavanje istekle ponude - traži isti let u svežoj pretrazi. */
  osveziPonudu(tripId: string): Observable<OsvezenaPonuda> {
    return this.http.post<OsvezenaPonuda>(`/v1/trips/${tripId}/flight/refresh`, {});
  }

  /** Zamena leta; server razrešava ponudu po `offerId`. */
  zameniLet(tripId: string, offerId: string, version: string | null): Observable<ZamenaLeta> {
    return this.http.put<ZamenaLeta>(`/v1/trips/${tripId}/flight`, { offerId, version });
  }

  /** Korak 3: kreiranje rezervacije. */
  rezervisi(
    tripId: string,
    passengers: Putnik[],
    acceptedPrice: number,
    offerId?: string
  ): Observable<OdgovorRezervacije> {
    return this.http.post<OdgovorRezervacije>('/api/bookings', {
      tripId,
      offerId,
      passengers,
      acceptedPrice
    });
  }

  /** Rezervacije jednog putovanja - stranica putovanja prikazuje aktivnu. */
  zaPutovanje(tripId: string): Observable<{ data: Rezervacija[] }> {
    return this.http.get<{ data: Rezervacija[] }>(`/api/bookings?tripId=${tripId}`);
  }

  /**
   * PDF potvrda. Preuzima se kao `blob`, jer je odgovor binarni -
   * podrazumevani JSON parser bi ga pokvario.
   */
  potvrda(bookingId: string): Observable<Blob> {
    return this.http.get(`/api/bookings/${bookingId}/confirmation`, { responseType: 'blob' });
  }
}
