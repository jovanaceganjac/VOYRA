import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  input
} from '@angular/core';
import { AbstractControl } from '@angular/forms';

import { prevedi } from '../../core/i18n/prevod';

/** Poruka o gresci ispod polja - prikazuje se tek kada je polje dodirnuto. */
@Component({
  selector: 'app-field-error',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (prikazi()) {
      <p class="polje-greska" role="alert">{{ poruka() }}</p>
    }
  `,
  styles: `
    .polje-greska {
      margin: 0.25rem 0 0;
      color: var(--boja-greska);
      font-size: 0.85rem;
    }
  `
})
export class FieldErrorComponent {
  readonly kontrola = input.required<AbstractControl | null>();
  readonly poruke = input<Record<string, string>>({});

  private readonly cd = inject(ChangeDetectorRef);

  constructor() {
    /*
     * Komponenta je OnPush, a „dodirnuto" i „neispravno" nisu signali:
     * bez ovoga se poruka ne bi pojavila kada polje izgubi fokus ili kada
     * forma označi sva polja pri slanju. Svaki događaj kontrole (vrednost,
     * status, touched) zato traži novu proveru prikaza.
     */
    effect((onCleanup) => {
      const k = this.kontrola();
      if (!k) return;

      const pretplata = k.events.subscribe(() => this.cd.markForCheck());
      onCleanup(() => pretplata.unsubscribe());
    });
  }

  prikazi(): boolean {
    const k = this.kontrola();
    return !!k && k.invalid && (k.touched || k.dirty);
  }

  poruka(): string {
    const greske = this.kontrola()?.errors;
    if (!greske) return '';

    const prilagodjene = this.poruke();
    const kljuc = Object.keys(greske)[0];

    return prilagodjene[kljuc] ?? prevedi(PODRAZUMEVANE[kljuc] ?? 'validacija.neispravno');
  }
}

/** Ključevi prevoda za podrazumevane poruke po vrsti greške. */
const PODRAZUMEVANE: Record<string, string> = {
  required: 'validacija.obavezno',
  email: 'validacija.email',
  minlength: 'validacija.prekratko',
  maxlength: 'validacija.predugo',
  pattern: 'validacija.format',
  lozinka: 'validacija.lozinka',
  telefon: 'validacija.telefon',
  nePoklapajuSe: 'validacija.nePoklapajuSe'
};
