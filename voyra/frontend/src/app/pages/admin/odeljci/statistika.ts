import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { StatistikaSistema } from '../../../core/models/admin.model';
import { RevizioniZapis } from '../../../core/models/sadrzaj.model';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { porukaGreske } from '../../../core/services/api-error';
import { datum } from '../../../shared/format';
import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi, prevediIli } from '../../../core/i18n/prevod';

/** Akcije koje se filtriraju - isti spisak kao enum u `AuditLog`-u. */
const AKCIJE = [
  'APPROVE_REGISTRATION',
  'REJECT_REGISTRATION',
  'BLOCK_USER',
  'UNBLOCK_USER',
  'UPDATE_USER_STATUS',
  'CHANGE_USER_ROLE',
  'DELETE_USER',
  'CREATE_DESTINATION',
  'UPDATE_DESTINATION',
  'DELETE_DESTINATION',
  'REORDER_DESTINATIONS',
  'CREATE_ATTRACTION',
  'UPDATE_ATTRACTION',
  'DELETE_ATTRACTION',
  'CREATE_CATEGORY',
  'UPDATE_CATEGORY',
  'DELETE_CATEGORY',
  'EDIT_PLAN',
  'REGENERATE_PLAN',
  'PLAN_TRIP',
  'BOOK_TRIP'
];

/**
 * STATISTIKA I REVIZIONI ZAPISI (`/admin/statistika`, spec §3.3, §4.9).
 *
 * Ruta `GET /api/admin/logs` postoji sada, ali do sada nije imala
 * ekran - svaka admin radnja je bila zabeležena, a nevidljiva.
 */
@Component({
  selector: 'app-admin-statistika',
  standalone: true,
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="odeljak__zaglavlje">
      <div>
        <h2>{{ 'admin.odeljci.statistika' | t }}</h2>
        <p class="odeljak__opis">{{ 'adminStatistika.opis' | t }}</p>
      </div>
      <button type="button" class="dugme dugme--sporedno dugme--malo" (click)="ucitaj()">
        {{ 'admin.osvezi' | t }}
      </button>
    </div>

    @if (statistika(); as s) {
      <div class="brojevi">
        <div class="broj">
          <span class="broj__vrednost">{{ s.totalUsers }}</span>
          <span class="broj__opis">{{ 'adminPregled.korisnika' | t }}</span>
        </div>
        <div class="broj">
          <span class="broj__vrednost">{{ s.totalTrips }}</span>
          <span class="broj__opis">{{ 'adminPregled.putovanja' | t }}</span>
        </div>
        <div class="broj">
          <span class="broj__vrednost">{{ s.totalBookings }}</span>
          <span class="broj__opis">{{ 'adminPregled.rezervisanih' | t }}</span>
        </div>
        <div class="broj">
          <span class="broj__vrednost">{{ s.responseTime }}</span>
          <span class="broj__opis">{{ 'adminStatistika.msOdziv' | t }}</span>
        </div>
      </div>

      <div class="forma-red">
        <div>
          <h3 class="stavka__naslov">{{ 'adminStatistika.korisniciPoStatusu' | t }}</h3>
          <ul class="stavka__meta">
            @for (r of poStatusu(); track r.kljuc) {
              <li>{{ opisStatusa('nalog', r.kljuc) }}: {{ r.broj }}</li>
            }
          </ul>
        </div>
        <div>
          <h3 class="stavka__naslov">{{ 'adminStatistika.putovanjaPoStatusu' | t }}</h3>
          <ul class="stavka__meta">
            @for (r of poStatusuPutovanja(); track r.kljuc) {
              <li>{{ opisStatusa('putovanje', r.kljuc) }}: {{ r.broj }}</li>
            }
            @if (poStatusuPutovanja().length === 0) {
              <li>{{ 'adminStatistika.nemaPutovanja' | t }}</li>
            }
          </ul>
        </div>
      </div>
    }

    <section class="zapisi">
      <h3>{{ 'adminStatistika.zapisi' | t }}</h3>

      <div class="korisnici__alatke">
        <select [attr.aria-label]="'adminStatistika.filterAkcije' | t" [ngModel]="akcija()" (ngModelChange)="postaviAkciju($event)">
          <option value="">{{ 'adminStatistika.sveAkcije' | t }}</option>
          @for (a of akcije; track a) {
            <option [value]="a">{{ a }}</option>
          }
        </select>

        <input
          type="date"
          [attr.aria-label]="'adminStatistika.odDatuma' | t"
          [ngModel]="od()"
          (ngModelChange)="postaviOd($event)" />

        <input
          type="date"
          [attr.aria-label]="'adminStatistika.doDatuma' | t"
          [ngModel]="do_()"
          (ngModelChange)="postaviDo($event)" />

        <input
          type="search"
          [placeholder]="'adminStatistika.idAdmina' | t"
          [attr.aria-label]="'adminStatistika.filterAdmina' | t"
          [ngModel]="adminId()"
          (ngModelChange)="postaviAdmina($event)" />
      </div>

      @if (greskaZapisa(); as g) {
        <p class="poruka poruka--greska" role="alert">{{ g }}</p>
      } @else if (ucitavaZapise()) {
        <p class="stanje" role="status">{{ 'adminStatistika.ucitavamo' | t }}</p>
      } @else if (zapisi().length === 0) {
        <p class="stanje">{{ 'adminStatistika.nemaZapisa' | t }}</p>
      } @else {
        <ul class="stavke">
          @for (z of zapisi(); track z._id) {
            <li class="stavka" [class.stavka--neaktivna]="z.status === 'FAILURE'">
              <div class="stavka__telo">
                <p class="stavka__naslov">
                  {{ z.action }}
                  @if (z.status === 'FAILURE') {
                    <span class="oznaka">{{ 'adminStatistika.neuspeh' | t }}</span>
                  }
                </p>
                <p class="stavka__meta">
                  {{ datum(z.timestamp) }}
                  @if (z.target) {
                    &middot; {{ 'adminStatistika.nad' | t: { cilj: z.target } }}
                  }
                  @if (z.adminId) {
                    &middot; {{ 'adminStatistika.adminId' | t: { id: z.adminId } }}
                  }
                  @if (z.errorMessage) {
                    <br />{{ z.errorMessage }}
                  }
                </p>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .zapisi {
      margin-top: var(--razmak-4);
    }
    .zapisi h3 {
      margin: 0 0 var(--razmak-2);
    }
    .zapisi .korisnici__alatke {
      margin-bottom: var(--razmak-3);
    }
    .stavka__meta ul,
    ul.stavka__meta {
      margin: 0.2rem 0 0;
      padding-left: 1.1rem;
    }
  `,
  styleUrl: '../admin.css'
})
export class AdminStatistikaComponent {
  private readonly api = inject(AdminApiService);

  readonly datum = datum;
  readonly akcije = AKCIJE;

  readonly statistika = signal<StatistikaSistema | null>(null);
  readonly zapisi = signal<RevizioniZapis[]>([]);

  readonly ucitavaZapise = signal(true);
  readonly greskaZapisa = signal<string | null>(null);

  readonly akcija = signal('');
  readonly od = signal('');
  readonly do_ = signal('');
  readonly adminId = signal('');

  /** Naziv statusa na aktivnom jeziku; stare vrednosti (npr. `draft`) ostaju kakve jesu. */
  opisStatusa(vrsta: 'nalog' | 'putovanje', kljuc: string): string {
    return prevediIli(`statusi.${vrsta}.${kljuc}`, kljuc);
  }

  readonly poStatusu = computed(() =>
    Object.entries(this.statistika()?.usersByStatus ?? {}).map(([kljuc, broj]) => ({
      kljuc,
      broj
    }))
  );

  readonly poStatusuPutovanja = computed(() =>
    Object.entries(this.statistika()?.tripsByStatus ?? {}).map(([kljuc, broj]) => ({
      kljuc,
      broj
    }))
  );

  constructor() {
    this.ucitaj();
  }

  ucitaj(): void {
    this.api.statistika().subscribe({
      next: (o) => this.statistika.set(o.data),
      error: () => this.statistika.set(null)
    });

    this.ucitajZapise();
  }

  postaviAkciju(v: string): void {
    this.akcija.set(v);
    this.ucitajZapise();
  }

  postaviOd(v: string): void {
    this.od.set(v);
    this.ucitajZapise();
  }

  postaviDo(v: string): void {
    this.do_.set(v);
    this.ucitajZapise();
  }

  postaviAdmina(v: string): void {
    this.adminId.set(v);
    this.ucitajZapise();
  }

  ucitajZapise(): void {
    this.ucitavaZapise.set(true);
    this.greskaZapisa.set(null);

    this.api
      .zapisi({
        action: this.akcija(),
        adminId: this.adminId().trim(),
        from: this.od(),
        to: this.do_(),
        limit: 50
      })
      .subscribe({
        next: (o) => {
          this.zapisi.set(o.data ?? []);
          this.ucitavaZapise.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.ucitavaZapise.set(false);
          this.zapisi.set([]);
          this.greskaZapisa.set(porukaGreske(err, prevedi('adminStatistika.nedostupni')));
        }
      });
  }
}
