import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminKorisnik } from '../../../core/models/admin.model';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { porukaGreske } from '../../../core/services/api-error';
import { ToastService } from '../../../core/services/toast.service';
import { datum } from '../../../shared/format';
import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi } from '../../../core/i18n/prevod';

/** Najviše koliko znakova razloga backend prima. */
const MAX_RAZLOG = 500;

/**
 * ZAHTEVI ZA REGISTRACIJU (`/admin/zahtevi`, spec §3.3).
 *
 * Prikazuje samo naloge u statusu `na_cekanju`. Uz odbijanje se može
 * uneti razlog, koji ide u e-poruku korisniku i u revizioni zapis -
 * korisnik tako zna zašto, umesto da samo ostane bez pristupa.
 */
@Component({
  selector: 'app-admin-zahtevi',
  standalone: true,
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="odeljak__zaglavlje">
      <div>
        <h2>{{ 'adminZahtevi.naslov' | t }}</h2>
      </div>
      <button type="button" class="dugme dugme--sporedno dugme--malo" (click)="ucitaj()">
        {{ 'admin.osvezi' | t }}
      </button>
    </div>

    @if (greska(); as g) {
      <p class="poruka poruka--greska" role="alert">{{ g }}</p>
    }

    @if (ucitava()) {
      <p class="stanje" data-testid="zahtevi-ucitava" role="status">{{ 'adminZahtevi.ucitavamo' | t }}</p>
    } @else if (zahtevi().length === 0) {
      <p class="stanje" data-testid="zahtevi-prazno">{{ 'adminZahtevi.nema' | t }}</p>
    } @else {
      <ul class="stavke" data-testid="zahtevi-lista">
        @for (k of zahtevi(); track k._id) {
          <li class="stavka" data-testid="zahtev" [attr.data-korisnicko-ime]="k.korisnickoIme">
            <div class="stavka__telo">
              <p class="stavka__naslov">{{ k.ime }} {{ k.prezime }}</p>
              <p class="stavka__meta">
                {{ k.korisnickoIme }} &middot; {{ k.email }}<br />
                {{ 'adminZahtevi.prijavioSe' | t: { datum: datum(k.createdAt) } }}
              </p>

              @if (odbijaId() === k._id) {
                <div class="razlog">
                  <label [attr.for]="'razlog-' + k._id">
                    {{ 'adminZahtevi.razlog' | t }} <span class="opciono">{{ 'adminZahtevi.razlogOpis' | t }}</span>
                  </label>
                  <textarea
                    [attr.id]="'razlog-' + k._id"
                    rows="2"
                    [maxlength]="maxRazlog"
                    [(ngModel)]="razlog"
                    [attr.aria-describedby]="'brojac-' + k._id"></textarea>
                  <p [attr.id]="'brojac-' + k._id" class="stavka__meta">
                    {{ razlog.length }} / {{ maxRazlog }}
                  </p>
                </div>
              }
            </div>

            <div class="stavka__akcije">
              @if (odbijaId() === k._id) {
                <button
                  type="button"
                  class="dugme dugme--opasno dugme--malo"
                  [disabled]="uToku() === k._id"
                  (click)="odluci(k, 'odbijen')">
                  {{ 'adminZahtevi.potvrdiOdbijanje' | t }}
                </button>
                <button
                  type="button"
                  class="dugme dugme--sporedno dugme--malo"
                  (click)="odustani()">
                  {{ 'admin.odustani' | t }}
                </button>
              } @else {
                <button
                  type="button"
                  class="dugme dugme--malo"
                  data-testid="zahtev-odobri"
                  [disabled]="uToku() === k._id"
                  (click)="odluci(k, 'odobren')">
                  {{ 'adminZahtevi.odobri' | t }}
                </button>
                <button
                  type="button"
                  class="dugme dugme--sporedno dugme--malo"
                  data-testid="zahtev-odbij"
                  [disabled]="uToku() === k._id"
                  (click)="zapocniOdbijanje(k._id)">
                  {{ 'adminZahtevi.odbij' | t }}
                </button>
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .razlog {
      margin-top: var(--razmak-2);
    }
    .razlog label {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .razlog textarea {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--boja-ivica);
      border-radius: 8px;
      background: var(--boja-pozadina);
      color: inherit;
      font: inherit;
      resize: vertical;
    }
    .opciono {
      font-weight: 400;
      color: var(--boja-tekst-slab);
    }
  `,
  styleUrl: '../admin.css'
})
export class AdminZahteviComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  readonly datum = datum;
  readonly maxRazlog = MAX_RAZLOG;

  readonly zahtevi = signal<AdminKorisnik[]>([]);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);

  readonly uToku = signal<string | null>(null);
  /** Id korisnika za kog je otvoreno polje razloga. */
  readonly odbijaId = signal<string | null>(null);

  razlog = '';

  constructor() {
    this.ucitaj();
  }

  ucitaj(): void {
    this.ucitava.set(true);
    this.greska.set(null);

    this.api.korisnici().subscribe({
      next: (o) => {
        this.zahtevi.set((o.data ?? []).filter((k) => k.status === 'na_cekanju'));
        this.ucitava.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.ucitava.set(false);
        this.greska.set(porukaGreske(err, prevedi('adminZahtevi.nisuUcitani')));
      }
    });
  }

  zapocniOdbijanje(id: string): void {
    this.razlog = '';
    this.odbijaId.set(id);
  }

  odustani(): void {
    this.odbijaId.set(null);
    this.razlog = '';
  }

  odluci(k: AdminKorisnik, status: 'odobren' | 'odbijen'): void {
    this.uToku.set(k._id);

    const razlog = status === 'odbijen' ? this.razlog.trim() : '';

    this.api.promeniStatus(k._id, status, razlog || null).subscribe({
      next: (o) => {
        this.uToku.set(null);
        this.odustani();
        this.zahtevi.update((lista) => lista.filter((u) => u._id !== k._id));

        const posta = prevedi(o.obavesten ? 'adminZahtevi.postaPoslata' : 'adminZahtevi.postaNije');

        this.toast.uspeh(
          prevedi(status === 'odobren' ? 'adminZahtevi.odobren' : 'adminZahtevi.odbijen', {
            ime: k.korisnickoIme,
            posta
          })
        );
      },
      error: (err: HttpErrorResponse) => {
        this.uToku.set(null);
        this.toast.greska(porukaGreske(err, prevedi('adminZahtevi.odlukaNije')));
      }
    });
  }
}
