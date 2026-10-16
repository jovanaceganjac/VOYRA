import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StatistikaSistema } from '../../../core/models/admin.model';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { porukaGreske } from '../../../core/services/api-error';
import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../../core/i18n/prevod';

/**
 * PREGLED (`/admin`) — stanje servisa, zahtevi na čekanju i ključne brojke.
 *
 * Zahtevi na čekanju su istaknuti jer su jedino što traži odluku
 * administratora; sve ostalo je stanje koje se samo prati.
 */
@Component({
  selector: 'app-admin-pregled',
  standalone: true,
  imports: [RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="odeljak__zaglavlje" data-testid="admin-pregled">
      <div>
        <h2>{{ 'admin.odeljci.pregled' | t }}</h2>
        <p class="odeljak__opis">{{ 'adminPregled.opis' | t }}</p>
      </div>
      <button type="button" class="dugme dugme--sporedno dugme--malo" (click)="ucitaj()">
        {{ 'admin.osvezi' | t }}
      </button>
    </div>

    @if (naCekanju() > 0) {
      <div class="kartica-zahtevi">
        <p class="kartica-zahtevi__broj">{{ naCekanju() }}</p>
        <div>
          <p class="kartica-zahtevi__naslov">
            {{ opisZahteva(naCekanju()) }}
          </p>
        </div>
        <a routerLink="/admin/zahtevi" class="dugme dugme--malo">{{ 'adminPregled.otvoriZahteve' | t }}</a>
      </div>
    }

    @if (greska(); as g) {
      <p class="poruka poruka--greska" role="alert">{{ g }}</p>
    }

    @if (statistika(); as s) {
      <div class="brojevi">
        <div class="broj">
          <span class="broj__vrednost">{{ s.totalUsers }}</span>
          <span class="broj__opis">{{ 'adminPregled.korisnika' | t }}</span>
        </div>
        <div class="broj">
          <span class="broj__vrednost">{{ s.activeUsers }}</span>
          <span class="broj__opis">{{ 'adminPregled.aktivnih' | t }}</span>
        </div>
        <div class="broj">
          <span class="broj__vrednost">{{ s.totalTrips }}</span>
          <span class="broj__opis">{{ 'adminPregled.putovanja' | t }}</span>
        </div>
        <div class="broj">
          <span class="broj__vrednost">{{ s.totalBookings }}</span>
          <span class="broj__opis">{{ 'adminPregled.rezervisanih' | t }}</span>
        </div>
      </div>

      <section class="servisi">
        <div class="servisi__zaglavlje">
          <h2>{{ 'adminPregled.servisi' | t }}</h2>
          <span class="stanje">
            {{ nezdravih() === 0 ? ('adminPregled.sviRade' | t) : ('adminPregled.neOdgovara' | t: { broj: nezdravih() }) }}
          </span>
        </div>

        <ul class="servisi__lista">
          @for (srv of servisi(); track srv.naziv) {
            <li class="servis">
              <span
                class="servis__tacka"
                [class.servis__tacka--dole]="srv.status !== 'UP'"
                aria-hidden="true"></span>
              <span class="servis__naziv">{{ srv.naziv }}</span>
              <span class="servis__vreme">{{ srv.responseTime }} ms</span>
            </li>
          }
        </ul>
      </section>
    } @else if (!greska()) {
      <p class="stanje" role="status">{{ 'adminPregled.ucitavamo' | t }}</p>
    }
  `,
  styles: `
    .kartica-zahtevi {
      display: flex;
      align-items: center;
      gap: var(--razmak-3);
      flex-wrap: wrap;
      padding: var(--razmak-2) var(--razmak-3);
      margin-bottom: var(--razmak-3);
      background: var(--boja-povrsina);
      border: 1px solid var(--boja-primarna);
      border-radius: var(--radijus-veliki);
    }
    .kartica-zahtevi__broj {
      margin: 0;
      font-family: var(--font-naslov);
      font-size: 2.2rem;
      line-height: 1;
      color: var(--boja-primarna);
    }
    .kartica-zahtevi__naslov {
      margin: 0;
      font-weight: 700;
    }
    .kartica-zahtevi a {
      margin-left: auto;
      text-decoration: none;
    }
  `,
  styleUrl: '../admin.css'
})
export class AdminPregledComponent {
  private readonly api = inject(AdminApiService);

  readonly statistika = signal<StatistikaSistema | null>(null);
  readonly naCekanju = signal(0);
  readonly greska = signal<string | null>(null);

  readonly servisi = computed(() => {
    const zdravlje = this.statistika()?.apiHealth;
    if (!zdravlje) return [];

    return Object.entries(zdravlje).map(([naziv, stanje]) => ({ naziv, ...stanje }));
  });

  readonly nezdravih = computed(() => this.servisi().filter((s) => s.status !== 'UP').length);

  constructor() {
    this.ucitaj();
  }

  opisZahteva(broj: number): string {
    return prevediBroj('adminPregled.zahtevCeka', broj);
  }

  ucitaj(): void {
    this.greska.set(null);

    this.api.statistika().subscribe({
      next: (o) => this.statistika.set(o.data),
      error: (err: HttpErrorResponse) =>
        this.greska.set(porukaGreske(err, prevedi('adminPregled.nedostupna')))
    });

    this.api.korisnici().subscribe({
      next: (o) =>
        this.naCekanju.set((o.data ?? []).filter((k) => k.status === 'na_cekanju').length),
      error: () => this.naCekanju.set(0)
    });
  }
}
