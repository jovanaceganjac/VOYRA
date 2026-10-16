import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Grad } from '../../../core/models/grad.model';
import { AdminAtrakcija, Kategorija } from '../../../core/models/sadrzaj.model';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { porukaGreske } from '../../../core/services/api-error';
import { ToastService } from '../../../core/services/toast.service';
import { GradUnosComponent } from '../../../shared/components/grad-unos';
import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi } from '../../../core/i18n/prevod';

/** Isto ograničenje kao na serveru (`AtrakcijeService`). */
const MAX_UDALJENOST_KM = 50;

const VREME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

/**
 * ATRAKCIJE ADMINISTRATORA (`/admin/atrakcije`, spec §4.5).
 *
 * Bira se grad, pa se u njemu unose atrakcije koje spoljni izvor nema.
 * „Preuzmi koordinate centra grada" popunjava polja početnom vrednošću
 * koju administrator zatim pomera - tako ne mora da traži koordinate
 * ručno da bi uopšte počeo.
 */
@Component({
  selector: 'app-admin-atrakcije',
  standalone: true,
  imports: [ReactiveFormsModule, GradUnosComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="odeljak__zaglavlje">
      <div>
        <h2>{{ 'admin.odeljci.atrakcije' | t }}</h2>
      </div>
    </div>

    <div class="forma-kartica">
      <h3>{{ 'adminAtrakcije.grad' | t }}</h3>
      <app-grad-unos idPolja="atr-grad" [(izabran)]="grad" />
      <div class="stavka__akcije">
        <button
          type="button"
          class="dugme dugme--malo"
          [disabled]="!grad()"
          (click)="ucitaj()">
          {{ 'adminAtrakcije.prikazi' | t }}
        </button>
      </div>
    </div>

    @if (izabraniGrad(); as g) {
      <form class="forma-kartica" [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
        <h3>{{ izmenaId() ? ('adminAtrakcije.izmena' | t) : ('adminAtrakcije.nova' | t: { grad: g.naziv }) }}</h3>

        <div class="forma-red">
          <div class="polje">
            <label for="atr-naziv">{{ 'adminAtrakcije.naziv' | t }}</label>
            <input id="atr-naziv" type="text" formControlName="naziv" maxlength="140" />
            @if (dodirnuto('naziv')) {
              <p class="polje-greska" role="alert">{{ 'adminAtrakcije.nazivObavezan' | t }}</p>
            }
          </div>

          <div class="polje">
            <label for="atr-trajanje">{{ 'adminAtrakcije.trajanje' | t }}</label>
            <input id="atr-trajanje" type="number" min="15" max="600" formControlName="trajanjeMin" />
            @if (dodirnuto('trajanjeMin')) {
              <p class="polje-greska" role="alert">{{ 'adminAtrakcije.trajanjeOpseg' | t }}</p>
            }
          </div>

          <div class="polje">
            <label for="atr-cena">{{ 'adminAtrakcije.cena' | t }} <span class="opciono">{{ 'adminAtrakcije.cenaOpis' | t }}</span></label>
            <input id="atr-cena" type="number" min="0" step="0.5" formControlName="cenaUlaznice" />
          </div>
        </div>

        <div class="forma-red">
          <div class="polje">
            <label for="atr-lat">{{ 'adminAtrakcije.sirina' | t }}</label>
            <input id="atr-lat" type="number" step="0.00001" formControlName="lat" />
          </div>

          <div class="polje">
            <label for="atr-lon">{{ 'adminAtrakcije.duzina' | t }}</label>
            <input id="atr-lon" type="number" step="0.00001" formControlName="lon" />
          </div>

          <div class="polje">
            <label for="atr-od">{{ 'adminAtrakcije.otvara' | t }} <span class="opciono">{{ 'admin.opciono' | t }}</span></label>
            <input id="atr-od" type="time" formControlName="otvara" />
          </div>

          <div class="polje">
            <label for="atr-do">{{ 'adminAtrakcije.zatvara' | t }}</label>
            <input id="atr-do" type="time" formControlName="zatvara" />
          </div>
        </div>

        <div class="stavka__akcije">
          <button type="button" class="dugme dugme--sporedno dugme--malo" (click)="centarGrada()">
            {{ 'adminAtrakcije.centar' | t }}
          </button>
          @if (udaljenost() !== null) {
            <span class="stavka__meta">
              {{ 'adminAtrakcije.odCentra' | t: { km: udaljenost() } }}
              @if (udaljenost()! > maxUdaljenost) {
                {{ 'adminAtrakcije.izvanKruga' | t }}
              }
            </span>
          }
        </div>

        <fieldset class="polje">
          <legend>{{ 'adminAtrakcije.kategorije' | t }}</legend>
          <div class="potvrde-lista">
            @for (k of kategorije(); track k.kljuc) {
              <label class="potvrda">
                <input
                  type="checkbox"
                  [checked]="jeIzabrana(k.kljuc)"
                  (change)="prebaci(k.kljuc)" />
                <span>{{ k.naziv }}</span>
              </label>
            }
          </div>
          @if (izabraneKategorije().length === 0) {
            <p class="polje__pomoc">{{ 'adminAtrakcije.barJedna' | t }}</p>
          }
        </fieldset>

        <div class="forma-red">
          <div class="polje">
            <label for="atr-slika">{{ 'adminDestinacije.urlSlike' | t }} <span class="opciono">{{ 'adminDestinacije.urlOpis' | t }}</span></label>
            <input id="atr-slika" type="url" formControlName="slikaUrl" placeholder="https://" />
          </div>
          <div class="polje">
            <label for="atr-credit">{{ 'adminDestinacije.potpis' | t }}</label>
            <input id="atr-credit" type="text" formControlName="slikaCredit" maxlength="120" />
          </div>
        </div>

        <div class="polje">
          <label for="atr-opis">{{ 'adminDestinacije.opisPolje' | t }}</label>
          <textarea id="atr-opis" rows="2" formControlName="opis" maxlength="1000"></textarea>
        </div>

        @if (greskaForme(); as g2) {
          <p class="poruka poruka--greska" role="alert">{{ g2 }}</p>
        }

        @if (greskeServera().length > 0) {
          <ul class="poruka poruka--greska" role="alert">
            @for (g3 of greskeServera(); track g3) {
              <li class="poruka__stavka">{{ g3 }}</li>
            }
          </ul>
        }

        <div class="stavka__akcije">
          <button type="submit" class="dugme dugme--malo" [disabled]="cuva()">
            {{ (izmenaId() ? 'adminDestinacije.sacuvajIzmenu' : 'adminAtrakcije.dodajAtrakciju') | t }}
          </button>
          @if (izmenaId()) {
            <button type="button" class="dugme dugme--sporedno dugme--malo" (click)="odustani()">
              {{ 'admin.odustani' | t }}
            </button>
          }
        </div>
      </form>

      @if (ucitavaListu()) {
        <p class="stanje" role="status">{{ 'adminAtrakcije.ucitavamo' | t }}</p>
      } @else if (atrakcije().length === 0) {
        <p class="stanje">{{ 'adminAtrakcije.nemaUnetih' | t: { grad: g.naziv } }}</p>
      } @else {
        <ul class="stavke">
          @for (a of atrakcije(); track a.id) {
            <li class="stavka" [class.stavka--neaktivna]="!a.aktivna">
              <div class="stavka__telo">
                <p class="stavka__naslov">
                  {{ a.naziv }}
                  @if (!a.aktivna) {
                    <span class="oznaka">{{ 'adminAtrakcije.ugasena' | t }}</span>
                  }
                </p>
                <p class="stavka__meta">
                  {{ a.kategorije.join(', ') }} &middot; {{ a.trajanjeMin }} min
                  @if (a.radnoVreme) {
                    &middot; {{ a.radnoVreme.open }}&ndash;{{ a.radnoVreme.close }}
                  }
                  @if (a.cenaUlaznice !== null) {
                    &middot; {{ a.cenaUlaznice }} EUR
                  }
                  <br />{{ a.lat }}, {{ a.lon }}
                </p>
              </div>

              <div class="stavka__akcije">
                <button type="button" class="dugme dugme--malo" (click)="zapocniIzmenu(a)">
                  {{ 'admin.izmeni' | t }}
                </button>
                @if (a.aktivna) {
                  @if (gasenjeId() === a.id) {
                    <button
                      type="button"
                      class="dugme dugme--opasno dugme--malo"
                      (click)="ugasi(a)">
                      {{ 'adminAtrakcije.potvrdiGasenje' | t }}
                    </button>
                    <button
                      type="button"
                      class="dugme dugme--sporedno dugme--malo"
                      (click)="gasenjeId.set(null)">
                      {{ 'admin.odustani' | t }}
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="dugme dugme--sporedno dugme--malo"
                      (click)="gasenjeId.set(a.id)">
                      {{ 'adminAtrakcije.ugasi' | t }}
                    </button>
                  }
                }
              </div>
            </li>
          }
        </ul>
      }
    }
  `,
  styleUrl: '../admin.css'
})
export class AdminAtrakcijeComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly maxUdaljenost = MAX_UDALJENOST_KM;

  readonly grad = signal<Grad | null>(null);
  /** Grad za koji je lista učitana - menja se tek na „Prikaži". */
  readonly izabraniGrad = signal<Grad | null>(null);

  readonly atrakcije = signal<AdminAtrakcija[]>([]);
  readonly kategorije = signal<Kategorija[]>([]);
  readonly izabraneKategorije = signal<string[]>([]);

  readonly ucitavaListu = signal(false);
  readonly cuva = signal(false);
  readonly greskaForme = signal<string | null>(null);
  readonly greskeServera = signal<string[]>([]);

  readonly izmenaId = signal<string | null>(null);
  readonly gasenjeId = signal<string | null>(null);

  readonly forma = this.fb.nonNullable.group({
    naziv: ['', [Validators.required]],
    opis: [''],
    lat: [null as number | null, [Validators.required]],
    lon: [null as number | null, [Validators.required]],
    trajanjeMin: [60, [Validators.required, Validators.min(15), Validators.max(600)]],
    cenaUlaznice: [null as number | null, [Validators.min(0)]],
    otvara: [''],
    zatvara: [''],
    slikaUrl: ['', [Validators.pattern(/^https:\/\/.+/)]],
    slikaCredit: ['']
  });

  constructor() {
    this.api.kategorije().subscribe({
      next: (o) => this.kategorije.set((o.data ?? []).filter((k) => k.aktivna)),
      error: () => this.kategorije.set([])
    });
  }

  dodirnuto(polje: 'naziv' | 'trajanjeMin'): boolean {
    const k = this.forma.controls[polje];

    return k.invalid && (k.touched || k.dirty);
  }

  /** Udaljenost od centra grada - ista formula kao na serveru. */
  udaljenost(): number | null {
    const g = this.izabraniGrad();
    const { lat, lon } = this.forma.getRawValue();

    if (!g || lat === null || lon === null) return null;

    const R = 6371;
    const rad = (x: number) => (x * Math.PI) / 180;
    const dLat = rad(lat - g.lat);
    const dLon = rad(lon - g.lon);

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(g.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;

    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
  }

  centarGrada(): void {
    const g = this.izabraniGrad();

    if (!g) return;

    this.forma.patchValue({ lat: g.lat, lon: g.lon });
  }

  jeIzabrana(kljuc: string): boolean {
    return this.izabraneKategorije().includes(kljuc);
  }

  prebaci(kljuc: string): void {
    this.izabraneKategorije.update((lista) =>
      lista.includes(kljuc) ? lista.filter((k) => k !== kljuc) : [...lista, kljuc]
    );
  }

  ucitaj(): void {
    const g = this.grad();

    if (!g) return;

    this.izabraniGrad.set(g);
    this.ucitavaListu.set(true);
    this.odustani();

    this.api.atrakcije(g.id).subscribe({
      next: (o) => {
        this.atrakcije.set(o.data ?? []);
        this.ucitavaListu.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.ucitavaListu.set(false);
        this.atrakcije.set([]);
        this.toast.greska(porukaGreske(err, prevedi('adminAtrakcije.nisuUcitane')));
      }
    });
  }

  zapocniIzmenu(a: AdminAtrakcija): void {
    this.izmenaId.set(a.id);
    this.greskaForme.set(null);
    this.greskeServera.set([]);
    this.izabraneKategorije.set([...a.kategorije]);

    this.forma.setValue({
      naziv: a.naziv,
      opis: a.opis || '',
      lat: a.lat,
      lon: a.lon,
      trajanjeMin: a.trajanjeMin,
      cenaUlaznice: a.cenaUlaznice,
      otvara: a.radnoVreme?.open || '',
      zatvara: a.radnoVreme?.close || '',
      slikaUrl: a.slika?.url || '',
      slikaCredit: a.slika?.credit || ''
    });
  }

  odustani(): void {
    this.izmenaId.set(null);
    this.greskaForme.set(null);
    this.greskeServera.set([]);
    this.izabraneKategorije.set([]);

    this.forma.reset({
      naziv: '',
      opis: '',
      lat: null,
      lon: null,
      trajanjeMin: 60,
      cenaUlaznice: null,
      otvara: '',
      zatvara: '',
      slikaUrl: '',
      slikaCredit: ''
    });
  }

  private proveri(): string | null {
    const v = this.forma.getRawValue();

    if (this.forma.invalid) return prevedi('adminAtrakcije.popunite');
    if (this.izabraneKategorije().length === 0) return prevedi('adminAtrakcije.barJedna');

    // Radno vreme je opciono, ali mora da bude celo ili nikakvo
    const imaJedno = Boolean(v.otvara) !== Boolean(v.zatvara);
    if (imaJedno) return prevedi('adminAtrakcije.obaVremena');

    if (v.otvara && (!VREME.test(v.otvara) || !VREME.test(v.zatvara))) {
      return prevedi('adminAtrakcije.oblikVremena');
    }

    if (v.otvara && v.otvara === v.zatvara) {
      return prevedi('adminAtrakcije.istaVremena');
    }

    const d = this.udaljenost();
    if (d !== null && d > MAX_UDALJENOST_KM) {
      return prevedi('adminAtrakcije.udaljeno', { km: d, max: MAX_UDALJENOST_KM });
    }

    if (v.slikaUrl.trim() && !v.slikaCredit.trim()) {
      return prevedi('adminDestinacije.potpisObavezan');
    }

    return null;
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
    const g = this.izabraniGrad()!;

    const telo = {
      naziv: v.naziv.trim(),
      opis: v.opis.trim(),
      gradId: g.id,
      lat: Number(v.lat),
      lon: Number(v.lon),
      kategorije: this.izabraneKategorije(),
      trajanjeMin: Number(v.trajanjeMin),
      radnoVreme: v.otvara ? { open: v.otvara, close: v.zatvara } : null,
      cenaUlaznice: v.cenaUlaznice === null ? null : Number(v.cenaUlaznice),
      slika: v.slikaUrl.trim()
        ? { url: v.slikaUrl.trim(), credit: v.slikaCredit.trim() }
        : null
    };

    this.cuva.set(true);

    const id = this.izmenaId();
    const poziv = id ? this.api.izmeniAtrakciju(id, telo) : this.api.kreirajAtrakciju(telo);

    poziv.subscribe({
      next: () => {
        this.cuva.set(false);
        this.toast.uspeh(
          id ? prevedi('adminAtrakcije.izmenjena') : prevedi('adminAtrakcije.dodata', { naziv: telo.naziv })
        );
        this.ucitaj();
      },
      error: (err: HttpErrorResponse) => {
        this.cuva.set(false);

        const lista = err.error?.errors;
        if (Array.isArray(lista)) this.greskeServera.set(lista);

        this.greskaForme.set(porukaGreske(err, prevedi('adminAtrakcije.nijeSacuvana')));
      }
    });
  }

  ugasi(a: AdminAtrakcija): void {
    this.api.ugasiAtrakciju(a.id).subscribe({
      next: () => {
        this.gasenjeId.set(null);
        this.toast.uspeh(prevedi('adminAtrakcije.ugasenaPoruka', { naziv: a.naziv }));
        this.ucitaj();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.greska(porukaGreske(err, prevedi('adminAtrakcije.gasenjeNeuspelo')))
    });
  }
}
