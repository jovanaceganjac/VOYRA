import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { prevediServer } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../core/i18n/prevod';
import { Let } from '../../core/models/plan.model';
import { Putovanje } from '../../core/models/trip.model';
import { nazivMesta } from '../../core/models/grad.model';
import { porukaGreske, porukeGreske } from '../../core/services/api-error';
import { AuthService } from '../../core/services/auth.service';
import {
  BookingApiService,
  OdgovorRezervacije,
  ProveraPonude,
  Putnik
} from '../../core/services/booking-api.service';
import { PlanEditApiService } from '../../core/services/plan-edit-api.service';
import { ToastService } from '../../core/services/toast.service';
import { UserApiService } from '../../core/services/user-api.service';
import {
  POLOVI,
  TITULE,
  datumRodjenjaValidator,
  duzinaImenaValidator,
  imePutnikaValidator,
  porukaZaPolje,
  telefonE164Validator
} from '../../shared/validators/putnik.validator';
import { datum, novac, presedanja, trajanje, vreme } from '../../shared/format';

const KLJUC_PUTNIKA = 'voyra_putnici';

/** Najviše putnika po rezervaciji (spec §4.8). */
const MAX_PUTNIKA = 9;

type Korak = 1 | 2 | 3 | 4;

/**
 * Rezervacija leta (spec §4.8).
 *
 *   1. provera ponude  →  2. putnici  →  3. pregled i potvrda  →  PNR
 *
 * Ceo tok je u **test režimu**: rezervacija se stvarno kreira kod izvora,
 * ali se ništa ne kupuje i ne naplaćuje. To piše na svakom koraku.
 */
@Component({
  selector: 'app-rezervacija',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rezervacija.html',
  styleUrl: './rezervacija.css'
})
export class RezervacijaComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BookingApiService);
  private readonly tripApi = inject(PlanEditApiService);
  private readonly userApi = inject(UserApiService);
  private readonly toast = inject(ToastService);

  private readonly injector = inject(Injector);

  readonly auth = inject(AuthService);

  readonly datum = datum;
  readonly vreme = vreme;
  readonly novac = novac;
  readonly trajanje = trajanje;
  readonly presedanja = presedanja;
  readonly nazivMesta = nazivMesta;
  readonly titule = TITULE;
  readonly polovi = POLOVI;
  readonly porukaZaPolje = porukaZaPolje;

  readonly tripId = signal<string>('');
  readonly putovanje = signal<Putovanje | null>(null);
  readonly verzija = signal<string | null>(null);

  readonly korak = signal<Korak>(1);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);
  readonly greskeServera = signal<string[]>([]);

  // --- korak 1 ---
  readonly provera = signal<ProveraPonude | null>(null);
  readonly prihvacenaCena = signal(false);
  readonly osvezava = signal(false);
  readonly alternative = signal<Let[]>([]);
  readonly promenjeniDani = signal<{ day: number; availableFrom: string; availableTo: string }[]>(
    []
  );

  // --- korak 3 ---
  readonly potvrdaTestRezima = signal(false);
  readonly salje = signal(false);
  readonly rezultat = signal<OdgovorRezervacije | null>(null);

  readonly forma = this.fb.group({ putnici: this.fb.array([]) });

  get putnici(): FormArray {
    return this.forma.get('putnici') as FormArray;
  }

  readonly brojPutnika = computed(() => Number(this.putovanje()?.passengers) || 1);
  readonly previseputnika = computed(() => this.brojPutnika() > MAX_PUTNIKA);

  readonly let_ = computed(() => this.provera()?.flight ?? null);

  readonly cena = computed(() => this.provera()?.newPrice ?? 0);
  readonly valuta = computed(() => this.provera()?.currency ?? 'EUR');

  /** Dalje sa koraka 1 samo kada je nova cena prihvaćena. */
  readonly mozeNaPutnike = computed(() => {
    const p = this.provera();
    if (!p) return false;

    return !p.priceChanged || this.prihvacenaCena();
  });

  readonly mozeDaPotvrdi = computed(
    () => this.potvrdaTestRezima() && !this.salje() && this.rezultat() === null
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.greska.set(prevedi('rezervacija.nijePronadjeno'));
      this.ucitava.set(false);
      return;
    }

    this.tripId.set(id);
    this.ucitajPutovanje(id);
  }

  // ---------------------------------------------------------------
  // Učitavanje i korak 1
  // ---------------------------------------------------------------

  private ucitajPutovanje(id: string): void {
    this.tripApi.putovanje(id).subscribe({
      next: (o) => {
        this.putovanje.set(o.data);
        this.verzija.set(o.version);

        if (o.data.status !== 'NACRT') {
          this.ucitava.set(false);
          this.greska.set(
            o.data.status === 'REZERVISANO'
              ? prevedi('rezervacija.vecRezervisan')
              : prevedi('rezervacija.neMozeStatus', { status: prevedi(`statusi.putovanje.${o.data.status}`) })
          );
          return;
        }

        if (this.previseputnika()) {
          this.ucitava.set(false);
          return;
        }

        this.napraviFormu();
        this.proveriPonudu();
      },
      error: (err: HttpErrorResponse) => {
        this.ucitava.set(false);
        this.greska.set(
          err.status === 404
            ? prevedi('rezervacija.nijePronadjenoIliTudje')
            : porukaGreske(err, prevedi('rezervacija.nijeUcitano'))
        );
      }
    });
  }

  proveriPonudu(): void {
    this.ucitava.set(true);
    this.greska.set(null);

    this.api.proveri(this.tripId()).subscribe({
      next: (o) => {
        this.ucitava.set(false);
        this.provera.set(o);
        this.alternative.set([]);
        // Ista cena ne traži potvrdu
        this.prihvacenaCena.set(!o.priceChanged);
      },
      error: (err: HttpErrorResponse) => {
        // Istekla ponuda nije greška toka: traži se isti let u svežoj
        // pretrazi (spec §4.8)
        if (err.status === 410) {
          this.osveziPonudu();
          return;
        }

        this.ucitava.set(false);
        this.greska.set(porukaGreske(err, prevedi('rezervacija.proveraNeuspela')));
      }
    });
  }

  osveziPonudu(): void {
    this.osvezava.set(true);
    this.ucitava.set(false);
    this.greska.set(null);

    this.api.osveziPonudu(this.tripId()).subscribe({
      next: (o) => {
        this.osvezava.set(false);
        this.verzija.set(o.version);

        if (o.found) {
          this.alternative.set([]);
          this.proveriPonudu();
          return;
        }

        // Isti let više ne postoji - korisnik bira zamenu
        this.alternative.set(o.alternatives ?? []);
        this.provera.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.osvezava.set(false);
        this.greska.set(porukaGreske(err, prevedi('rezervacija.osvezavanjeNeuspelo')));
      }
    });
  }

  izaberiAlternativu(let_: Let): void {
    this.osvezava.set(true);

    this.api.zameniLet(this.tripId(), let_.offerId, this.verzija()).subscribe({
      next: (o) => {
        this.osvezava.set(false);
        this.verzija.set(o.version);
        this.promenjeniDani.set(o.changedDays ?? []);
        this.alternative.set([]);
        this.proveriPonudu();
      },
      error: (err: HttpErrorResponse) => {
        this.osvezava.set(false);
        this.toast.greska(porukaGreske(err, prevedi('rezervacija.zamenaNeuspela')));
      }
    });
  }

  // ---------------------------------------------------------------
  // Korak 2: putnici
  // ---------------------------------------------------------------

  private napraviFormu(): void {
    const povratak = this.putovanje()?.checkOut ?? '';

    this.putnici.clear();

    for (let i = 0; i < this.brojPutnika(); i++) {
      this.putnici.push(
        this.fb.group(
          {
            title: ['', [Validators.required]],
            givenName: ['', [Validators.required, imePutnikaValidator]],
            familyName: ['', [Validators.required, imePutnikaValidator]],
            gender: ['', [Validators.required]],
            bornOn: ['', [Validators.required, datumRodjenjaValidator(povratak)]],
            email: ['', [Validators.required, Validators.email]],
            phoneNumber: ['', [Validators.required, telefonE164Validator]]
          },
          { validators: duzinaImenaValidator }
        )
      );
    }

    this.vratiIzMemorije();
    this.popuniIzProfila();
  }

  /** Putnik 1 se popunjava iz profila; telefon samo ako je potvrđen. */
  private popuniIzProfila(): void {
    const prvi = this.putnici.at(0);
    if (!prvi || prvi.get('givenName')?.value) return;

    this.userApi.profil().subscribe({
      next: (o) => {
        const k = o.data;

        prvi.patchValue({
          givenName: k.ime || '',
          familyName: k.prezime || '',
          email: k.email || '',
          // Broj iz profila je proveren po obliku (E.164); SMS potvrde nema
          ...(k.phone?.number ? { phoneNumber: k.phone.number } : {})
        });

        this.izProfila.set(true);
      },
      error: () => {
        /* profil nije obavezan za rezervaciju */
      }
    });
  }

  readonly izProfila = signal(false);

  /** Unos preživljava osvežavanje stranice dok tok traje. */
  private sacuvajUMemoriju(): void {
    try {
      sessionStorage.setItem(
        `${KLJUC_PUTNIKA}_${this.tripId()}`,
        JSON.stringify(this.putnici.value)
      );
    } catch {
      /* privatni prozor - unos ostaje samo u formi */
    }
  }

  private vratiIzMemorije(): void {
    try {
      const sirovo = sessionStorage.getItem(`${KLJUC_PUTNIKA}_${this.tripId()}`);
      if (!sirovo) return;

      const sacuvani = JSON.parse(sirovo) as Putnik[];

      sacuvani.slice(0, this.putnici.length).forEach((p, i) => this.putnici.at(i).patchValue(p));
    } catch {
      /* neispravan zapis se preskače */
    }
  }

  private obrisiIzMemorije(): void {
    try {
      sessionStorage.removeItem(`${KLJUC_PUTNIKA}_${this.tripId()}`);
    } catch {
      /* nema šta da se obriše */
    }
  }

  // ---------------------------------------------------------------
  // Kretanje kroz korake
  // ---------------------------------------------------------------

  naKorak(k: Korak): void {
    this.korak.set(k);
    this.greskeServera.set([]);

    /*
     * Fokus na naslov koraka - inače čitač ekrana ostaje gde je bio.
     *
     * `afterNextRender`, a ne `setTimeout`: naslov novog koraka još ne
     * postoji u trenutku promene signala, pa bi `setTimeout` tražio
     * element koji Angular tek treba da iscrta.
     */
    afterNextRender(
      () => document.querySelector<HTMLElement>('[data-korak-naslov]')?.focus(),
      { injector: this.injector }
    );
  }

  dalje(): void {
    if (this.korak() === 1 && this.mozeNaPutnike()) {
      this.naKorak(2);
      return;
    }

    if (this.korak() === 2) {
      this.forma.markAllAsTouched();

      if (this.forma.invalid) return;

      this.sacuvajUMemoriju();
      this.naKorak(3);
    }
  }

  nazad(): void {
    if (this.korak() > 1) this.naKorak((this.korak() - 1) as Korak);
  }

  odustani(): void {
    this.obrisiIzMemorije();
    this.router.navigate(['/moja-putovanja', this.tripId()]);
  }

  /** Napuštanje toka pre kraja traži potvrdu. */
  imaNesacuvanih(): boolean {
    return this.rezultat() === null && this.korak() > 1;
  }

  // ---------------------------------------------------------------
  // Korak 3: potvrda
  // ---------------------------------------------------------------

  potvrdi(): void {
    if (!this.mozeDaPotvrdi()) return;

    this.salje.set(true);
    this.greskeServera.set([]);

    const putnici = this.putnici.value as Putnik[];

    this.api.rezervisi(this.tripId(), putnici, this.cena(), this.provera()?.offerId).subscribe({
      next: (o) => {
        this.salje.set(false);
        this.rezultat.set(o);
        this.obrisiIzMemorije();
        this.naKorak(4);
      },
      error: (err: HttpErrorResponse) => {
        this.salje.set(false);
        this.obradiGresku(err);
      }
    });
  }

  private obradiGresku(err: HttpErrorResponse): void {
    const kod = err.error?.error;

    if (err.status === 409 && kod === 'PRICE_CHANGED') {
      this.toast.greska(prevedi('rezervacija.cenaPromenjenaPotvrdite'));
      this.prihvacenaCena.set(false);
      this.naKorak(1);
      this.proveriPonudu();
      return;
    }

    if (err.status === 410) {
      this.toast.greska(prevedi('rezervacija.istekla'));
      this.naKorak(1);
      this.osveziPonudu();
      return;
    }

    if (err.status === 409 && kod === 'ALREADY_BOOKED') {
      this.toast.greska(prevedi('rezervacija.vecRezervisan'));
      this.router.navigate(['/moja-putovanja', this.tripId()]);
      return;
    }

    if (err.status === 422) {
      this.greskeServera.set([
        err.error?.message ? prevediServer(err.error.message) : prevedi('rezervacija.viseDelova')
      ]);
      return;
    }

    if (err.status === 502 || err.status === 503) {
      this.greskeServera.set([prevedi('rezervacija.avioNeOdgovara')]);
      return;
    }

    // Greške o putnicima vraćaju se kao lista i vode nazad na korak 2
    const greske = porukeGreske(err, prevedi('rezervacija.nijeUspela'));
    this.greskeServera.set(greske);

    if (err.status === 400) this.naKorak(2);
  }

  // ---------------------------------------------------------------
  // Potvrda (PDF)
  // ---------------------------------------------------------------

  preuzmiPotvrdu(): void {
    const r = this.rezultat();
    if (!r) return;

    this.api.potvrda(r.bookingId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = `voyra-potvrda-${r.bookingReference || r.bookingId}.pdf`;
        a.click();

        URL.revokeObjectURL(url);
      },
      error: () => this.toast.greska(prevedi('rezervacija.pdfNeuspeo'))
    });
  }

  // ---------------------------------------------------------------
  // Pomoćne za prikaz
  // ---------------------------------------------------------------

  grupa(i: number) {
    return this.putnici.at(i);
  }

  polje(i: number, ime: string) {
    return this.putnici.at(i).get(ime);
  }

  /** Poruka o grešci za jedno polje, samo kada ga je korisnik dirao. */
  greskaPolja(i: number, ime: string): string {
    const k = this.polje(i, ime);
    if (!k || !k.touched) return '';

    return porukaZaPolje(k.errors);
  }

  greskaGrupe(i: number): string {
    const g = this.grupa(i);
    return g?.touched ? porukaZaPolje(g.errors) : '';
  }

  zaPutnika(broj: number): string {
    return prevediBroj('rezervacija.zaPutnika', broj);
  }

  imenaPutnika(): string[] {
    return (this.putnici.value as Putnik[]).map((p) =>
      `${p.givenName} ${p.familyName}`.trim()
    );
  }
}
