import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { TPipe } from '../../core/i18n/t.pipe';
import { PlanWizardService } from '../../core/services/plan-wizard.service';

/** Nazivi koraka su u rečniku: `carobnjak.koraci.<broj>`. */
const KORACI = [{ broj: 1 }, { broj: 2 }, { broj: 3 }, { broj: 4 }] as const;

/**
 * Okvir čarobnjaka (spec §4.2): traka napretka i mesto za korak.
 *
 * Korak stoji u URL-u, pa dugme „Nazad" u pregledaču radi prirodno, a
 * osvežavanje stranice ne vraća korisnika na početak.
 */
@Component({
  selector: 'app-wizard',
  standalone: true,
  imports: [RouterOutlet, RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wizard.html',
  styleUrl: './wizard.css'
})
export class WizardComponent {
  private readonly router = inject(Router);
  private readonly wizard = inject(PlanWizardService);

  readonly koraci = KORACI;

  /** Trenutni korak se čita iz URL-a, da traka prati i „Nazad". */
  private readonly putanja = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  readonly trenutni = computed(() => {
    const m = this.putanja().match(/\/planiranje\/(\d)/);
    return m ? Number(m[1]) : 1;
  });

  /** Završen korak je link; nezavršen nije, da guard ne mora da vraća. */
  readonly dostupan = computed(() => this.wizard.prviNezavrsenKorak());

  jeDostupan(broj: number): boolean {
    return broj <= this.dostupan();
  }

  jeZavrsen(broj: number): boolean {
    return broj < this.trenutni() && this.jeDostupan(broj);
  }
}
