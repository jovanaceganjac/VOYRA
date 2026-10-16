import { GradUPutovanju } from './grad.model';
import { Itinerar, Preferencije } from './plan.model';

/** Backend enum: draft | saved | booked. */
/** Statusi po specifikaciji §4.9. */
export type StatusPutovanja = 'NACRT' | 'REZERVISANO' | 'OTKAZANO' | 'ZAVRSENO';

/** GET /api/trips -> data[] i GET /api/trips/:id -> data */
export interface Putovanje {
  _id: string;
  userId: string;
  title: string;
  description?: string;
  from: string;
  to: string;
  /** Razrešeni gradovi (§4.2) - starija putovanja ih dobijaju migracijom. */
  fromCity?: GradUPutovanju | null;
  toCity?: GradUPutovanju | null;
  date: string;
  checkIn: string;
  checkOut: string;
  passengers: number;
  guests: number;
  budget: number;
  /** Preferencije sa kojima je plan napravljen (spec §9). */
  preferences?: Preferencije;
  itinerary: Itinerar;
  status: StatusPutovanja;
  bookingInfo?: {
    flightBookingUrl?: string;
    accommodationBookingUrl?: string;
    bookingDate?: string;
  };
  createdAt: string;
  updatedAt: string;
}
