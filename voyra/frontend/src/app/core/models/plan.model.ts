/**
 * Tipovi su preslikani sa STVARNOG odgovora `POST /v1/plan`
 * (orchestrator-service). Struktura `itinerary` je tačno ono što
 * vraća Planner Service - namerno se ne prepakuje.
 */
import { GradUPutovanju } from './grad.model';

/** Jedna noga puta - odlazak ili povratak. */
export interface NogaPuta {
  departure: string;
  arrival: string;
  /** minuti */
  duration: number;
  stops: number;
  segments: Segment[];
}

export interface Let {
  id: string;
  /** Identifikator ponude kod avio-kompanije; potreban za rezervaciju. */
  offerId: string;
  /** Ponude isticu - posle ovoga treba ponovo generisati plan. */
  expiresAt: string | null;

  from: string;
  to: string;
  /** Polazak i dolazak ODLASKA; dnevni plan koristi ova polja. */
  departure: string;
  arrival: string;

  airline: string;
  airlineIata?: string | null;
  number: string | null;

  /** Cena cele ponude: oba smera i svi putnici. */
  price: number;
  currency: string;
  priceEUR?: number;

  /** Ukupno za oba smera. */
  duration: number;
  stops: number;

  outbound: NogaPuta | null;
  inbound: NogaPuta | null;

  /** Starija putovanja imaju ravnu listu segmenata bez outbound/inbound. */
  segments?: Segment[];

  /** manji skor = bolja ponuda */
  score: number;
  reason?: string;

  /** Doprinos svakog činioca oceni (§6.1). */
  scoreBreakdown?: { cena: number; trajanje: number; presedanja: number };
  /** Tačno jedna ponuda u listi je preporučena. */
  recommended?: boolean;
  /** Ponuda skuplja od budžeta ostaje u listi (§4.7), samo je označena. */
  overBudget?: boolean;
}

export interface Segment {
  departure: string;
  arrival: string;
  from: string;
  to: string;
  airline: string;
  number: string | null;
}

/** Tipovi smestaja po specifikaciji §4.4. */
export type TipSmestaja = 'hotel' | 'apartman' | 'hostel';

export interface Smestaj {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lon: number;
  /** cena po noći */
  price: number;
  pricePerNight?: number;
  priceEUR?: number;
  currency: string;
  /** null kada izvor nema ocenu gostiju - nije isto sto i nula. */
  rating: number | null;
  stars?: number | null;
  type: TipSmestaja | string;
  distanceToCenter?: number;
  images: string[];
  amenities: string[];
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  totalPrice: number;
  cancellation: string;
  /** Booking.com pretraga sa popunjenim gradom, datumima i gostima (§4.4). */
  bookingUrl: string | null;
  score: number;
  reason?: string;

  scoreBreakdown?: { cena: number; distanca: number; ocena: number };
  recommended?: boolean;
  overBudget?: boolean;
  /** Izvor nema ocenu gostiju - nije isto što i loša ocena (§4.4). */
  ratingUnknown?: boolean;
}

/** Slika atrakcije; `sourceUrl` nosi potpis koji ide ispod nje. */
export interface SlikaAtrakcije {
  url: string;
  width?: number | null;
  height?: number | null;
  sourceUrl?: string | null;
  credit?: string;
}

export interface Atrakcija {
  id: string;
  name: string;
  city: string;
  category: string;
  lat: number;
  lon: number;
  description: string;
  price: number;
  currency: string;
  /** minuti */
  duration: number;
  rating: number;
  views: number;
  order: number;

  /** Kategorije iz §4.2; starije atrakcije imaju samo `category`. */
  categories?: string[];

  /** Satnica iz §4.6 - vreme početka i kraja aktivnosti. */
  startTime?: string;
  endTime?: string;
  travelMinutes?: number;
  travelMode?: 'pesice' | 'prevoz';
  travelKm?: number;

  openingHours?: { open: string; close: string };
  /** Radno vreme je procena po kategoriji, ne podatak iz izvora. */
  openingHoursEstimated?: boolean;
  violation?: 'zatvoreno' | null;

  /**
   * Slika sa Wikimedia Commons-a. `null` kada je izvor nema - tada se
   * prikazuje neutralni znak po kategoriji, nikad tuđa fotografija.
   */
  image?: SlikaAtrakcije | null;

  /**
   * Atrakcija koja ne pripada nijednom izabranom interesovanju; u plan
   * ulazi samo kao dopuna, pa se u prikazu označava (§6.2).
   */
  outsideInterests?: boolean;

  /**
   * Odakle atrakcija dolazi. `admin` znači da ju je uneo administrator
   * (spec §4.5), pa se u prikazu označava kao preporuka Voyre.
   */
  source?: string;

  score?: number;
  scoreBreakdown?: { interesovanja: number; popularnost: number };
}

export interface Dan {
  day: number;
  date: string;
  flight: Let | null;
  accommodation: Smestaj | null;
  attractions: Atrakcija[];
  /** km */
  totalDistance: number;
  estimatedBudget: number;

  /** Raspoloživo vreme dana (§6.2); prvi i poslednji su skraćeni letom. */
  availableFrom?: string;
  availableTo?: string;
  /** Zašto je dan skraćen ili prazan. */
  note?: string | null;
  /** Dan bez aktivnosti jer više nema atrakcija za izabrani tempo (§6.3). */
  freeDay?: boolean;
  lunch?: { startTime: string; endTime: string } | null;
}

export interface UkupanTrosak {
  flights: number;
  accommodations: number;
  attractions: number;
  total: number;
  currency?: string;
  /** Budžet je meka granica (§4.7) - ništa se ne odseca. */
  overBudget?: boolean;
  overBy?: number;
}

export interface MetaPlana {
  destinationCity: string;
  destinationCountry?: string | null;
  sources: { flights: string | null; accommodations: string | null; attractions: string | null };
  attractionsFound: number;
  attractionsSelected?: number;
  targetActivities?: number;
  daysWithoutAttractions: number;
  /** Postojalo ranije; stari sačuvani planovi ga i dalje nose. */
  attractionFilterRelaxed?: boolean;
}

/** Ono što Planner vraća - čuva se i u Trip-u pod `itinerary`. */
export interface Itinerar {
  flights: Let[];
  accommodations: Smestaj[];
  itinerary: Dan[];
  totalDays: number;
  totalBudget: UkupanTrosak;
  meta?: MetaPlana;

  /** Ponude koje je plan zaista koristio. */
  selectedFlight?: Let | null;
  selectedAccommodation?: Smestaj | null;
  /** Atrakcije koje nisu stale u plan, sa razlogom (§6.4). */
  removedAttractions?: (Atrakcija & { reason: string; day?: number })[];
  preferences?: Preferencije;
  warnings?: string[];
}

export interface ProcenaRezervacije {
  flights: number;
  accommodations: number;
  attractions: number;
  total: number;
  currency: string;
  withinBudget: boolean | null;
  isBookable: boolean;
  issues: string[];
}

export interface IzvorPodataka {
  flights: string | null;
  accommodations: string | null;
  booking: string;
  trip: string;
  notification: string;
}

/** Odgovor `POST /v1/plan` i `GET /v1/plan/:sessionId`. */
export interface Plan {
  planSessionId: string;
  status: 'READY';
  savedTripId: string | null;
  source: IzvorPodataka;
  request: ZahtevPlana;
  itinerary: Itinerar;
  bookingEstimate: ProcenaRezervacije;
  warnings: string[];
  timings: Record<string, number>;
  createdAt: string;
  expiresAt: string;
}

/** Preferencije putovanja (spec §4.2). */
export interface Preferencije {
  transportPriority: 'najjeftinije' | 'najbrze' | 'balans';
  accommodationTypes: TipSmestaja[];
  minAccommodationRating: number | null;
  interests: string[];
  pace: 'opusten' | 'umeren' | 'intenzivan';
  dayStart: string;
  dayEnd: string;
}

/** Odgovor `POST /v1/plan/:sessionId/save`. */
export interface OdgovorCuvanja {
  success: boolean;
  savedTripId: string;
  alreadySaved: boolean;
  warnings: string[];
}

export interface ZahtevPlana {
  /** IATA kod koji je otišao u pretragu leta (kod grada ili aerodroma). */
  from: string;
  to: string;
  /** Identifikatori izabranih gradova (§4.2) - novo umesto IATA koda. */
  fromCityId?: string;
  toCityId?: string;
  /** Razrešeni gradovi - prikaz iz njih uzima naziv i aerodrom. */
  fromCity?: GradUPutovanju | null;
  toCity?: GradUPutovanju | null;
  date?: string;
  checkIn: string;
  checkOut: string;
  passengers: number;
  guests?: number;
  budget?: number;
  title?: string;
  description?: string;
  preferences?: Partial<Preferencije>;
  selectedFlightOfferId?: string;
  selectedAccommodationId?: string;
}
