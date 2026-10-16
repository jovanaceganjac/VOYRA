import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Kategorija } from '../../../core/models/sadrzaj.model';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { porukaGreske } from '../../../core/services/api-error';
import { ToastService } from '../../../core/services/toast.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../../core/i18n/prevod';

const VREME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

/**
 * KATEGORIJE INTERESOVANJA (`/admin/kategorije`, spec §3.3, §9).
 *
 * Ključ se zadaje samo pri kreiranju i posle se ne menja: sačuvana
 * putovanja ga već nose, pa bi preimenovanje razvezalo stare planove.
 * Zato se i gašenje radi meko - kategorija nestaje iz ponude, ali stari
 * planovi nastavljaju da rade.
 */
@Component({
  selector: 'app-admin-kategorije',
  standalone: true,
  imports: [ReactiveFormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="odeljak__zaglavlje">
      <div>
        <h2>{{ 'adminKategorije.naslov' | t }}</h2>
      </div>
      <button type="button" class="dugme dugme--sporedno dugme--malo" (click)="ucitaj()">
        {{ 'admin.osvezi' | t }}
      </button>
    </div>

    <form class="forma-kartica" [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <h3>{{ izmenaKljuc() ? ('adminKategorije.izmena' | t: { kljuc: izmenaKljuc() }) : ('adminKategorije.nova' | t) }}</h3>

      <div class="forma-red">
        @if (!izmenaKljuc()) {
          <div class="polje">
            <label for="kat-kljuc">{{ 'adminKategorije.kljuc' | t }} <span class="opciono">{{ 'adminKategorije.kljucOpis' | t }}</span></label>
            <input id="kat-kljuc" type="text" formControlName="kljuc" [placeholder]="'adminKategorije.kljucPrimer' | t" />
          </div>
        }

        <div class="polje">
          <label for="kat-naziv">{{ 'adminAtrakcije.naziv' | t }}</label>
          <input id="kat-naziv" type="text" formControlName="naziv" maxlength="60" />
        </div>

        <div class="polje">
          <label for="kat-trajanje">{{ 'adminAtrakcije.trajanje' | t }}</label>
          <input id="kat-trajanje" type="number" min="15" max="600" formControlName="trajanjePoseteMin" />
        </div>

        <div class="polje">
          <label for="kat-od">{{ 'adminAtrakcije.otvara' | t }}</label>
          <input id="kat-od" type="text" formControlName="otvara" placeholder="09:00" />
        </div>

        <div class="polje">
          <label for="kat-do">{{ 'adminAtrakcije.zatvara' | t }} <span class="opciono">{{ 'adminKategorije.zatvaraOpis' | t }}</span></label>
          <input id="kat-do" type="text" formControlName="zatvara" placeholder="17:00" />
        </div>
      </div>

      <div class="polje">
        <label for="kat-kinds">
          {{ 'adminKategorije.otm' | t }} <span class="opciono">{{ 'adminKategorije.zarez' | t }}</span>
        </label>
        <input id="kat-kinds" type="text" formControlName="kinds" placeholder="museums, cultural" />
      </div>

      <div class="polje">
        <label for="kat-geo">
          {{ 'adminKategorije.geo' | t }} <span class="opciono">{{ 'adminKategorije.zarez' | t }}</span>
        </label>
        <input
          id="kat-geo"
          type="text"
          formControlName="geo"
          placeholder="tourism.sights, entertainment.museum" />
      </div>

      <div class="polje">
        <label for="kat-opis">{{ 'adminKategorije.opisPolje' | t }} <span class="opciono">{{ 'adminKategorije.opisVidi' | t }}</span></label>
        <textarea id="kat-opis" rows="2" formControlName="opis" maxlength="300"></textarea>
      </div>

      @if (greskaForme(); as g) {
        <p class="poruka poruka--greska" role="alert">{{ g }}</p>
      }

      @if (greskeServera().length > 0) {
        <ul class="poruka poruka--greska" role="alert">
          @for (g of greskeServera(); track g) {
            <li class="poruka__stavka">{{ g }}</li>
          }
        </ul>
      }

      <div class="stavka__akcije">
        <button type="submit" class="dugme dugme--malo" [disabled]="cuva()">
          {{ (izmenaKljuc() ? 'adminDestinacije.sacuvajIzmenu' : 'adminKategorije.dodajKategoriju') | t }}
        </button>
        @if (izmenaKljuc()) {
          <button type="button" class="dugme dugme--sporedno dugme--malo" (click)="odustani()">
            {{ 'admin.odustani' | t }}
          </button>
        }
      </div>
    </form>

    @if (greska(); as g) {
      <p class="poruka poruka--greska" role="alert">{{ g }}</p>
    }

    @if (ucitava()) {
      <p class="stanje" role="status">{{ 'adminKategorije.ucitavamo' | t }}</p>
    } @else {
      <ul class="stavke">
        @for (k of kategorije(); track k.kljuc) {
          <li class="stavka" [class.stavka--neaktivna]="!k.aktivna">
            <div class="stavka__telo">
              <p class="stavka__naslov">
                {{ k.naziv }} <span class="oznaka">{{ k.kljuc }}</span>
                @if (!k.aktivna) {
                  <span class="oznaka">{{ 'adminAtrakcije.ugasena' | t }}</span>
                }
              </p>
              <p class="stavka__meta">
                {{ k.trajanjePoseteMin }} min &middot; {{ k.radnoVreme.open }}&ndash;{{
                  k.radnoVreme.close
                }}
                <br />{{ k.eksterneKategorije.join(', ') }}
                @if (k.opis) {
                  <br />{{ k.opis }}
                }
              </p>
            </div>

            <div class="stavka__akcije">
              <button type="button" class="dugme dugme--malo" (click)="zapocniIzmenu(k)">
                {{ 'admin.izmeni' | t }}
              </button>

              @if (k.aktivna) {
                @if (gasenjeKljuc() === k.kljuc) {
                  <span class="stavka__meta">
                    @if (koristiPutovanja() !== null) {
                      {{ opisKoriscenja(koristiPutovanja()!) }}
                    } @else {
                      {{ 'adminKategorije.proveravamo' | t }}
                    }
                  </span>
                  <button type="button" class="dugme dugme--opasno dugme--malo" (click)="ugasi(k)">
                    {{ 'adminAtrakcije.potvrdiGasenje' | t }}
                  </button>
                  <button
                    type="button"
                    class="dugme dugme--sporedno dugme--malo"
                    (click)="gasenjeKljuc.set(null)">
                    {{ 'admin.odustani' | t }}
                  </button>
                } @else {
                  <button
                    type="button"
                    class="dugme dugme--sporedno dugme--malo"
                    (click)="zapocniGasenje(k)">
                    {{ 'adminAtrakcije.ugasi' | t }}
                  </button>
                }
              } @else {
                <button type="button" class="dugme dugme--malo" (click)="vrati(k)">{{ 'adminKategorije.vrati' | t }}</button>
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: '../admin.css'
})
export class AdminKategorijeComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly kategorije = signal<Kategorija[]>([]);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);
  readonly greskaForme = signal<string | null>(null);
  readonly greskeServera = signal<string[]>([]);
  readonly cuva = signal(false);

  readonly izmenaKljuc = signal<string | null>(null);
  readonly gasenjeKljuc = signal<string | null>(null);
  /** Koliko sačuvanih putovanja koristi kategoriju koja se gasi. */
  readonly koristiPutovanja = signal<number | null>(null);

  readonly forma = this.fb.nonNullable.group({
    kljuc: ['', [Validators.pattern(/^[a-z_]{3,30}$/)]],
    naziv: ['', [Validators.required]],
    opis: [''],
    kinds: ['', [Validators.required]],
    geo: [''],
    trajanjePoseteMin: [60, [Validators.required, Validators.min(15), Validators.max(600)]],
    otvara: ['09:00', [Validators.required]],
    zatvara: ['18:00', [Validators.required]]
  });

  constructor() {
    this.ucitaj();
  }

  opisKoriscenja(broj: number): string {
    return prevediBroj('adminKategorije.koristi', broj);
  }

  ucitaj(): void {
    this.ucitava.set(true);
    this.greska.set(null);

    this.api.kategorije().subscribe({
      next: (o) => {
        this.kategorije.set(o.data ?? []);
        this.ucitava.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.ucitava.set(false);
        this.greska.set(porukaGreske(err, prevedi('adminKategorije.nisuUcitane')));
      }
    });
  }

  zapocniIzmenu(k: Kategorija): void {
    this.izmenaKljuc.set(k.kljuc);
    this.greskaForme.set(null);
    this.greskeServera.set([]);

    this.forma.setValue({
      kljuc: k.kljuc,
      naziv: k.naziv,
      opis: k.opis || '',
      kinds: k.eksterneKategorije.join(', '),
      geo: (k.geoapifyKategorije || []).join(', '),
      trajanjePoseteMin: k.trajanjePoseteMin,
      otvara: k.radnoVreme.open,
      zatvara: k.radnoVreme.close
    });
  }

  odustani(): void {
    this.izmenaKljuc.set(null);
    this.greskaForme.set(null);
    this.greskeServera.set([]);

    this.forma.reset({
      kljuc: '',
      naziv: '',
      opis: '',
      kinds: '',
      geo: '',
      trajanjePoseteMin: 60,
      otvara: '09:00',
      zatvara: '18:00'
    });
  }

  private proveri(): string | null {
    const v = this.forma.getRawValue();

    if (!this.izmenaKljuc() && !/^[a-z_]{3,30}$/.test(v.kljuc)) {
      return prevedi('adminKategorije.kljucPravilo');
    }

    if (!v.naziv.trim()) return prevedi('adminAtrakcije.nazivObavezan');

    if (!VREME.test(v.otvara) || !VREME.test(v.zatvara)) {
      return prevedi('adminKategorije.radnoVreme');
    }

    if (v.otvara === v.zatvara) return prevedi('adminAtrakcije.istaVremena');

    if (this.kinds().length === 0) return prevedi('adminKategorije.barJednaOtm');

    const t = Number(v.trajanjePoseteMin);
    if (!Number.isFinite(t) || t < 15 || t > 600) {
      return prevedi('adminKategorije.trajanje');
    }

    return null;
  }

  private kinds(): string[] {
    return this.razdvoji(this.forma.getRawValue().kinds);
  }

  /** „a, b , c" -> ['a','b','c'] */
  private razdvoji(tekst: string): string[] {
    return tekst
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }

  sacuvaj(): void {
    this.forma.markAllAsTouched();
    this.greskeServera.set([]);

    const problem = this.proveri();

    if (problem) {
      this.greskaForme.set(problem);
      return;
    }

    this.greskaForme.set(null);

    const v = this.forma.getRawValue();

    const telo = {
      naziv: v.naziv.trim(),
      opis: v.opis.trim(),
      eksterneKategorije: this.kinds(),
      geoapifyKategorije: this.razdvoji(v.geo),
      trajanjePoseteMin: Number(v.trajanjePoseteMin),
      radnoVreme: { open: v.otvara, close: v.zatvara }
    };

    this.cuva.set(true);

    const kljuc = this.izmenaKljuc();

    const poziv = kljuc
      ? this.api.izmeniKategoriju(kljuc, telo)
      : this.api.kreirajKategoriju({ kljuc: v.kljuc.trim(), ...telo });

    poziv.subscribe({
      next: () => {
        this.cuva.set(false);
        this.toast.uspeh(
          kljuc
            ? prevedi('adminKategorije.izmenjena', { naziv: telo.naziv })
            : prevedi('adminKategorije.dodata', { naziv: telo.naziv })
        );
        this.odustani();
        this.ucitaj();
      },
      error: (err: HttpErrorResponse) => {
        this.cuva.set(false);

        const lista = err.error?.errors;
        if (Array.isArray(lista)) this.greskeServera.set(lista);

        this.greskaForme.set(porukaGreske(err, prevedi('adminKategorije.nijeSacuvana')));
      }
    });
  }

  /** Pre gašenja se proverava koliko je putovanja koristi. */
  zapocniGasenje(k: Kategorija): void {
    this.gasenjeKljuc.set(k.kljuc);
    this.koristiPutovanja.set(null);

    this.api.kategorija(k.kljuc).subscribe({
      next: (o) => this.koristiPutovanja.set(o.data?.koristiPutovanja ?? 0),
      error: () => this.koristiPutovanja.set(0)
    });
  }

  ugasi(k: Kategorija): void {
    this.api.ugasiKategoriju(k.kljuc).subscribe({
      next: () => {
        this.gasenjeKljuc.set(null);
        this.toast.uspeh(prevedi('adminKategorije.ugasena', { naziv: k.naziv }));
        this.ucitaj();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.greska(porukaGreske(err, prevedi('adminAtrakcije.gasenjeNeuspelo')))
    });
  }

  vrati(k: Kategorija): void {
    this.api.izmeniKategoriju(k.kljuc, { aktivna: true }).subscribe({
      next: () => {
        this.toast.uspeh(prevedi('adminKategorije.vracena', { naziv: k.naziv }));
        this.ucitaj();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.greska(porukaGreske(err, prevedi('adminKategorije.vracanjeNeuspelo')))
    });
  }
}
