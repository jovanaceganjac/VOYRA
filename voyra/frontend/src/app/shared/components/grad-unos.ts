import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../core/i18n/prevod';
import { Grad, nazivGrada, nazivSaDrzavom, opisAerodroma } from '../../core/models/grad.model';
import { CityApiService, MIN_ZNAKOVA } from '../../core/services/city-api.service';

/**
 * Koliko se čeka posle zadnjeg pritiska tastera.
 *
 * 200 ms je dovoljno da se ne pošalje poziv za svaki znak, a da lista i
 * dalje deluje kao da prati kucanje.
 */
const CEKANJE_MS = 200;

/** Jedinstveni brojač - jedna stranica ima više ovih polja. */
let brojac = 0;

/**
 * UNOS GRADA SA PREDLOZIMA (spec §4.2).
 *
 * Obrazac je ARIA combobox (WAI-ARIA 1.2, „Editable Combobox With List
 * Autocomplete"): polje nosi `role="combobox"` i `aria-expanded`, lista
 * je `role="listbox"` sa `role="option"` stavkama, a aktivna stavka se
 * pokazuje preko `aria-activedescendant` — fokus ostaje u polju, pa
 * čitač ekrana čita i uneti tekst i aktivan predlog.
 *
 * Tastatura: strelice gore i dole kreću se kroz predloge, Enter bira,
 * Esc zatvara listu (drugi Esc briše unos), Tab je napušta.
 *
 * Vrednost NIJE tekst nego ceo grad — stranica iz njega čuva `id`. Time
 * nestaje stara dvosmislenost slobodnog unosa („Beograd (BEG)").
 */
@Component({
  selector: 'app-grad-unos',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="polje grad-unos">
      <label [attr.for]="idPolja()">{{ oznaka() }}</label>

      <input
        #polje
        [attr.id]="idPolja()"
        [attr.data-testid]="'grad-unos-' + idPolja()"
        type="text"
        role="combobox"
        autocomplete="off"
        [attr.placeholder]="placeholder()"
        [attr.aria-expanded]="otvoreno()"
        [attr.aria-controls]="idListe"
        aria-autocomplete="list"
        [attr.aria-activedescendant]="aktivni() >= 0 ? idStavke(aktivni()) : null"
        [attr.aria-describedby]="idPomoci"
        [attr.aria-invalid]="nevalidno() ? 'true' : null"
        [value]="tekst()"
        (input)="promena($any($event.target).value)"
        (keydown)="taster($event)"
        (focus)="naFokus()"
        (blur)="naBlur()" />

      <!-- Uputstvo se čita pri ulasku u polje -->
      <p [attr.id]="idPomoci" class="grad-unos__pomoc">
        {{ 'gradovi.uputstvo' | t: { broj: minZnakova } }}
      </p>

      @if (otvoreno()) {
        <ul
          class="predlozi"
          [attr.id]="idListe"
          [attr.data-testid]="'grad-lista-' + idPolja()"
          role="listbox"
          [attr.aria-label]="oznaka()">
          @for (g of predlozi(); track g.id; let i = $index) {
            <li
              class="predlog"
              [class.predlog--aktivan]="i === aktivni()"
              [attr.id]="idStavke(i)"
              [attr.data-testid]="'grad-opcija-' + idPolja()"
              role="option"
              [attr.aria-selected]="i === aktivni()"
              (mousedown)="izaberiMisem($event, g)"
              (mousemove)="aktivni.set(i)">
              <span class="predlog__naziv">{{ naziv(g) }}</span>
              <!-- Razdvojnik je čist ukras - čitač ekrana ga preskače -->
              <span class="predlog__razdvojnik" aria-hidden="true">&nbsp;&middot;&nbsp;</span>
              <span class="predlog__aerodrom">{{ aerodrom(g) }}</span>
            </li>
          }
        </ul>
      }

      <!-- Stanje pretrage, za čitače ekrana -->
      <p class="vizualno-skriveno" role="status" aria-live="polite">{{ stanje() }}</p>

      @if (otvoreno() && predlozi().length === 0 && !trazi()) {
        <p class="grad-unos__prazno" [attr.data-testid]="'grad-prazno-' + idPolja()">
          {{ 'gradovi.nemaGrada' | t }}
        </p>
      }

      @if (izabran(); as g) {
        @if (g.bezLeta) {
          <p class="grad-unos__napomena">
            {{ 'gradovi.bezLeta' | t: { grad: nazivGrada(g) } }}
          </p>
        } @else if (g.bezAerodroma && g.aerodrom) {
          <p class="grad-unos__napomena" [attr.data-testid]="'grad-transfer-' + idPolja()">
            {{ 'gradovi.transfer' | t: { iata: g.aerodrom.iata, km: udaljenost(g) } }}
          </p>
        }
      }
    </div>
  `,
  styles: `
    .grad-unos {
      position: relative;
    }
    .grad-unos__pomoc,
    .grad-unos__prazno,
    .grad-unos__napomena {
      margin: 0.25rem 0 0;
      font-size: 0.82rem;
      color: var(--boja-tekst-slab);
    }
    .grad-unos__napomena {
      color: var(--boja-tekst);
    }
    .predlozi {
      position: absolute;
      z-index: 20;
      inset-inline: 0;
      top: 100%;
      margin: 0.2rem 0 0;
      padding: 0;
      list-style: none;
      max-height: 17rem;
      overflow-y: auto;
      background: var(--boja-povrsina);
      border: 1px solid var(--boja-ivica);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
    }
    .predlog {
      padding: 0.5rem 0.7rem;
      cursor: pointer;
      /* Dugi nazivi se prelamaju, a ne skraćuju - grad mora da se pročita */
      overflow-wrap: anywhere;
    }
    .predlog__razdvojnik {
      color: var(--boja-tekst-slab);
    }
    .predlog--aktivan {
      background: color-mix(in srgb, var(--boja-primarna) 14%, transparent);
    }
    .predlog__naziv {
      font-weight: 600;
    }
    .predlog__aerodrom {
      font-size: 0.82rem;
      color: var(--boja-tekst-slab);
    }
    .vizualno-skriveno {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `
})
export class GradUnosComponent {
  private readonly api = inject(CityApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly idPolja = input.required<string>();
  /** Prazno = podrazumevani tekst iz rečnika (`gradovi.oznaka`, `gradovi.placeholder`). */
  readonly oznakaUlaz = input('', { alias: 'oznaka' });
  readonly placeholderUlaz = input('', { alias: 'placeholder' });

  readonly oznaka = computed(() => this.oznakaUlaz() || prevedi('gradovi.oznaka'));
  readonly placeholder = computed(() => this.placeholderUlaz() || prevedi('gradovi.placeholder'));

  readonly nazivGrada = nazivGrada;
  readonly nevalidno = input(false);

  /** Dvosmerno: stranica postavlja početni grad i dobija izabran. */
  readonly izabran = model<Grad | null>(null);

  readonly minZnakova = MIN_ZNAKOVA;

  private readonly polje = viewChild<ElementRef<HTMLInputElement>>('polje');

  readonly tekst = signal('');
  readonly predlozi = signal<Grad[]>([]);
  readonly otvoreno = signal(false);
  readonly aktivni = signal(-1);
  readonly trazi = signal(false);

  readonly idListe = `predlozi-${++brojac}`;
  readonly idPomoci = `pomoc-grada-${brojac}`;

  private readonly upiti = new Subject<string>();

  /** Zadnji grad upisan u polje - da se tekst ne prepisuje bez potrebe. */
  private prikazan: string | null = null;

  constructor() {
    this.upiti
      .pipe(
        debounceTime(CEKANJE_MS),
        distinctUntilChanged(),
        // `switchMap` odbacuje odgovor prethodnog upita - inače bi
        // sporiji poziv za „be" mogao da prekrije rezultat za „beog"
        switchMap((q) => this.api.pretrazi(q)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((gradovi) => {
        this.trazi.set(false);
        this.predlozi.set(gradovi);
        this.aktivni.set(gradovi.length > 0 ? 0 : -1);
        this.otvoreno.set(true);
      });

    /*
     * Grad postavljen izvan (iz URL-a ili sačuvanog stanja) upisuje se u
     * polje. `prikazan` pamti šta je već upisano, pa se korisnikov unos
     * ne prepisuje pri svakoj proveri.
     */
    effect(() => {
      const g = this.izabran();

      if (!g) {
        this.prikazan = null;
        return;
      }

      if (g.id !== this.prikazan) {
        this.prikazan = g.id;
        this.tekst.set(nazivSaDrzavom(g));
      }
    });
  }

  // ---------------------------------------------------------------
  // Prikaz
  // ---------------------------------------------------------------

  idStavke(i: number): string {
    return `${this.idListe}-${i}`;
  }

  naziv(g: Grad): string {
    return nazivSaDrzavom(g);
  }

  aerodrom(g: Grad): string {
    return opisAerodroma(g);
  }

  udaljenost(g: Grad): number {
    return Math.round(g.aerodrom?.udaljenostKm ?? 0);
  }

  /** Poruka za čitač ekrana - koliko je predloga ponuđeno. */
  stanje(): string {
    if (this.trazi()) return prevedi('gradovi.trazimo');
    if (!this.otvoreno()) return '';

    const broj = this.predlozi().length;

    if (broj === 0) return prevedi('gradovi.nemaPredloga');

    return prevediBroj('gradovi.predlog', broj);
  }

  // ---------------------------------------------------------------
  // Unos
  // ---------------------------------------------------------------

  promena(vrednost: string): void {
    this.tekst.set(vrednost);

    // Kucanje poništava izbor: vrednost ne sme da zaostane za tekstom
    if (this.izabran()) {
      this.prikazan = null;
      this.izabran.set(null);
    }

    if (vrednost.trim().length < MIN_ZNAKOVA) {
      this.trazi.set(false);
      this.predlozi.set([]);
      this.otvoreno.set(false);
      this.aktivni.set(-1);
      return;
    }

    this.trazi.set(true);
    this.upiti.next(vrednost.trim());
  }

  naFokus(): void {
    if (this.predlozi().length > 0) this.otvoreno.set(true);
  }

  /**
   * Zatvaranje pri izlasku iz polja.
   *
   * Izbor mišem se hvata na `mousedown`, koji ide PRE `blur`, pa se ovde
   * ne gubi klik na predlog.
   */
  naBlur(): void {
    this.otvoreno.set(false);
    this.aktivni.set(-1);

    // Nedovršen unos se vraća na izabran grad, da se tekst i vrednost slažu
    const g = this.izabran();
    if (g) this.tekst.set(nazivSaDrzavom(g));
  }

  taster(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.pomeri(1);
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.pomeri(-1);
        break;

      case 'Home':
        if (this.otvoreno()) {
          e.preventDefault();
          this.postaviAktivnog(0);
        }
        break;

      case 'End':
        if (this.otvoreno()) {
          e.preventDefault();
          this.postaviAktivnog(this.predlozi().length - 1);
        }
        break;

      case 'Enter': {
        const g = this.predlozi()[this.aktivni()];

        if (this.otvoreno() && g) {
          // Enter bira predlog; bez ovoga bi poslao celu formu
          e.preventDefault();
          this.izaberi(g);
        }
        break;
      }

      case 'Escape':
        e.preventDefault();

        if (this.otvoreno()) {
          this.otvoreno.set(false);
          this.aktivni.set(-1);
        } else {
          // Drugi Esc prazni polje - tako radi i pretraga u pregledačima
          this.tekst.set('');
          this.prikazan = null;
          this.izabran.set(null);
          this.predlozi.set([]);
        }
        break;

      case 'Tab':
        this.otvoreno.set(false);
        this.aktivni.set(-1);
        break;

      default:
        break;
    }
  }

  private pomeri(smer: 1 | -1): void {
    const lista = this.predlozi();

    if (lista.length === 0) {
      // Strelica dole ponovo traži kada je lista prazna posle Esc-a
      if (this.tekst().trim().length >= MIN_ZNAKOVA) this.promena(this.tekst());
      return;
    }

    if (!this.otvoreno()) {
      this.otvoreno.set(true);
      this.postaviAktivnog(smer === 1 ? 0 : lista.length - 1);
      return;
    }

    // Kruženje: ispod zadnjeg je prvi, iznad prvog je zadnji
    this.postaviAktivnog((this.aktivni() + smer + lista.length) % lista.length);
  }

  private postaviAktivnog(i: number): void {
    this.aktivni.set(i);
    this.dovediUVid(i);
  }

  /** Aktivna stavka mora da bude vidljiva - fokus je ostao u polju. */
  private dovediUVid(i: number): void {
    document.getElementById(this.idStavke(i))?.scrollIntoView({ block: 'nearest' });
  }

  izaberiMisem(e: MouseEvent, g: Grad): void {
    // Bez ovoga bi `blur` stigao pre izbora i zatvorio listu
    e.preventDefault();
    this.izaberi(g);
  }

  izaberi(g: Grad): void {
    this.prikazan = g.id;
    this.tekst.set(nazivSaDrzavom(g));
    this.izabran.set(g);
    this.otvoreno.set(false);
    this.aktivni.set(-1);
    this.predlozi.set([]);

    this.polje()?.nativeElement.focus();
  }
}
