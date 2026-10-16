import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi } from '../../core/i18n/prevod';
import { Grad, kodZaLet } from '../../core/models/grad.model';
import { CityApiService } from '../../core/services/city-api.service';
import { PlanWizardService } from '../../core/services/plan-wizard.service';
import { PreferencijeService } from '../../core/services/preferencije.service';
import { FieldErrorComponent } from '../../shared/components/field-error';
import { GradUnosComponent } from '../../shared/components/grad-unos';

/** Iznad ovoliko putnika let se rezerviše u više delova (§4.8). */
const PUTNIKA_PO_REZERVACIJI = 9;

/** Minimalna ocena smeštaja - ponuđene vrednosti (§4.4). */
const OCENE = [
  { vrednost: null, naziv: 'Bez ograničenja' },
  { vrednost: 3, naziv: '3+' },
  { vrednost: 4, naziv: '4+' },
  { vrednost: 4.5, naziv: '4,5+' }
];

/**
 * KORAK 1 — parametri putovanja (spec §4.2).
 *
 * Preferencije su sklopljene, sa podrazumevanim vrednostima iz sheme, da
 * osnovni tok ostane kratak: gradovi, datumi, putnici, budžet.
 */
@Component({
  selector: 'app-korak1',
  standalone: true,
  imports: [ReactiveFormsModule, FieldErrorComponent, GradUnosComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './korak1-parametri.html',
  styleUrl: './korak.css'
})
export class Korak1Component {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly wizard = inject(PlanWizardService);
  private readonly gradovi = inject(CityApiService);

  readonly preferencije = inject(PreferencijeService);

  readonly danas = new Date().toISOString().split('T')[0];
  readonly ocene = OCENE;
  readonly putnikaPoRezervaciji = PUTNIKA_PO_REZERVACIJI;

  /** Izabrani gradovi - vrednost izbora je ceo grad, a čuva se `id`. */
  readonly polaziste = signal<Grad | null>(null);
  readonly odrediste = signal<Grad | null>(null);

  readonly greske = signal<string[] | null>(null);
  readonly prosireno = signal(false);
  readonly poslato = signal(false);

  readonly shema = this.preferencije.shema;
  readonly maxDana = computed(() => this.shema().maxDays);

  readonly forma = this.fb.nonNullable.group({
    checkIn: ['', [Validators.required]],
    checkOut: ['', [Validators.required]],
    passengers: [2, [Validators.required, Validators.min(1)]],
    budget: [null as number | null, [Validators.min(1)]],

    // Preferencije (§4.2)
    transportPriority: ['balans'],
    accommodationTypes: [['hotel', 'apartman', 'hostel'] as string[]],
    minAccommodationRating: [null as number | null],
    interests: [['kultura', 'muzeji'] as string[]],
    pace: ['umeren'],
    dayStart: ['09:00'],
    dayEnd: ['20:00']
  });

  /** Iznad 9 putnika stoji napomena o deljenju rezervacije. */
  readonly mnogoPutnika = signal(false);

  constructor() {
    this.preferencije.ucitaj().subscribe((shema) => this.primeniPodrazumevane(shema.defaults));

    // Parametri iz brze pretrage sa početne (§4.1) ili iz ranije sesije
    const postojeci = this.wizard.parametri();
    const q = this.route.snapshot.queryParamMap;

    const imaGradoveUUpitu =
      Boolean(q.get('fromCityId') && q.get('toCityId')) ||
      Boolean(q.get('from') && q.get('to'));

    if (imaGradoveUUpitu) {
      this.popuniIzUpita(q);
    } else if (postojeci) {
      this.popuniIzStanja(postojeci);
    } else {
      // Direktan ulazak u korak 1 - ponuđena je ruta sa početne strane
      this.gradovi.poIataKodu('BEG').subscribe((g) => g && this.polaziste.set(g));
      this.gradovi.poIataKodu('ATH').subscribe((g) => g && this.odrediste.set(g));
    }

    this.forma.controls.passengers.valueChanges.subscribe((v) =>
      this.mnogoPutnika.set(Number(v) > PUTNIKA_PO_REZERVACIJI)
    );
  }

  private primeniPodrazumevane(d: {
    transportPriority: string;
    accommodationTypes: string[];
    minAccommodationRating: number | null;
    interests: string[];
    pace: string;
    dayStart: string;
    dayEnd: string;
  }): void {
    // Podrazumevane vrednosti ne smeju da pregaze ono što je korisnik
    // već uneo (shema stiže asinhrono)
    if (this.wizard.parametri()) return;

    this.forma.patchValue({
      transportPriority: d.transportPriority,
      accommodationTypes: [...d.accommodationTypes],
      minAccommodationRating: d.minAccommodationRating,
      interests: [...d.interests],
      pace: d.pace,
      dayStart: d.dayStart,
      dayEnd: d.dayEnd
    });
  }

  /**
   * Popunjavanje iz adrese.
   *
   * Prihvata i `fromCityId`/`toCityId` (novo, sa početne strane) i
   * `from`/`to` kao IATA kod — stare adrese i podeljeni linkovi moraju
   * da nastave da rade.
   */
  private popuniIzUpita(q: { get: (k: string) => string | null }): void {
    this.gradovi
      .razresi(q.get('fromCityId'), q.get('from'))
      .subscribe((g) => g && this.polaziste.set(g));

    this.gradovi
      .razresi(q.get('toCityId'), q.get('to'))
      .subscribe((g) => g && this.odrediste.set(g));

    this.forma.patchValue({
      ...(q.get('checkIn') ? { checkIn: q.get('checkIn') as string } : {}),
      ...(q.get('checkOut') ? { checkOut: q.get('checkOut') as string } : {}),
      ...(q.get('passengers') ? { passengers: Number(q.get('passengers')) } : {}),
      ...(q.get('budget') ? { budget: Number(q.get('budget')) } : {})
    });

    this.mnogoPutnika.set(Number(this.forma.controls.passengers.value) > PUTNIKA_PO_REZERVACIJI);
  }

  private popuniIzStanja(p: ReturnType<PlanWizardService['parametri']>): void {
    if (!p) return;

    // Gradovi su sačuvani u stanju; starije sesije nose samo IATA kod
    if (p.fromCity) this.polaziste.set(p.fromCity);
    else this.gradovi.razresi(p.fromCityId, p.from).subscribe((g) => g && this.polaziste.set(g));

    if (p.toCity) this.odrediste.set(p.toCity);
    else this.gradovi.razresi(p.toCityId, p.to).subscribe((g) => g && this.odrediste.set(g));

    this.forma.patchValue({
      checkIn: p.checkIn,
      checkOut: p.checkOut,
      passengers: p.passengers,
      budget: p.budget,
      ...p.preferences
    });

    this.prosireno.set(true);
    this.mnogoPutnika.set(p.passengers > PUTNIKA_PO_REZERVACIJI);
  }

  // ---------------------------------------------------------------
  // Polja za potvrdu (liste)
  // ---------------------------------------------------------------

  jeIzabran(polje: 'accommodationTypes' | 'interests', kod: string): boolean {
    return this.forma.controls[polje].value.includes(kod);
  }

  prebaci(polje: 'accommodationTypes' | 'interests', kod: string): void {
    const trenutno = this.forma.controls[polje].value;

    const novo = trenutno.includes(kod)
      ? trenutno.filter((k) => k !== kod)
      : [...trenutno, kod];

    this.forma.controls[polje].setValue(novo);
  }

  // ---------------------------------------------------------------
  // Slanje
  // ---------------------------------------------------------------

  /** Validacija koja zavisi od više polja - backend je ponavlja. */
  private proveri(): string[] {
    const v = this.forma.getRawValue();
    const greske: string[] = [];

    const od = this.polaziste();
    const do_ = this.odrediste();

    if (!od || !do_) {
      greske.push(prevedi('provera.izaberiteGradove'));
    } else if (od.id === do_.id) {
      greske.push(prevedi('provera.razlicitiGradovi'));
    }

    const polazak = new Date(v.checkIn);
    const povratak = new Date(v.checkOut);

    if (polazak < new Date(this.danas)) {
      greske.push(prevedi('provera.polazakProslost'));
    }

    if (povratak <= polazak) {
      greske.push(prevedi('provera.povratakPosle'));
    } else {
      // Dan dolaska i dan povratka se broje, isto kao na backendu
      const dana = Math.round((povratak.getTime() - polazak.getTime()) / 86400000) + 1;

      if (dana > this.maxDana()) {
        greske.push(prevedi('provera.najviseDana', { max: this.maxDana(), dana }));
      }
    }

    if (v.accommodationTypes.length === 0) {
      greske.push(prevedi('korak1.tipBarJedan'));
    }

    if (v.interests.length === 0) {
      greske.push(prevedi('korak1.interesovanjeBarJedno'));
    }

    if (v.dayEnd <= v.dayStart) {
      greske.push(prevedi('korak1.krajPosle'));
    }

    return greske;
  }

  dalje(): void {
    this.forma.markAllAsTouched();
    this.greske.set(null);
    this.poslato.set(true);

    if (this.forma.invalid) return;

    const greske = this.proveri();

    if (greske.length > 0) {
      this.greske.set(greske);
      this.prosireno.set(true);
      return;
    }

    const v = this.forma.getRawValue();
    const od = this.polaziste()!;
    const do_ = this.odrediste()!;

    this.wizard.postaviParametre({
      /*
       * IATA kod koji ide u pretragu leta. Grad sa više aerodroma daje
       * kod grada (LON, PAR), pa pretraga pokriva sve njegove aerodrome;
       * grad bez aerodroma u dometu ostaje bez koda i plan se pravi bez
       * leta — server to isto radi i za `fromCityId`.
       */
      from: kodZaLet(od) ?? '',
      to: kodZaLet(do_) ?? '',
      fromCityId: od.id,
      toCityId: do_.id,
      fromCity: od,
      toCity: do_,
      checkIn: v.checkIn,
      checkOut: v.checkOut,
      passengers: Number(v.passengers),
      budget: v.budget ? Number(v.budget) : null,
      preferences: {
        transportPriority: v.transportPriority as 'najjeftinije' | 'najbrze' | 'balans',
        accommodationTypes: v.accommodationTypes as ('hotel' | 'apartman' | 'hostel')[],
        minAccommodationRating: v.minAccommodationRating,
        interests: v.interests,
        pace: v.pace as 'opusten' | 'umeren' | 'intenzivan',
        dayStart: v.dayStart,
        dayEnd: v.dayEnd
      }
    });

    this.router.navigate(['/planiranje', 2]);
  }
}
