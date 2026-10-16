import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi } from '../../core/i18n/prevod';
import { Plan } from '../../core/models/plan.model';
import { nazivMesta } from '../../core/models/grad.model';
import { porukeGreske } from '../../core/services/api-error';
import { AuthService } from '../../core/services/auth.service';
import { PlanApiService } from '../../core/services/plan-api.service';
import { PlanWizardService } from '../../core/services/plan-wizard.service';
import { ToastService } from '../../core/services/toast.service';
import { ItinerarComponent } from '../../shared/components/itinerar';
import { datum } from '../../shared/format';

/**
 * KORAK 4 — plan putovanja (spec §4.6, §4.7).
 *
 * Plan se pravi sa IZABRANIM letom i smeštajem. Filteri iz koraka 2 i 3
 * se namerno ne šalju: server ponovo dobavlja listu i u njoj traži izbor,
 * pa bi sa filterom izabrana ponuda mogla pogrešno da „nestane".
 */
@Component({
  selector: 'app-korak4',
  standalone: true,
  imports: [ItinerarComponent, RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './korak4-plan.html',
  styleUrl: './korak.css'
})
export class Korak4Component {
  private readonly api = inject(PlanApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  readonly wizard = inject(PlanWizardService);
  readonly auth = inject(AuthService);

  readonly datum = datum;
  readonly nazivMesta = nazivMesta;

  readonly plan = signal<Plan | null>(null);
  readonly radi = signal(false);
  readonly cuva = signal(false);
  readonly greske = signal<string[] | null>(null);

  /** Šta je isteklo - poruka i dugme vode na tačan korak. */
  readonly isteklo = signal<'let' | 'smestaj' | null>(null);

  readonly parametri = this.wizard.parametri;
  readonly sacuvano = computed(() => this.plan()?.savedTripId ?? null);

  constructor() {
    const sesija = this.route.snapshot.queryParamMap.get('sesija');

    if (sesija) {
      // Povratak sa prijave: plan se NE generiše ponovo, nego se učitava
      // sačuvana sesija i odmah čuva (spec §5 taska)
      this.ucitajSesiju(sesija, true);
      return;
    }

    const postojeci = this.wizard.plan();

    if (postojeci) {
      this.plan.set(postojeci);
      return;
    }

    this.napravi();
  }

  // ---------------------------------------------------------------
  // Generisanje
  // ---------------------------------------------------------------

  napravi(): void {
    const p = this.parametri();
    if (!p || this.radi()) return;

    this.radi.set(true);
    this.greske.set(null);
    this.isteklo.set(null);

    /*
     * Posle osvežavanja stranice od izbora ostaje samo zapamćen ID (ponude
     * se ne čuvaju). I tada se šalje TAJ ID - inače bi server tiho uzeo
     * preporučenu ponudu umesto one koju je korisnik izabrao.
     */
    const letId = this.wizard.izabraniLet()?.offerId ?? this.wizard.zapamcenLetId();
    const smestajId = this.wizard.izabraniSmestaj()?.id ?? this.wizard.zapamcenSmestajId();

    this.api
      .napraviPlan({
        from: p.from,
        to: p.to,
        // Grad je prava vrednost izbora; IATA kod ide uz njega (§4.2)
        ...(p.fromCityId ? { fromCityId: p.fromCityId } : {}),
        ...(p.toCityId ? { toCityId: p.toCityId } : {}),
        checkIn: p.checkIn,
        checkOut: p.checkOut,
        passengers: p.passengers,
        guests: p.passengers,
        ...(p.budget ? { budget: p.budget } : {}),
        preferences: p.preferences,
        ...(letId ? { selectedFlightOfferId: letId } : {}),
        ...(smestajId ? { selectedAccommodationId: smestajId } : {})
      })
      .subscribe({
        next: (odgovor) => {
          this.radi.set(false);
          this.plan.set(odgovor);
          this.wizard.postaviPlan(odgovor);
        },
        error: (err: HttpErrorResponse) => {
          this.radi.set(false);

          // Ponuda je stvarno istekla (server ju je proverio i kod izvora).
          // Server kaže ŠTA je isteklo - let ili smeštaj - pa se poništava
          // samo taj izbor i korisnik se vraća na tačan korak.
          if (err.status === 410) {
            const sta = err.error?.selection === 'accommodation' ? 'smestaj' : 'let';
            this.isteklo.set(sta);

            if (sta === 'let') this.wizard.ponistiIzborLeta();
            else this.wizard.ponistiIzborSmestaja();

            return;
          }

          this.greske.set(porukeGreske(err, prevedi('korak4.nijeNapravljen')));
        }
      });
  }

  /** Vraća na korak na kom je izbor propao. */
  izaberiPonovo(): void {
    this.router.navigate(['/planiranje', this.isteklo() === 'smestaj' ? 3 : 2]);
  }

  // ---------------------------------------------------------------
  // Čuvanje (spec §9)
  // ---------------------------------------------------------------

  private ucitajSesiju(sessionId: string, odmahSacuvaj: boolean): void {
    this.radi.set(true);

    this.api.sesija(sessionId).subscribe({
      next: (odgovor) => {
        this.radi.set(false);
        this.plan.set(odgovor);
        this.wizard.postaviPlan(odgovor);

        if (odmahSacuvaj && this.auth.isLoggedIn() && !odgovor.savedTripId) {
          this.sacuvaj();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.radi.set(false);

        this.greske.set(
          err.status === 404
            ? [prevedi('korak4.sesijaNePostoji')]
            : porukeGreske(err, prevedi('korak4.nijeUcitan'))
        );
      }
    });
  }

  sacuvaj(): void {
    const trenutni = this.plan();
    if (!trenutni || this.cuva()) return;

    // Gost prvo mora da se prijavi; posle prijave se vraća na isti plan
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/prijava'], {
        queryParams: {
          returnUrl: '/planiranje/4',
          sesija: trenutni.planSessionId
        }
      });
      return;
    }

    this.cuva.set(true);

    this.api.sacuvajSesiju(trenutni.planSessionId).subscribe({
      next: (odgovor) => {
        this.cuva.set(false);
        this.plan.update((p) => (p ? { ...p, savedTripId: odgovor.savedTripId } : p));
        this.wizard.oznaciSacuvano(odgovor.savedTripId);

        this.toast.uspeh(
          prevedi(odgovor.alreadySaved ? 'korak4.vecSacuvano' : 'korak4.sacuvano')
        );
      },
      error: (err: HttpErrorResponse) => {
        this.cuva.set(false);

        this.toast.greska(
          err.status === 404
            ? prevedi('korak4.sesijaIstekla')
            : porukeGreske(err, prevedi('korak4.cuvanjeNeuspelo'))[0]
        );
      }
    });
  }

  // ---------------------------------------------------------------
  // Navigacija
  // ---------------------------------------------------------------

  nazad(): void {
    this.router.navigate(['/planiranje', 3]);
  }

  ispocetka(): void {
    this.wizard.ocisti();
    this.router.navigate(['/planiranje', 1]);
  }
}
