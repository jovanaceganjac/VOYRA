import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../core/i18n/prevod';
import { Let } from '../../core/models/plan.model';
import { nazivMesta } from '../../core/models/grad.model';
import { porukaGreske } from '../../core/services/api-error';
import { PlanWizardService } from '../../core/services/plan-wizard.service';
import { PreferencijeService } from '../../core/services/preferencije.service';
import { FilteriLeta, WizardApiService } from '../../core/services/wizard-api.service';
import { datum, novac, presedanja, trajanje, vreme } from '../../shared/format';

/** Prioriteti sa objašnjenjem u rečniku (`korak2.objasnjenje.*`) - vidljiv trag §6.1. */
const SA_OBJASNJENJEM = ['najjeftinije', 'najbrze', 'balans'];

/**
 * KORAK 2 — izbor leta (spec §4.3).
 *
 * Lista je već rangirana na serveru (FAZA 1); ovde se prikazuje, filtrira
 * i bira. Preporučena ponuda je unapred izabrana.
 */
@Component({
  selector: 'app-korak2',
  standalone: true,
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './korak2-let.html',
  styleUrl: './korak.css'
})
export class Korak2Component {
  private readonly api = inject(WizardApiService);
  private readonly router = inject(Router);

  readonly wizard = inject(PlanWizardService);
  readonly preferencije = inject(PreferencijeService);

  readonly datum = datum;
  readonly vreme = vreme;
  readonly trajanje = trajanje;
  readonly novac = novac;
  readonly presedanja = presedanja;
  readonly nazivMesta = nazivMesta;

  readonly ponude = signal<Let[]>([]);
  readonly izvor = signal<string | null>(null);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);

  /** Id ponude čiji su segmenti otvoreni. */
  readonly otvoreniSegmenti = signal<string | null>(null);

  // Filteri (§4.3)
  readonly maxStops = signal<string>('');
  readonly departureFrom = signal<string>('');
  readonly departureTo = signal<string>('');

  readonly prioritet = signal<string>('balans');

  readonly parametri = this.wizard.parametri;
  readonly izabrani = this.wizard.izabraniLet;

  readonly demoPodaci = computed(() => {
    const s = this.izvor();
    return s === 'mock' || s === 'mock-fallback';
  });

  readonly objasnjenje = computed(() =>
    SA_OBJASNJENJEM.includes(this.prioritet()) ? prevedi(`korak2.objasnjenje.${this.prioritet()}`) : ''
  );

  brojPutnika(broj: number): string {
    return prevediBroj('carobnjak.putnik', broj);
  }

  brojPonuda(broj: number): string {
    return prevediBroj('korak2.ponuda', broj);
  }

  readonly mozeDalje = computed(() => this.izabrani() !== null || this.wizard.bezLeta());

  /** Svaka promena filtera otkazuje prethodni zahtev (§3.2). */
  private readonly trazi = new Subject<FilteriLeta>();

  constructor() {
    const p = this.parametri();

    if (p) this.prioritet.set(p.preferences.transportPriority);

    this.trazi
      .pipe(
        switchMap((filteri) => {
          this.ucitava.set(true);
          this.greska.set(null);

          const par = this.parametri()!;

          return this.api.letovi(
            {
              from: par.from,
              to: par.to,
              // Gradovi nose koordinate - server ih prosleđuje izvorima
              fromCityId: par.fromCityId,
              toCityId: par.toCityId,
              checkIn: par.checkIn,
              checkOut: par.checkOut,
              passengers: par.passengers,
              budget: par.budget
            },
            { transportPriority: this.prioritet() as 'najjeftinije' | 'najbrze' | 'balans' },
            filteri
          );
        }),
        takeUntilDestroyed()
      )
      .subscribe({
        next: (o) => {
          this.ucitava.set(false);
          this.ponude.set(o.data);
          this.izvor.set(o.source);
          this.oznaciPocetniIzbor(o.data);
        },
        error: (err: HttpErrorResponse) => {
          this.ucitava.set(false);
          this.ponude.set([]);
          this.greska.set(porukaGreske(err, prevedi('korak2.greska')));
        }
      });

    this.pretrazi();
  }

  /**
   * Preporučena ponuda je unapred izabrana (§4.3). Posle osvežavanja
   * stranice vraća se raniji izbor, ako ga ima u novoj listi.
   */
  private oznaciPocetniIzbor(ponude: Let[]): void {
    if (ponude.length === 0) return;

    const zapamcen = this.wizard.zapamcenLetId();
    const raniji = zapamcen ? ponude.find((f) => f.offerId === zapamcen) : null;

    if (raniji) {
      // Isti izbor kao pre osvežavanja - ne dira kasnije korake
      this.wizard.vratiLet(raniji);
      return;
    }

    if (this.wizard.bezLeta()) return;

    const preporucen = ponude.find((f) => f.recommended) ?? ponude[0];
    if (!this.izabrani()) this.wizard.postaviLet(preporucen);
  }

  pretrazi(): void {
    if (!this.parametri()) return;

    this.trazi.next({
      maxStops: this.maxStops() === '' ? null : Number(this.maxStops()),
      departureFrom: this.departureFrom() || null,
      departureTo: this.departureTo() || null
    });
  }

  promeniPrioritet(p: string): void {
    this.prioritet.set(p);
    this.pretrazi();
  }

  izaberi(let_: Let): void {
    this.wizard.postaviLet(let_);
  }

  prebaciSegmente(id: string): void {
    this.otvoreniSegmenti.update((t) => (t === id ? null : id));
  }

  nastaviBezLeta(): void {
    this.wizard.nastaviBezLeta();
    this.router.navigate(['/planiranje', 3]);
  }

  nazad(): void {
    this.router.navigate(['/planiranje', 1]);
  }

  dalje(): void {
    if (!this.mozeDalje()) return;
    this.router.navigate(['/planiranje', 3]);
  }

  /** Udeo činioca u ukupnoj oceni, za traku bodovanja. */
  udeo(let_: Let, deo: 'cena' | 'trajanje' | 'presedanja'): number {
    const b = let_.scoreBreakdown;
    if (!b) return 0;

    const ukupno = b.cena + b.trajanje + b.presedanja;
    if (ukupno <= 0) return deo === 'cena' ? 100 : 0;

    return Math.round((b[deo] / ukupno) * 100);
  }
}
