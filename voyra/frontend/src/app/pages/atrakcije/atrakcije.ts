import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { Grad, kodZaLet, nazivGrada } from '../../core/models/grad.model';
import { Atrakcija } from '../../core/models/plan.model';
import { porukaGreske } from '../../core/services/api-error';
import { CityApiService } from '../../core/services/city-api.service';
import { PreferencijeService } from '../../core/services/preferencije.service';
import { WizardApiService } from '../../core/services/wizard-api.service';
import { GradUnosComponent } from '../../shared/components/grad-unos';
import { SlikaAtrakcijeComponent } from '../../shared/components/slika-atrakcije';
import { novac, trajanje } from '../../shared/format';
import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi } from '../../core/i18n/prevod';

type Sortiranje = 'ocena' | 'naziv';

/**
 * Stranica „Atrakcije" (spec §10).
 *
 * Prikazuje atrakcije za izabrani grad, ocenjene istom formulom kao u
 * fazi 3 planiranja (§6.2), pa se vidi zašto je nešto visoko rangirano.
 */
@Component({
  selector: 'app-atrakcije',
  standalone: true,
  imports: [FormsModule, GradUnosComponent, SlikaAtrakcijeComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './atrakcije.html',
  styleUrl: './atrakcije.css'
})
export class AtrakcijeComponent {
  private readonly api = inject(WizardApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly gradovi = inject(CityApiService);

  readonly preferencije = inject(PreferencijeService);

  readonly trajanje = trajanje;
  readonly novac = novac;

  readonly grad = signal<Grad | null>(null);
  readonly interesovanja = signal<string[]>([]);

  readonly sve = signal<Atrakcija[]>([]);
  readonly izvor = signal<string | null>(null);
  readonly ucitava = signal(false);
  readonly greska = signal<string | null>(null);
  readonly trazeniGrad = signal<string | null>(null);

  // Klijentski filter i sortiranje nad već dobijenom listom
  readonly filterKategorije = signal<string>('');
  readonly sortiranje = signal<Sortiranje>('ocena');

  /** Kategorije koje se zaista pojavljuju u rezultatu. */
  readonly kategorijeURezultatu = computed(() => {
    const skup = new Set<string>();

    for (const a of this.sve()) {
      for (const k of a.categories ?? (a.category ? [a.category] : [])) skup.add(k);
    }

    return [...skup];
  });

  readonly prikazane = computed(() => {
    const filter = this.filterKategorije();

    const lista = filter
      ? this.sve().filter((a) => (a.categories ?? [a.category]).includes(filter))
      : [...this.sve()];

    return lista.sort((a, b) =>
      this.sortiranje() === 'naziv'
        ? a.name.localeCompare(b.name, 'sr')
        : (b.score ?? 0) - (a.score ?? 0)
    );
  });

  constructor() {
    this.preferencije.ucitaj().subscribe();

    // Dolazak iz koraka 4 ili iz starog linka (`?to=ATH`)
    const q = this.route.snapshot.queryParamMap;

    this.gradovi.razresi(q.get('toCityId'), q.get('to')).subscribe((g) => {
      if (!g) return;

      this.grad.set(g);
      this.pretrazi();
    });
  }

  jeIzabrano(kod: string): boolean {
    return this.interesovanja().includes(kod);
  }

  prebaci(kod: string): void {
    const trenutno = this.interesovanja();

    this.interesovanja.set(
      trenutno.includes(kod) ? trenutno.filter((i) => i !== kod) : [...trenutno, kod]
    );
  }

  pretrazi(): void {
    const g = this.grad();

    if (!g) {
      this.greska.set(prevedi('atrakcije.izaberiteGrad'));
      return;
    }

    this.ucitava.set(true);
    this.greska.set(null);
    this.filterKategorije.set('');

    // `kodZaLet` je i kod grada za atrakcije; server uz `toCityId` ionako
    // zna koordinate, pa kod služi samo starim putanjama
    this.api.atrakcije(kodZaLet(g) ?? '', this.interesovanja(), g.id).subscribe({
      next: (o) => {
        this.ucitava.set(false);
        this.sve.set(o.data);
        this.izvor.set(o.source);
        this.trazeniGrad.set(nazivGrada(g));
      },
      error: (err: HttpErrorResponse) => {
        this.ucitava.set(false);
        this.sve.set([]);
        this.greska.set(porukaGreske(err, prevedi('atrakcije.nisuUcitane')));
      }
    });
  }

  kategorije(a: Atrakcija): string[] {
    if (a.categories?.length) return a.categories;
    return a.category ? [a.category] : [];
  }
}
