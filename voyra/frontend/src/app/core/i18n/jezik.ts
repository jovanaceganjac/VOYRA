import { signal } from '@angular/core';

/**
 * Podržani jezici korisničkog interfejsa.
 *
 * Novi jezik se dodaje ovde i kao rečnik u `recnici/` (vidi
 * `i18n.service.ts`); kompajler proverava da rečnik ima SVE ključeve.
 */
export const JEZICI = ['sr', 'en'] as const;

export type Jezik = (typeof JEZICI)[number];

export const PODRAZUMEVANI_JEZIK: Jezik = 'sr';

const KLJUC = 'voyra_jezik';

const jePodrzan = (v: unknown): v is Jezik => JEZICI.includes(v as Jezik);

/** Sačuvan izbor korisnika, inače srpski. */
const pocetniJezik = (): Jezik => {
  try {
    const sacuvan = localStorage.getItem(KLJUC);
    if (jePodrzan(sacuvan)) return sacuvan;
  } catch {
    /* skladište nije dostupno */
  }

  return PODRAZUMEVANI_JEZIK;
};

/**
 * Aktivni jezik kao signal.
 *
 * Čitaju ga i čiste funkcije (formatiranje datuma i novca), pa je na
 * nivou modula, a ne samo u servisu: poziv iz šablona čita signal i
 * Angular zna da prikaz ponovo iscrta kada se jezik promeni.
 */
export const aktivniJezik = signal<Jezik>(pocetniJezik());

export const postaviJezik = (jezik: Jezik): void => {
  if (!jePodrzan(jezik)) return;

  aktivniJezik.set(jezik);

  try {
    localStorage.setItem(KLJUC, jezik);
  } catch {
    /* izbor tada važi samo do osvežavanja */
  }

  if (typeof document !== 'undefined') document.documentElement.lang = jezik;
};
