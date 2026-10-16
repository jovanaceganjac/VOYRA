import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj, prevediIli } from '../../core/i18n/prevod';
import { Atrakcija } from '../../core/models/plan.model';
import { Putovanje, StatusPutovanja } from '../../core/models/trip.model';
import { nazivMesta } from '../../core/models/grad.model';
import { porukaGreske } from '../../core/services/api-error';
import { BookingApiService, Rezervacija } from '../../core/services/booking-api.service';
import { PlanEditApiService } from '../../core/services/plan-edit-api.service';
import { PlanEditService } from '../../core/services/plan-edit.service';
import { PreferencijeService } from '../../core/services/preferencije.service';
import { ToastService } from '../../core/services/toast.service';
import { TripApiService } from '../../core/services/trip-api.service';
import { WizardApiService } from '../../core/services/wizard-api.service';
import { ItinerarComponent } from '../../shared/components/itinerar';
import { SlikaAtrakcijeComponent } from '../../shared/components/slika-atrakcije';
import { datum, datumSaDanom, novac, prelaz, razdaljina, trajanje } from '../../shared/format';

/**
 * Stranica jednog putovanja (spec §4.6, §4.9).
 *
 * Dva režima: prikaz (postojeća komponenta plana) i izmena. U režimu
 * izmene ništa se ne čuva dok korisnik to ne zatraži - server samo
 * preračunava vremena.
 */
@Component({
  selector: 'app-trip',
  standalone: true,
  imports: [FormsModule, RouterLink, ItinerarComponent, SlikaAtrakcijeComponent, TPipe],
  providers: [PlanEditService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trip.html',
  styleUrl: './trip.css'
})
export class TripComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(PlanEditApiService);
  private readonly tripApi = inject(TripApiService);
  private readonly atrakcijeApi = inject(WizardApiService);
  private readonly bookingApi = inject(BookingApiService);
  private readonly toast = inject(ToastService);
  private readonly preferencije = inject(PreferencijeService);

  readonly izmena = inject(PlanEditService);

  readonly datum = datum;
  readonly datumSaDanom = datumSaDanom;
  readonly novac = novac;
  readonly trajanje = trajanje;
  readonly razdaljina = razdaljina;
  readonly prelaz = prelaz;
  readonly nazivMesta = nazivMesta;

  readonly putovanje = signal<Putovanje | null>(null);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);

  readonly uIzmeni = signal(false);
  readonly cuva = signal(false);
  readonly generise = signal(false);

  /** Prikazani dijalozi. */
  readonly potvrdaGenerisanja = signal(false);
  readonly potvrdaOtkazivanja = signal(false);
  readonly potvrdaBrisanja = signal(false);
  readonly konflikt = signal(false);

  /** Panel za dodavanje aktivnosti: broj dana ili null. */
  readonly dodavanjeZaDan = signal<number | null>(null);
  readonly ponudjene = signal<Atrakcija[]>([]);
  readonly ucitavaPonude = signal(false);
  readonly pretraga = signal('');
  readonly kategorijaFilter = signal('');

  readonly optimizujeDan = signal<number | null>(null);

  /** Aktivna rezervacija leta (spec §4.8) - prikazuje se za REZERVISANO. */
  readonly rezervacija = signal<Rezervacija | null>(null);

  readonly status = computed(() => this.putovanje()?.status ?? null);

  /** Rezerviše se samo nacrt koji ima izabran let. */
  readonly mozeDaSeRezervise = computed(() => {
    const p = this.putovanje();
    if (!p || p.status !== 'NACRT') return false;

    const plan = p.itinerary;

    return Boolean(plan?.selectedFlight || (plan?.flights || []).length > 0);
  });

  readonly pnr = computed(
    () => this.rezervacija()?.flights?.[0]?.bookingReference || null
  );
  readonly opisStatusa = computed(() => {
    const s = this.status();
    return s ? prevediIli(`statusi.putovanje.${s}`, s) : '';
  });

  /** Menja se samo NACRT i REZERVISANO (§4.9). */
  readonly moguceIzmeniti = signal(false);

  readonly plan = computed(() => this.putovanje()?.itinerary ?? null);

  readonly let_ = computed(
    () => this.plan()?.selectedFlight ?? this.plan()?.flights?.[0] ?? null
  );

  readonly smestaj = computed(
    () => this.plan()?.selectedAccommodation ?? this.plan()?.accommodations?.[0] ?? null
  );

  /** Plan koji se prikazuje u režimu izmene - sa lokalnim izmenama. */
  readonly planZaPrikaz = computed(() => {
    const p = this.plan();
    if (!p) return null;

    return this.uIzmeni()
      ? { ...p, itinerary: this.izmena.dani(), totalBudget: this.izmena.trosak() ?? p.totalBudget }
      : p;
  });

  /** Id-jevi atrakcija koje su već negde u planu - za panel dodavanja. */
  readonly uPlanu = computed(
    () => new Set(this.izmena.dani().flatMap((d) => (d.attractions ?? []).map((a) => a.id)))
  );

  readonly kategorijeUPonudi = computed(() => {
    const skup = new Set<string>();

    for (const a of this.ponudjene()) {
      for (const k of a.categories ?? (a.category ? [a.category] : [])) skup.add(k);
    }

    return [...skup];
  });

  readonly prikazanePonude = computed(() => {
    const tekst = this.pretraga().trim().toLowerCase();
    const kategorija = this.kategorijaFilter();

    return this.ponudjene().filter((a) => {
      const poNazivu = !tekst || a.name.toLowerCase().includes(tekst);
      const poKategoriji =
        !kategorija || (a.categories ?? [a.category]).includes(kategorija);

      return poNazivu && poKategoriji;
    });
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.greska.set(prevedi('putovanje.nijePronadjeno'));
      this.ucitava.set(false);
    } else {
      this.ucitaj(id);
    }
  }

  // ---------------------------------------------------------------
  // Učitavanje
  // ---------------------------------------------------------------

  private ucitaj(id: string, poruka?: string): void {
    this.ucitava.set(true);
    this.greska.set(null);

    this.api.putovanje(id).subscribe({
      next: (o) => {
        this.ucitava.set(false);
        this.putovanje.set(o.data);
        this.moguceIzmeniti.set(o.editable);
        this.izmena.pocni(o.data, o.version);
        this.ucitajRezervaciju(o.data);

        if (poruka) this.toast.uspeh(poruka);
      },
      error: (err: HttpErrorResponse) => {
        this.ucitava.set(false);
        this.greska.set(
          err.status === 404
            ? prevedi('putovanje.nijePronadjenoIliTudje')
            : porukaGreske(err, prevedi('putovanje.nijeUcitano'))
        );
      }
    });
  }

  /** Rezervacija se traži samo kada putovanje može da je ima. */
  private ucitajRezervaciju(trip: Putovanje): void {
    if (trip.status !== 'REZERVISANO' && trip.status !== 'ZAVRSENO') {
      this.rezervacija.set(null);
      return;
    }

    this.bookingApi.zaPutovanje(trip._id).subscribe({
      next: (o) => {
        const aktivna = (o.data || []).find((r) => r.status === 'CONFIRMED') || null;
        this.rezervacija.set(aktivna);
      },
      error: () => this.rezervacija.set(null)
    });
  }

  /** PDF potvrda se preuzima kao `blob`; odgovor je binaran. */
  preuzmiPotvrdu(): void {
    const r = this.rezervacija();
    if (!r) return;

    this.bookingApi.potvrda(r.bookingId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = `voyra-potvrda-${this.pnr() || r.bookingId}.pdf`;
        a.click();

        URL.revokeObjectURL(url);
      },
      error: () => this.toast.greska(prevedi('putovanje.pdfNeuspeo'))
    });
  }

  // ---------------------------------------------------------------
  // Režim izmene
  // ---------------------------------------------------------------

  pocniIzmenu(): void {
    const p = this.putovanje();
    if (!p || !this.moguceIzmeniti()) return;

    this.izmena.pocni(p, this.izmena.verzija());
    this.uIzmeni.set(true);
  }

  odbaciIzmene(): void {
    this.izmena.odbaci();
    this.uIzmeni.set(false);
    this.dodavanjeZaDan.set(null);
  }

  /** Napuštanje stranice sa nesačuvanim izmenama traži potvrdu. */
  imaNesacuvanih(): boolean {
    return this.uIzmeni() && this.izmena.imaIzmena();
  }

  sacuvaj(): void {
    const p = this.putovanje();
    if (!p || this.cuva() || !this.izmena.imaIzmena()) return;

    this.cuva.set(true);

    this.api.sacuvaj(p._id, this.izmena.izmene(), this.izmena.verzija()).subscribe({
      next: (o) => {
        this.cuva.set(false);
        this.putovanje.set(o.data);
        this.moguceIzmeniti.set(o.editable);
        this.izmena.oznaciSacuvano(o.data, o.version);
        this.uIzmeni.set(false);
        this.toast.uspeh(prevedi('putovanje.izmeneSacuvane'));
      },
      error: (err: HttpErrorResponse) => {
        this.cuva.set(false);

        if (err.status === 409 && err.error?.error === 'VERSION_CONFLICT') {
          this.konflikt.set(true);
          return;
        }

        this.toast.greska(porukaGreske(err, prevedi('putovanje.izmeneNisu')));
      }
    });
  }

  // --- konflikt verzije ---

  /** „Učitaj novu verziju" - lokalne izmene se gube. */
  ucitajNovuVerziju(): void {
    const p = this.putovanje();
    this.konflikt.set(false);
    this.uIzmeni.set(false);

    if (p) this.ucitaj(p._id, prevedi('putovanje.novijaVerzija'));
  }

  /** „Zadrži moje izmene" - iste izmene se šalju iznad nove verzije. */
  zadrziMojeIzmene(): void {
    const p = this.putovanje();
    if (!p) return;

    this.konflikt.set(false);
    this.cuva.set(true);

    this.api.putovanje(p._id).subscribe({
      next: (o) => {
        this.izmena.postaviVerziju(o.version);
        this.cuva.set(false);
        this.sacuvaj();
      },
      error: (err: HttpErrorResponse) => {
        this.cuva.set(false);
        this.toast.greska(porukaGreske(err, prevedi('putovanje.novaNeuspela')));
      }
    });
  }

  // ---------------------------------------------------------------
  // Radnje nad aktivnostima
  // ---------------------------------------------------------------

  gore(dan: number, a: Atrakcija): void {
    this.izmena.pomeriGore(dan, a.id);
    this.vratiFokus(a.id);
  }

  dole(dan: number, a: Atrakcija): void {
    this.izmena.pomeriDole(dan, a.id);
    this.vratiFokus(a.id);
  }

  ukloni(dan: number, a: Atrakcija): void {
    this.izmena.ukloni(dan, a.id);
  }

  premesti(izDana: number, a: Atrakcija, uDan: string): void {
    const broj = Number(uDan);
    if (!Number.isFinite(broj)) return;

    this.izmena.premesti(izDana, a.id, broj);
    this.vratiFokus(a.id);
  }

  /** Fokus ostaje na premeštenoj aktivnosti (pristupačnost). */
  private vratiFokus(id: string): void {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-fokus="${id}"]`);
      el?.focus();
    });
  }

  optimizuj(dan: number): void {
    const p = this.putovanje();
    if (!p || this.optimizujeDan() !== null) return;

    const dani = this.izmena.dani().find((d) => d.day === dan);
    if (!dani) return;

    this.optimizujeDan.set(dan);

    this.api
      .optimizuj(p._id, dan, (dani.attractions ?? []).map((a) => a.id))
      .subscribe({
        next: (o) => {
          this.optimizujeDan.set(null);
          this.izmena.primeniOptimizaciju(o.day);
        },
        error: (err: HttpErrorResponse) => {
          this.optimizujeDan.set(null);
          this.toast.greska(porukaGreske(err, prevedi('putovanje.optimizacijaNeuspela')));
        }
      });
  }

  // ---------------------------------------------------------------
  // Dodavanje aktivnosti
  // ---------------------------------------------------------------

  otvoriDodavanje(dan: number): void {
    this.dodavanjeZaDan.set(dan);
    this.pretraga.set('');
    this.kategorijaFilter.set('');

    if (this.ponudjene().length > 0) return;

    const p = this.putovanje();
    if (!p) return;

    this.ucitavaPonude.set(true);

    this.atrakcijeApi.atrakcije(p.to, p.preferences?.interests ?? []).subscribe({
      next: (o) => {
        this.ucitavaPonude.set(false);
        this.ponudjene.set(o.data);
      },
      error: () => {
        this.ucitavaPonude.set(false);
        this.toast.greska(prevedi('putovanje.listaNedostupna'));
      }
    });
  }

  zatvoriDodavanje(): void {
    this.dodavanjeZaDan.set(null);
  }

  dodaj(a: Atrakcija): void {
    const dan = this.dodavanjeZaDan();
    if (dan === null || this.uPlanu().has(a.id)) return;

    this.izmena.dodaj(dan, a);
    this.dodavanjeZaDan.set(null);
  }

  // ---------------------------------------------------------------
  // Generiši ponovo, otkazivanje, brisanje
  // ---------------------------------------------------------------

  generisiPonovo(): void {
    const p = this.putovanje();
    if (!p || this.generise()) return;

    this.potvrdaGenerisanja.set(false);
    this.generise.set(true);

    this.api.generisiPonovo(p._id).subscribe({
      next: (o) => {
        this.generise.set(false);
        this.putovanje.set(o.data);
        this.moguceIzmeniti.set(o.editable);
        this.izmena.oznaciSacuvano(o.data, o.version);
        this.uIzmeni.set(false);
        this.toast.uspeh(prevedi('putovanje.napravljenIznova'));
      },
      error: (err: HttpErrorResponse) => {
        this.generise.set(false);
        this.toast.greska(porukaGreske(err, prevedi('putovanje.generisanjeNeuspelo')));
      }
    });
  }

  otkazi(): void {
    const p = this.putovanje();
    if (!p) return;

    this.potvrdaOtkazivanja.set(false);

    this.tripApi.otkazi(p._id).subscribe({
      next: () => this.ucitaj(p._id, prevedi('putovanje.otkazano')),
      error: (err: HttpErrorResponse) =>
        this.toast.greska(porukaGreske(err, prevedi('putovanje.otkazivanjeNeuspelo')))
    });
  }

  obrisi(): void {
    const p = this.putovanje();
    if (!p) return;

    this.potvrdaBrisanja.set(false);

    this.tripApi.obrisi(p._id).subscribe({
      next: () => {
        this.toast.uspeh(prevedi('putovanje.obrisano'));
        this.router.navigate(['/moja-putovanja']);
      },
      error: (err: HttpErrorResponse) =>
        this.toast.greska(porukaGreske(err, prevedi('putovanje.brisanjeNeuspelo')))
    });
  }

  mozeDaSeOtkaze(): boolean {
    const s = this.status();
    return s === 'NACRT' || s === 'REZERVISANO';
  }

  mozeDaSeObrise(): boolean {
    const s = this.status();
    return s === 'NACRT' || s === 'OTKAZANO';
  }

  // ---------------------------------------------------------------
  // Pomoćne za prikaz
  // ---------------------------------------------------------------

  naziv(kod: string): string {
    return this.preferencije.naziv(kod);
  }

  brojPutnika(broj: number): string {
    return prevediBroj('carobnjak.putnik', broj);
  }

  /** „2 aktivnosti krše radno vreme..." - rečenica uz broj. */
  opisKrsenjaBroj(broj: number): string {
    return prevediBroj('putovanje.krsenje', broj);
  }

  kategorije(a: Atrakcija): string[] {
    if (a.categories?.length) return a.categories;
    return a.category ? [a.category] : [];
  }

  /** Dani u koje se aktivnost može premestiti. */
  drugiDani(dan: number): number[] {
    return this.izmena.dani().map((d) => d.day).filter((d) => d !== dan);
  }

  opisKrsenja(v: string | null | undefined): string {
    if (v === 'zatvoreno') return prevedi('putovanje.zatvoreno');
    if (v === 'posle_kraja_dana') return prevedi('putovanje.posleKraja');

    return '';
  }
}
