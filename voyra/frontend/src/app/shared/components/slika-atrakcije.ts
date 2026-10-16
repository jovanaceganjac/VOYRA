import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { Atrakcija } from '../../core/models/plan.model';
import { TPipe } from '../../core/i18n/t.pipe';

/**
 * Znak po kategoriji, kada slike nema. Inline SVG, bez stok fotografija
 * i bez slika sa drugih sajtova.
 */
const ZNAK: Record<string, string> = {
  muzeji: 'M4 20h16M6 20V9l6-4 6 4v11M10 20v-5h4v5',
  kultura: 'M4 20h16M6 20V8M10 20V8M14 20V8M18 20V8M3 8h18L12 3 3 8z',
  priroda: 'M12 21V12M12 12 6 6m6 6 6-6M12 12 8 14m4-2 4 2',
  gastronomija: 'M7 3v8a3 3 0 0 0 6 0V3M10 11v10M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
  nocni_zivot: 'M4 5h16l-8 8v6m-3 0h6M6 9h12',
  soping: 'M5 8h14l-1 12H6L5 8zm3 0V6a4 4 0 0 1 8 0v2'
};

const PODRAZUMEVANI_ZNAK = 'M4 19h16M6 19V10l6-5 6 5v9';

/**
 * Slika atrakcije sa Wikimedia Commons-a (spec §4.5 prikaz).
 *
 * Slika se ne preuzima na server: prikazuje se sa `upload.wikimedia.org`,
 * pa uz nju obavezno ide potpis sa vezom ka izvoru. Odnos stranica je
 * fiksan, da se lista ne pomera dok se slike učitavaju.
 */
@Component({
  selector: 'app-slika-atrakcije',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="slika" [class.slika--mala]="mala()">
      @if (prikaziSliku()) {
        <img
          class="slika__img"
          [src]="atrakcija().image!.url"
          [alt]="atrakcija().name"
          [width]="atrakcija().image!.width || null"
          [height]="atrakcija().image!.height || null"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          (error)="pukla.set(true)"
        />

        @if (!mala() && izvor()) {
          <figcaption class="slika__potpis">
            <a [href]="izvor()" target="_blank" rel="noopener noreferrer">
              {{ 'plan.slika' | t: { autor: atrakcija().image!.credit || 'Wikimedia Commons' } }}
            </a>
          </figcaption>
        }
      } @else {
        <div class="slika__znak" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path [attr.d]="znak()" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      }
    </figure>
  `,
  styles: `
    .slika {
      margin: 0;
      /* Fiksan odnos stranica - lista ne skače dok se slike učitavaju */
      aspect-ratio: 4 / 3;
      width: 100%;
      overflow: hidden;
      border-radius: 10px;
      background: var(--boja-povrsina-2);
      position: relative;
    }
    .slika--mala {
      width: 120px;
      flex: 0 0 120px;
    }
    .slika__img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .slika__potpis {
      position: absolute;
      inset: auto 0 0 0;
      padding: 2px 6px;
      font-size: 0.7rem;
      line-height: 1.4;
      background: color-mix(in srgb, #000 55%, transparent);
    }
    .slika__potpis a {
      color: #fff;
      text-decoration: none;
    }
    .slika__potpis a:hover,
    .slika__potpis a:focus-visible {
      text-decoration: underline;
    }
    .slika__znak {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      color: var(--boja-ivica-jaka);
    }
    .slika__znak svg {
      width: 40%;
      max-width: 56px;
      height: auto;
    }
  `
})
export class SlikaAtrakcijeComponent {
  readonly atrakcija = input.required<Atrakcija>();

  /** Sličica uz tekst (u planu); bez potpisa, koji stoji uz opis. */
  readonly mala = input(false);

  /** Slika sa izvora se nije učitala - pada se na znak po kategoriji. */
  readonly pukla = signal(false);

  readonly prikaziSliku = computed(() => Boolean(this.atrakcija().image?.url) && !this.pukla());

  readonly izvor = computed(() => this.atrakcija().image?.sourceUrl || null);

  readonly znak = computed(() => {
    const a = this.atrakcija();
    const kategorije = a.categories?.length ? a.categories : a.category ? [a.category] : [];

    for (const k of kategorije) {
      if (ZNAK[k]) return ZNAK[k];
    }

    return PODRAZUMEVANI_ZNAK;
  });
}
