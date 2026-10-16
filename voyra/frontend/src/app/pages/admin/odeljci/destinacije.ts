import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Grad } from '../../../core/models/grad.model';
import { IstaknutaDestinacija } from '../../../core/models/sadrzaj.model';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { porukaGreske } from '../../../core/services/api-error';
import { ToastService } from '../../../core/services/toast.service';
import { GradUnosComponent } from '../../../shared/components/grad-unos';
import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi } from '../../../core/i18n/prevod';

/**
 * ISTAKNUTE DESTINACIJE (`/admin/destinacije`, spec §4.1).
 *
 * Grad se bira istom pretragom kao u čarobnjaku, pa administrator ne
 * mora da zna identifikatore. Redosled se menja strelicama - prvi u
 * listi je prvi na početnoj strani.
 */
@Component({
  selector: 'app-admin-destinacije',
  standalone: true,
  imports: [ReactiveFormsModule, GradUnosComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="odeljak__zaglavlje">
      <div>
        <h2>{{ 'adminDestinacije.naslov' | t }}</h2>
      </div>
      <button type="button" class="dugme dugme--sporedno dugme--malo" (click)="ucitaj()">
        {{ 'admin.osvezi' | t }}
      </button>
    </div>

    <form class="forma-kartica" [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <h3>{{ (izmenaId() ? 'adminDestinacije.izmena' : 'adminDestinacije.nova') | t }}</h3>

      @if (!izmenaId()) {
        <app-grad-unos idPolja="dest-grad" [(izabran)]="grad" />
      } @else {
        <p class="stavka__meta">{{ 'adminDestinacije.grad' | t: { naziv: nazivIzmene() } }}</p>
      }

      <div class="forma-red">
        <div class="polje">
          <label for="dest-naslov">{{ 'adminDestinacije.naslovPolje' | t }} <span class="opciono">{{ 'adminDestinacije.naslovOpis' | t }}</span></label>
          <input id="dest-naslov" type="text" formControlName="naslov" maxlength="80" />
        </div>

        <div class="polje">
          <label for="dest-slika">{{ 'adminDestinacije.urlSlike' | t }} <span class="opciono">{{ 'adminDestinacije.urlOpis' | t }}</span></label>
          <input id="dest-slika" type="url" formControlName="slikaUrl" placeholder="https://" />
        </div>

        <div class="polje">
          <label for="dest-credit">{{ 'adminDestinacije.potpis' | t }}</label>
          <input id="dest-credit" type="text" formControlName="slikaCredit" maxlength="120" />
        </div>
      </div>

      <div class="polje">
        <label for="dest-opis">{{ 'adminDestinacije.opisPolje' | t }}</label>
        <textarea id="dest-opis" rows="2" formControlName="opis" maxlength="400"></textarea>
      </div>

      @if (greskaForme(); as g) {
        <p class="poruka poruka--greska" role="alert">{{ g }}</p>
      }

      <div class="stavka__akcije">
        <button type="submit" class="dugme dugme--malo" [disabled]="cuva()">
          {{ (izmenaId() ? 'adminDestinacije.sacuvajIzmenu' : 'adminDestinacije.dodajDestinaciju') | t }}
        </button>
        @if (izmenaId()) {
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
      <p class="stanje" role="status">{{ 'adminDestinacije.ucitavamo' | t }}</p>
    } @else if (destinacije().length === 0) {
      <p class="stanje">
        {{ 'adminDestinacije.nijedna' | t }}
      </p>
    } @else {
      <ul class="stavke">
        @for (d of destinacije(); track d.id; let i = $index) {
          <li class="stavka">
            <div class="stavka__telo">
              <p class="stavka__naslov">
                {{ i + 1 }}. {{ d.naslov }}
                @if (!d.istaknuta) {
                  <span class="oznaka">{{ 'adminDestinacije.sklonjena' | t }}</span>
                }
              </p>
              <p class="stavka__meta">
                {{ d.drzavaNaziv }}
                @if (d.opis) {
                  <br />{{ d.opis }}
                }
                @if (d.slika?.url) {
                  <br />{{ 'adminDestinacije.slika' | t: { potpis: d.slika?.credit || ('adminDestinacije.bezPotpisa' | t) } }}
                } @else {
                  <br />{{ 'adminDestinacije.bezSlike' | t }}
                }
              </p>
            </div>

            <div class="stavka__akcije">
              <button
                type="button"
                class="dugme dugme--sporedno dugme--malo"
                [disabled]="i === 0"
                [attr.aria-label]="'adminDestinacije.navise' | t: { naziv: d.naslov }"
                (click)="pomeri(i, -1)">
                &uarr;
              </button>
              <button
                type="button"
                class="dugme dugme--sporedno dugme--malo"
                [disabled]="i === destinacije().length - 1"
                [attr.aria-label]="'adminDestinacije.nanize' | t: { naziv: d.naslov }"
                (click)="pomeri(i, 1)">
                &darr;
              </button>
              <button type="button" class="dugme dugme--malo" (click)="zapocniIzmenu(d)">
                {{ 'admin.izmeni' | t }}
              </button>

              @if (brisanjeId() === d.id) {
                <button
                  type="button"
                  class="dugme dugme--opasno dugme--malo"
                  (click)="obrisi(d)">
                  {{ 'adminDestinacije.potvrdiUklanjanje' | t }}
                </button>
                <button
                  type="button"
                  class="dugme dugme--sporedno dugme--malo"
                  (click)="brisanjeId.set(null)">
                  {{ 'admin.odustani' | t }}
                </button>
              } @else {
                <button
                  type="button"
                  class="dugme dugme--sporedno dugme--malo"
                  (click)="brisanjeId.set(d.id)">
                  {{ 'adminDestinacije.ukloni' | t }}
                </button>
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: '../admin.css'
})
export class AdminDestinacijeComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly destinacije = signal<IstaknutaDestinacija[]>([]);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);
  readonly greskaForme = signal<string | null>(null);
  readonly cuva = signal(false);

  readonly grad = signal<Grad | null>(null);
  readonly izmenaId = signal<string | null>(null);
  readonly nazivIzmene = signal('');
  readonly brisanjeId = signal<string | null>(null);

  readonly forma = this.fb.nonNullable.group({
    naslov: [''],
    opis: [''],
    slikaUrl: ['', [Validators.pattern(/^https:\/\/.+/)]],
    slikaCredit: ['']
  });

  constructor() {
    this.ucitaj();
  }

  ucitaj(): void {
    this.ucitava.set(true);
    this.greska.set(null);

    this.api.destinacije().subscribe({
      next: (o) => {
        this.destinacije.set(o.data ?? []);
        this.ucitava.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.ucitava.set(false);
        this.greska.set(porukaGreske(err, prevedi('adminDestinacije.nisuUcitane')));
      }
    });
  }

  zapocniIzmenu(d: IstaknutaDestinacija): void {
    this.izmenaId.set(d.id);
    this.nazivIzmene.set(`${d.naziv}, ${d.drzavaNaziv}`);
    this.greskaForme.set(null);

    this.forma.setValue({
      naslov: d.naslov || '',
      opis: d.opis || '',
      slikaUrl: d.slika?.url || '',
      slikaCredit: d.slika?.credit || ''
    });
  }

  odustani(): void {
    this.izmenaId.set(null);
    this.nazivIzmene.set('');
    this.greskaForme.set(null);
    this.forma.reset({ naslov: '', opis: '', slikaUrl: '', slikaCredit: '' });
  }

  /** Slika ide samo kada ima i URL i potpis - izvor se uvek navodi. */
  private slikaIzForme(): { url: string; credit: string } | null {
    const { slikaUrl, slikaCredit } = this.forma.getRawValue();

    if (!slikaUrl.trim()) return null;

    return { url: slikaUrl.trim(), credit: slikaCredit.trim() };
  }

  sacuvaj(): void {
    this.greskaForme.set(null);
    this.forma.markAllAsTouched();

    if (this.forma.invalid) {
      this.greskaForme.set(prevedi('adminDestinacije.https'));
      return;
    }

    const slika = this.slikaIzForme();

    if (slika && !slika.credit) {
      this.greskaForme.set(prevedi('adminDestinacije.potpisObavezan'));
      return;
    }

    const v = this.forma.getRawValue();
    const telo = { naslov: v.naslov.trim(), opis: v.opis.trim(), slika };

    this.cuva.set(true);

    const id = this.izmenaId();

    if (id) {
      this.api.izmeniDestinaciju(id, telo).subscribe({
        next: () => {
          this.cuva.set(false);
          this.odustani();
          this.toast.uspeh(prevedi('adminDestinacije.izmenjena'));
          this.ucitaj();
        },
        error: (err: HttpErrorResponse) => this.neuspeh(err)
      });

      return;
    }

    const grad = this.grad();

    if (!grad) {
      this.cuva.set(false);
      this.greskaForme.set(prevedi('adminDestinacije.izaberiteGrad'));
      return;
    }

    this.api.kreirajDestinaciju({ gradId: grad.id, ...telo }).subscribe({
      next: () => {
        this.cuva.set(false);
        this.grad.set(null);
        this.odustani();
        this.toast.uspeh(prevedi('adminDestinacije.dodat', { grad: grad.naziv }));
        this.ucitaj();
      },
      error: (err: HttpErrorResponse) => this.neuspeh(err)
    });
  }

  private neuspeh(err: HttpErrorResponse): void {
    this.cuva.set(false);
    this.greskaForme.set(porukaGreske(err, prevedi('adminDestinacije.nijeSacuvana')));
  }

  /** Pomeranje u listi; novi redosled se odmah šalje serveru. */
  pomeri(indeks: number, smer: -1 | 1): void {
    const lista = [...this.destinacije()];
    const cilj = indeks + smer;

    if (cilj < 0 || cilj >= lista.length) return;

    [lista[indeks], lista[cilj]] = [lista[cilj], lista[indeks]];

    // Prikaz se menja odmah, a server potvrđuje; na grešku se vraća stanje
    this.destinacije.set(lista);

    this.api.poredjajDestinacije(lista.map((d) => d.id)).subscribe({
      next: (o) => this.destinacije.set(o.data ?? lista),
      error: (err: HttpErrorResponse) => {
        this.toast.greska(porukaGreske(err, prevedi('adminDestinacije.redosledNije')));
        this.ucitaj();
      }
    });
  }

  obrisi(d: IstaknutaDestinacija): void {
    this.api.obrisiDestinaciju(d.id).subscribe({
      next: () => {
        this.brisanjeId.set(null);
        this.destinacije.update((lista) => lista.filter((x) => x.id !== d.id));
        this.toast.uspeh(prevedi('adminDestinacije.uklonjena', { naziv: d.naslov }));
      },
      error: (err: HttpErrorResponse) =>
        this.toast.greska(porukaGreske(err, prevedi('adminDestinacije.uklanjanjeNeuspelo')))
    });
  }
}
