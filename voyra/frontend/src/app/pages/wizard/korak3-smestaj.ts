import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../core/i18n/prevod';
import { Smestaj } from '../../core/models/plan.model';
import { nazivMesta } from '../../core/models/grad.model';
import { porukaGreske } from '../../core/services/api-error';
import { PlanWizardService } from '../../core/services/plan-wizard.service';
import { PreferencijeService } from '../../core/services/preferencije.service';
import { FilteriSmestaja, WizardApiService } from '../../core/services/wizard-api.service';
import { datum, novac, razdaljina } from '../../shared/format';

const OCENE = [
  // Naziv prazne vrednosti je u rečniku (`korak3.sveOcene`)
  { vrednost: '', naziv: '' },
  { vrednost: '3', naziv: '3+' },
  { vrednost: '4', naziv: '4+' },
  { vrednost: '4.5', naziv: '4,5+' }
];

/**
 * KORAK 3 — izbor smeštaja (spec §4.4).
 *
 * Uz zahtev ide i cena izabranog leta, pa server preporučuje ponudu koja
 * staje u PREOSTALI budžet (§6.1). Aplikacija smeštaj ne rezerviše —
 * rezervacija se završava na Booking.com-u.
 */
@Component({
  selector: 'app-korak3',
  standalone: true,
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './korak3-smestaj.html',
  styleUrl: './korak.css'
})
export class Korak3Component {
  private readonly api = inject(WizardApiService);
  private readonly router = inject(Router);

  readonly wizard = inject(PlanWizardService);
  readonly preferencije = inject(PreferencijeService);
  readonly i18n = inject(I18nService);

  readonly datum = datum;
  readonly novac = novac;
  readonly razdaljina = razdaljina;
  readonly nazivMesta = nazivMesta;
  readonly ocene = OCENE;

  readonly ponude = signal<Smestaj[]>([]);
  readonly izvor = signal<string | null>(null);
  readonly upozorenja = signal<string[]>([]);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);

  // Filteri (§4.4)
  readonly tipovi = signal<string[]>([]);
  readonly minOcena = signal<string>('');
  readonly maxCena = signal<string>('');

  readonly parametri = this.wizard.parametri;
  readonly izabrani = this.wizard.izabraniSmestaj;
  readonly let_ = this.wizard.izabraniLet;

  readonly demoPodaci = computed(() => {
    const s = this.izvor();
    return s === 'mock' || s === 'mock-fallback';
  });

  readonly mozeDalje = computed(() => this.izabrani() !== null || this.wizard.bezSmestaja());

  /** Preostali budžet - ista računica kao na serveru, samo za prikaz. */
  readonly preostaliBudzet = computed(() => {
    const p = this.parametri();
    if (!p?.budget) return null;

    const cenaLeta = this.let_() ? Number(this.let_()!.priceEUR ?? this.let_()!.price ?? 0) : 0;

    return Math.max(0, p.budget - cenaLeta);
  });

  private readonly trazi = new Subject<FilteriSmestaja>();

  constructor() {
    const p = this.parametri();
    if (p) this.tipovi.set([...p.preferences.accommodationTypes]);

    this.trazi
      .pipe(
        switchMap((filteri) => {
          this.ucitava.set(true);
          this.greska.set(null);

          const par = this.parametri()!;
          const let_ = this.let_();

          return this.api.smestaj(
            {
              to: par.to,
              toCityId: par.toCityId,
              checkIn: par.checkIn,
              checkOut: par.checkOut,
              guests: par.passengers,
              budget: par.budget,
              flightPrice: let_ ? Number(let_.priceEUR ?? let_.price ?? 0) : 0
            },
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
          this.upozorenja.set(o.warnings ?? []);
          this.oznaciPocetniIzbor(o.data);
        },
        error: (err: HttpErrorResponse) => {
          this.ucitava.set(false);
          this.ponude.set([]);
          this.greska.set(porukaGreske(err, prevedi('korak3.greska')));
        }
      });

    this.obnoviLetPaPretrazi();
  }

  /**
   * Posle osvežavanja stranice od izabranog leta ostaje samo id, pa se
   * lista letova jednom ponovo dovlači: bez cene leta preostali budžet
   * (§6.1) i preporuka smeštaja bili bi pogrešni.
   */
  private obnoviLetPaPretrazi(): void {
    const p = this.parametri();
    const zapamcen = this.wizard.zapamcenLetId();

    if (!p || this.let_() || !zapamcen || this.wizard.bezLeta()) {
      this.pretrazi();
      return;
    }

    this.ucitava.set(true);

    this.api
      .letovi(
        {
          from: p.from,
          to: p.to,
          checkIn: p.checkIn,
          checkOut: p.checkOut,
          passengers: p.passengers,
          budget: p.budget
        },
        { transportPriority: p.preferences.transportPriority }
      )
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (o) => {
          const raniji = o.data.find((f) => f.offerId === zapamcen);

          if (!raniji) {
            // Ponuda je u međuvremenu istekla - let se bira ponovo (§4.8)
            this.wizard.ponistiIzborLeta();
            this.router.navigate(['/planiranje', 2]);
            return;
          }

          this.wizard.vratiLet(raniji);
          this.pretrazi();
        },
        // Ako letovi ne mogu da se dovuku, smeštaj se i dalje prikazuje
        error: () => this.pretrazi()
      });
  }

  private oznaciPocetniIzbor(ponude: Smestaj[]): void {
    if (ponude.length === 0) return;

    const zapamcen = this.wizard.zapamcenSmestajId();
    const raniji = zapamcen ? ponude.find((s) => s.id === zapamcen) : null;

    if (raniji) {
      this.wizard.vratiSmestaj(raniji);
      return;
    }

    if (this.wizard.bezSmestaja()) return;

    const preporucen = ponude.find((s) => s.recommended) ?? ponude[0];
    if (!this.izabrani()) this.wizard.postaviSmestaj(preporucen);
  }

  pretrazi(): void {
    if (!this.parametri()) return;

    this.trazi.next({
      accommodationTypes: this.tipovi(),
      minAccommodationRating: this.minOcena() === '' ? null : Number(this.minOcena()),
      maxPricePerNight: this.maxCena() === '' ? null : Number(this.maxCena())
    });
  }

  brojGostiju(broj: number): string {
    return prevediBroj('carobnjak.gost', broj);
  }

  brojNoci(broj: number): string {
    return prevediBroj('carobnjak.noc', broj);
  }

  jeTipIzabran(kod: string): boolean {
    return this.tipovi().includes(kod);
  }

  prebaciTip(kod: string): void {
    const trenutno = this.tipovi();

    this.tipovi.set(
      trenutno.includes(kod) ? trenutno.filter((t) => t !== kod) : [...trenutno, kod]
    );

    this.pretrazi();
  }

  izaberi(s: Smestaj): void {
    this.wizard.postaviSmestaj(s);
  }

  nastaviBezSmestaja(): void {
    this.wizard.nastaviBezSmestaja();
    this.router.navigate(['/planiranje', 4]);
  }

  nazad(): void {
    this.router.navigate(['/planiranje', 2]);
  }

  dalje(): void {
    if (!this.mozeDalje()) return;
    this.router.navigate(['/planiranje', 4]);
  }

  udeo(s: Smestaj, deo: 'cena' | 'distanca' | 'ocena'): number {
    const b = s.scoreBreakdown;
    if (!b) return 0;

    const ukupno = b.cena + b.distanca + b.ocena;
    if (ukupno <= 0) return deo === 'cena' ? 100 : 0;

    return Math.round((b[deo] / ukupno) * 100);
  }
}
