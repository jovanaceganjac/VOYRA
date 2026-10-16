/**
 * Zajednicki oblik odgovora backenda.
 * Svi servisi vracaju { success, ... } ili { success:false, error, message, statusCode }.
 */
export interface ApiOdgovor<T> {
  success: boolean;
  data: T;
  statusCode?: number;
}

/** Telo greske - potvrdjeno na svim servisima. */
export interface ApiGreska {
  success: false;
  error: string;
  message: string | string[];
  statusCode: number;
  /** /v1 rute dodaju listu pojedinacnih gresaka validacije. */
  errors?: string[];
  /** user-service dodaje uz 429 (previše pokušaja prijave). */
  retryAfter?: number;
}
