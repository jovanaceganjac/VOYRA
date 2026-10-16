import { HttpErrorResponse } from '@angular/common/http';

import { prevediServer } from '../i18n/i18n.service';
import { prevedi } from '../i18n/prevod';
import { ApiGreska } from '../models/api.model';

const porukaNedostupan = (): string => prevedi('greske.serverNedostupan');

/** Poruka iz tela odgovora, ako je uopšte ima. */
const izTela = (err: HttpErrorResponse): string | string[] | null => {
  const telo = err.error as ApiGreska | undefined;

  if (!telo || typeof telo !== 'object') return null;

  /*
   * `errors` ima prednost nad `message`.
   *
   * Servisi uz listu pojedinačnih grešaka šalju i kratku opštu poruku
   * („Podaci o putnicima nisu ispravni"). Korisniku treba lista - ona
   * kaže šta tačno da popravi.
   */
  // Servisi pišu na srpskom; poznate poruke se prevode na aktivni jezik
  if (Array.isArray(telo.errors) && telo.errors.length > 0) return telo.errors.map(prevediServer);

  const poruka = telo.message;

  if (Array.isArray(poruka) && poruka.length > 0) return poruka.map(prevediServer);
  if (typeof poruka === 'string' && poruka.trim()) return prevediServer(poruka);

  return null;
};

/**
 * Da li zahtev uopšte nije stigao do aplikacije.
 *
 *  - status 0   — mreža nedostupna (nema veze, CORS, prekinut zahtev)
 *  - status 503 — gateway javlja da servis iza njega ne radi
 *  - 5xx bez tela — u razvoju: `ng serve` proxy vrati 500 sa praznim
 *    telom kada backend na 4000 nije pokrenut
 */
export const jeNedostupan = (err: HttpErrorResponse): boolean =>
  err.status === 0 || err.status === 503 || (err.status >= 500 && izTela(err) === null);

/** Poruka koju treba prikazati korisniku (jedna linija). */
export const porukaGreske = (err: HttpErrorResponse, podrazumevana: string): string => {
  if (jeNedostupan(err)) return porukaNedostupan();

  const poruka = izTela(err);

  if (Array.isArray(poruka)) return poruka.join(' ');
  if (poruka) return poruka;

  return podrazumevana;
};

/** Ista logika, za forme koje prikazuju listu grešaka. */
export const porukeGreske = (err: HttpErrorResponse, podrazumevana: string): string[] => {
  if (jeNedostupan(err)) return [porukaNedostupan()];

  const poruka = izTela(err);

  if (Array.isArray(poruka)) return poruka;
  if (poruka) return [poruka];

  return [podrazumevana];
};
