import { CanDeactivateFn } from '@angular/router';

import { prevedi } from '../i18n/prevod';

/** Komponenta koja ume da kaže da ima nesačuvanih izmena. */
export interface MozeDaIma {
  imaNesacuvanih(): boolean;
}

/** Poruka potvrde na aktivnom jeziku. */
export const porukaNesacuvano = (): string => prevedi('putovanje.nesacuvano');

/**
 * Sprečava tiho gubljenje izmena (spec §4.6).
 *
 * Potvrda se traži SAMO kada izmena zaista postoji - inače bi svaki
 * odlazak sa stranice tražio klik viška.
 */
export const nesacuvanoGuard: CanDeactivateFn<MozeDaIma> = (komponenta) => {
  if (!komponenta?.imaNesacuvanih?.()) return true;

  return confirm(porukaNesacuvano());
};
