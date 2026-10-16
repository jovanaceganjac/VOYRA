import { Injectable, computed } from '@angular/core';

import { Jezik, JEZICI, aktivniJezik, postaviJezik } from './jezik';
import { RECNICI, PORUKE_SERVERA, Parametri, prevedi } from './prevod';

/**
 * Prevod korisničkog interfejsa (srpski / engleski).
 *
 * Tekstovi su u rečnicima `recnici/<jezik>.ts`, po oblastima (navigacija,
 * čarobnjak, profil...). Ključ je putanja kroz rečnik: `'nav.pocetna'`.
 *
 * Šabloni koriste pipe `t` (`{{ 'nav.pocetna' | t }}`), a kod ovaj servis
 * (`i18n.t('toast.sacuvano')`). Promena jezika je signal, pa se ceo
 * interfejs odmah iscrta ponovo, bez osvežavanja stranice.
 *
 * NOVI JEZIK: dodati kod u `JEZICI` (jezik.ts), rečnik u `recnici/` sa
 * tipom `Recnik` (kompajler javlja svaki ključ koji nedostaje) i unos u
 * `RECNICI` (prevod.ts).
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly jezik = aktivniJezik.asReadonly();
  readonly jezici = JEZICI;

  /** Lokal za `Intl` - datumi, brojevi. */
  readonly lokal = computed(() => (this.jezik() === 'en' ? 'en-GB' : 'sr-Latn-RS'));

  constructor() {
    if (typeof document !== 'undefined') document.documentElement.lang = this.jezik();
  }

  promeni(jezik: Jezik): void {
    postaviJezik(jezik);
  }

  /** Tekst za ključ na aktivnom jeziku; `{ime}` se zamenjuje parametrom. */
  t(kljuc: string, parametri?: Parametri): string {
    return prevedi(kljuc, parametri);
  }

  /**
   * Poruka koja dolazi sa servera (greška, upozorenje plana).
   *
   * Servisi pišu poruke na srpskom; za druge jezike se prevode poznate
   * poruke i obrasci iz `PORUKE_SERVERA`. Nepoznata poruka ostaje kakva
   * jeste - bolje original nego prazno.
   */
  server(poruka: string): string {
    return prevediServer(poruka);
  }
}

/** Isto što i `I18nService.server`, za čiste funkcije (api-error.ts). */
export const prevediServer = (poruka: string): string => {
  const jezik = aktivniJezik();
  const tabela = PORUKE_SERVERA[jezik];

  if (!tabela || typeof poruka !== 'string') return poruka;

  const tacna = tabela.tacne[poruka.trim()];
  if (tacna) return tacna;

  for (const [obrazac, zamena] of tabela.obrasci) {
    if (obrazac.test(poruka)) return poruka.replace(obrazac, zamena);
  }

  return poruka;
};

export { RECNICI };
