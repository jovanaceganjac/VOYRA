import { Pipe, PipeTransform } from '@angular/core';

import { Parametri, prevedi } from './prevod';

/**
 * `{{ 'nav.pocetna' | t }}` ili `{{ 'plan.dan' | t: { broj: 3 } }}`.
 *
 * Pipe nije „pure": rezultat zavisi i od aktivnog jezika, ne samo od
 * ključa. Čitanje signala jezika označava prikaz za ponovno iscrtavanje,
 * pa radi i u komponentama sa OnPush strategijom.
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TPipe implements PipeTransform {
  transform(kljuc: string, parametri?: Parametri): string {
    return prevedi(kljuc, parametri);
  }
}
