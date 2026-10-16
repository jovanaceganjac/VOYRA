import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../core/i18n/prevod';
import { PreferencijeService } from '../../core/services/preferencije.service';

import {
  Atrakcija,
  Dan,
  Itinerar,
  Let,
  ProcenaRezervacije,
  Smestaj,
  ZahtevPlana
} from '../../core/models/plan.model';
import { nazivMesta } from '../../core/models/grad.model';
import { SlikaAtrakcijeComponent } from './slika-atrakcije';
import {
  datum,
  datumSaDanom,
  novac,
  presedanja,
  prelaz,
  razdaljina,
  trajanje,
  vreme
} from '../format';

/**
 * Prikaz plana putovanja (spec §4.6).
 *
 * Koriste ga korak 4 čarobnjaka i „Moja putovanja". Planovi sačuvani pre
 * uvođenja satnice nemaju `startTime`, `selectedFlight` ni `availableFrom`
 * - komponenta ih prikazuje bez vremena, uz napomenu, umesto da pukne.
 */
@Component({
  selector: 'app-itinerar',
  standalone: true,
  imports: [SlikaAtrakcijeComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './itinerar.html',
  styleUrl: './itinerar.css'
})
export class ItinerarComponent {
  private readonly preferencije = inject(PreferencijeService);

  /** Poruke servera (upozorenja, napomene dana) se prevode kroz `i18n.server`. */
  readonly i18n = inject(I18nService);

  readonly itinerar = input.required<Itinerar>();

  /** Procena rezervacije stiže samo uz svež plan (/v1/plan). */
  readonly procena = input<ProcenaRezervacije | null>(null);

  /** Zahtev koji je dao plan - za zaglavlje (destinacija, datumi, putnici). */
  readonly zahtev = input<ZahtevPlana | null>(null);

  /** Upozorenja sa nivoa odgovora; plan nosi i svoja. */
  readonly upozorenja = input<string[]>([]);

  readonly datum = datum;
  readonly datumSaDanom = datumSaDanom;
  readonly vreme = vreme;
  readonly trajanje = trajanje;
  readonly novac = novac;
  readonly razdaljina = razdaljina;
  readonly presedanja = presedanja;
  readonly prelaz = prelaz;
  readonly nazivMesta = nazivMesta;

  /** Izabrani let; stari planovi imaju samo listu ponuda. */
  readonly let_ = computed<Let | null>(
    () => this.itinerar().selectedFlight ?? this.itinerar().flights?.[0] ?? null
  );

  readonly smestaj = computed<Smestaj | null>(
    () => this.itinerar().selectedAccommodation ?? this.itinerar().accommodations?.[0] ?? null
  );

  readonly dani = computed(() => this.itinerar().itinerary ?? []);

  readonly ukupnoAtrakcija = computed(() =>
    this.dani().reduce((zbir, dan) => zbir + (dan.attractions?.length ?? 0), 0)
  );

  /** Plan bez satnice je napravljen ranijom verzijom. */
  readonly bezSatnice = computed(() =>
    this.dani().some((d) => (d.attractions ?? []).some((a) => !a.startTime))
  );

  /** Sva upozorenja na jednom mestu, bez ponavljanja. */
  readonly svaUpozorenja = computed(() => {
    const iz = [...(this.upozorenja() ?? []), ...(this.itinerar().warnings ?? [])];
    return [...new Set(iz)];
  });

  readonly uklonjene = computed(() => this.itinerar().removedAttractions ?? []);

  /** Kada izvor ne daje cene ulaznica, zbir je 0 iako atrakcija ima. */
  readonly ulazniceBezCene = computed(
    () => this.ukupnoAtrakcija() > 0 && (this.itinerar().totalBudget?.attractions ?? 0) === 0
  );

  /** Naziv kategorije ili preferencije; nepoznat kod ostaje kakav jeste. */
  naziv(kod: string): string {
    if (kod === 'ostalo') return prevedi('plan.ostalo');

    return this.preferencije.naziv(kod);
  }

  brojPutnika(broj: number): string {
    return prevediBroj('carobnjak.putnik', broj);
  }

  brojDana(broj: number): string {
    return prevediBroj('plan.dan', broj);
  }

  brojNoci(broj: number): string {
    return prevediBroj('carobnjak.noc', broj);
  }

  /** Kategorije atrakcije; stariji zapisi imaju samo jednu. */
  kategorije(a: Atrakcija): string[] {
    if (a.categories?.length) return a.categories;
    return a.category ? [a.category] : [];
  }

  /** Let se prikazuje samo prvog dana (dolazak) i poslednjeg (polazak). */
  prikaziDolazak(dan: Dan): boolean {
    return dan.day === 1 && Boolean(this.let_()?.outbound?.arrival);
  }

  prikaziPolazak(dan: Dan): boolean {
    return dan.day === this.dani().length && Boolean(this.let_()?.inbound?.departure);
  }
}
