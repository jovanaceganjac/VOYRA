import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { TPipe } from '../../core/i18n/t.pipe';
import { proveriPravila } from '../validators/password.validator';

/**
 * Indikator pravila za lozinku (spec §11).
 *
 * Isti prikaz koriste registracija i promena lozinke na profilu. Dok se
 * kuca, ispunjeno pravilo se označava — korisnik ne mora da pogađa šta
 * nedostaje iz poruke o grešci.
 *
 * Lista je `aria-live="polite"`: čitač ekrana pročita promenu kada se
 * pravilo ispuni, ali ne prekida kucanje.
 */
@Component({
  selector: 'app-pravila-lozinke',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="pravila" [attr.aria-label]="'validacija.pravilaLozinke' | t" aria-live="polite">
      <li [class.pravila--ok]="p().duzina">{{ 'validacija.pravilo8' | t }}</li>
      <li [class.pravila--ok]="p().veliko">{{ 'validacija.praviloVeliko' | t }}</li>
      <li [class.pravila--ok]="p().malo">{{ 'validacija.praviloMalo' | t }}</li>
      <li [class.pravila--ok]="p().broj">{{ 'validacija.praviloBroj' | t }}</li>
      <li [class.pravila--ok]="p().specijalni">{{ 'validacija.praviloSpecijalni' | t }}</li>
    </ul>
  `,
  styles: `
    .pravila {
      display: flex;
      flex-wrap: wrap;
      gap: 0.15rem 0.8rem;
      margin: 0.35rem 0 0;
      padding: 0;
      list-style: none;
      font-size: 0.8rem;
      color: var(--boja-tekst-slab);
    }
    .pravila li::before {
      content: '○ ';
    }
    .pravila--ok {
      color: var(--boja-uspeh, var(--boja-primarna));
    }
    .pravila--ok::before {
      content: '● ';
    }
  `
})
export class PravilaLozinkeComponent {
  /** Lozinka koja se upravo kuca. */
  readonly lozinka = input<string>('');

  readonly p = computed(() => proveriPravila(this.lozinka() ?? ''));
}
