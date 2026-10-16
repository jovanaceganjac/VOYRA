import { Jezik, PODRAZUMEVANI_JEZIK, aktivniJezik } from './jezik';
import { sr } from './recnici/sr';
import { en } from './recnici/en';
import { SERVER_EN, TabelaServera } from './recnici/server-en';

export type Parametri = Record<string, string | number | null | undefined>;

/** Rečnik sa istim ključevima kao srpski, a tekstom kao vrednošću. */
export type Recnik<T = typeof sr> = { [K in keyof T]: T[K] extends string ? string : Recnik<T[K]> };

export const RECNICI: Record<Jezik, Recnik> = { sr, en };

/** Prevodi poruka servera - srpski je izvorni jezik, pa za njega nema tabele. */
export const PORUKE_SERVERA: Partial<Record<Jezik, TabelaServera>> = { en: SERVER_EN };

const procitaj = (recnik: unknown, kljuc: string): string | null => {
  let cvor: unknown = recnik;

  for (const deo of kljuc.split('.')) {
    if (cvor === null || typeof cvor !== 'object') return null;
    cvor = (cvor as Record<string, unknown>)[deo];
  }

  return typeof cvor === 'string' ? cvor : null;
};

const umetni = (tekst: string, parametri?: Parametri): string =>
  parametri
    ? tekst.replace(/\{(\w+)\}/g, (ceo, ime: string) =>
        parametri[ime] === undefined || parametri[ime] === null ? ceo : String(parametri[ime])
      )
    : tekst;

/**
 * Tekst za ključ. Čita signal jezika, pa poziv iz šablona prati promenu.
 * Ključ koji nedostaje daje srpski tekst, a ako ni njega nema - sam ključ,
 * da se propust odmah vidi.
 */
export const prevedi = (kljuc: string, parametri?: Parametri): string => {
  const jezik = aktivniJezik();

  const tekst =
    procitaj(RECNICI[jezik], kljuc) ?? procitaj(RECNICI[PODRAZUMEVANI_JEZIK], kljuc) ?? kljuc;

  return umetni(tekst, parametri);
};

/**
 * Oblik reči uz broj: ključ `osnova` ima podključeve `jedan`, `nekoliko`
 * i `mnogo` (srpski: 1 pretraga, 3 pretrage, 7 pretraga; engleski ima
 * samo jedninu i množinu, pa su tamo `nekoliko` i `mnogo` isti).
 * `{broj}` u tekstu se zamenjuje brojem.
 */
export const prevediBroj = (osnova: string, broj: number, parametri?: Parametri): string => {
  const n = Math.abs(Math.trunc(Number(broj) || 0));
  let oblik: 'jedan' | 'nekoliko' | 'mnogo';

  if (aktivniJezik() === 'sr') {
    const d = n % 10;
    const s = n % 100;

    oblik =
      d === 1 && s !== 11
        ? 'jedan'
        : d >= 2 && d <= 4 && (s < 12 || s > 14)
          ? 'nekoliko'
          : 'mnogo';
  } else {
    oblik = n === 1 ? 'jedan' : 'mnogo';
  }

  return prevedi(`${osnova}.${oblik}`, { broj, ...(parametri || {}) });
};

/** Kao `prevedi`, ali za ključ kojeg nema vraća `rezerva` (npr. nepoznat status). */
export const prevediIli = (kljuc: string, rezerva: string, parametri?: Parametri): string => {
  const tekst = prevedi(kljuc, parametri);

  return tekst === kljuc ? rezerva : tekst;
};
