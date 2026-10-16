import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj, prevediIli } from '../../core/i18n/prevod';
import { nazivMesta } from '../../core/models/grad.model';
import { Putovanje, StatusPutovanja } from '../../core/models/trip.model';
import { porukaGreske } from '../../core/services/api-error';
import { ToastService } from '../../core/services/toast.service';
import { TripApiService } from '../../core/services/trip-api.service';
import { datum, novac } from '../../shared/format';

/** Redosled u filteru - najcesce stanje prvo. */
const STATUSI: StatusPutovanja[] = ['NACRT', 'REZERVISANO', 'ZAVRSENO', 'OTKAZANO'];

@Component({
  selector: 'app-my-trips',
  standalone: true,
  imports: [FormsModule, RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-trips.html',
  styleUrl: './my-trips.css'
})
export class MyTripsComponent {
  private readonly api = inject(TripApiService);
  private readonly toast = inject(ToastService);

  readonly datum = datum;
  readonly novac = novac;
  readonly nazivMesta = nazivMesta;
  readonly statusi = STATUSI;

  readonly putovanja = signal<Putovanje[]>([]);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);

  /** Id putovanja za koje je zatražena potvrda brisanja. */
  readonly brisanjeId = signal<string | null>(null);
  readonly brise = signal(false);

  /** Id putovanja za koje je zatražena potvrda otkazivanja. */
  readonly otkazId = signal<string | null>(null);
  readonly otkazuje = signal(false);

  /** Id putovanja koje se preimenuje, i tekući unos. */
  readonly menjaId = signal<string | null>(null);
  readonly noviNaziv = signal('');
  readonly cuva = signal(false);

  readonly filter = signal<StatusPutovanja | ''>('');

  readonly prikazana = computed(() => {
    const f = this.filter();
    const sva = this.putovanja();

    return f ? sva.filter((p) => p.status === f) : sva;
  });

  constructor() {
    this.ucitaj();
  }

  ucitaj(): void {
    this.ucitava.set(true);
    this.greska.set(null);

    this.api.lista().subscribe({
      next: (o) => {
        this.putovanja.set(o.data ?? []);
        this.ucitava.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.ucitava.set(false);
        this.greska.set(porukaGreske(err, prevedi('mojaPutovanja.nisuUcitana')));
      }
    });
  }

  opisStatusa(status: StatusPutovanja): string {
    return prevediIli(`statusi.putovanje.${status}`, status);
  }

  opisNoci(broj: number): string {
    return prevediBroj('carobnjak.noc', broj);
  }

  brojPutnika(broj: number): string {
    return prevediBroj('carobnjak.putnik', broj);
  }

  /**
   * Iznos na kartici.
   *
   * Trip Service polje `budget` ima kao obavezno, pa kada korisnik budzet
   * ne unese, tamo zavrsi cena plana. Prikaz zato vodi plan: ako plan ima
   * `totalBudget.total`, prikazuje se on.
   */
  cena(p: Putovanje): number {
    return p.itinerary?.totalBudget?.total ?? p.budget;
  }

  /** Iznos je budzet samo kada ga je korisnik postavio iznad cene plana. */
  opisCene(p: Putovanje): string {
    const ukupno = p.itinerary?.totalBudget?.total;

    return prevedi(
      ukupno === undefined || ukupno === null ? 'mojaPutovanja.budzet' : 'mojaPutovanja.procenjenTrosak'
    );
  }

  /** Otkazati se moze samo ono sto jos nije otkazano ni zavrseno. */
  mozeDaSeOtkaze(p: Putovanje): boolean {
    return p.status === 'NACRT' || p.status === 'REZERVISANO';
  }

  // ---------------------------------------------------------------
  // Otkazivanje (spec §4.9)
  // ---------------------------------------------------------------

  potvrdiOtkaz(id: string): void {
    this.otkazId.set(id);
  }

  odustaniOdOtkaza(): void {
    this.otkazId.set(null);
  }

  otkazi(p: Putovanje): void {
    this.otkazuje.set(true);

    this.api.otkazi(p._id).subscribe({
      next: (o) => {
        this.otkazuje.set(false);
        this.otkazId.set(null);
        this.putovanja.update((lista) => lista.map((t) => (t._id === p._id ? o.data : t)));

        this.toast.uspeh(
          prevedi(p.status === 'REZERVISANO' ? 'mojaPutovanja.otkazanoIRez' : 'mojaPutovanja.otkazano')
        );
      },
      error: (err: HttpErrorResponse) => {
        this.otkazuje.set(false);
        // Neuspelo otkazivanje leta ostavlja putovanje rezervisanim
        this.toast.greska(porukaGreske(err, prevedi('mojaPutovanja.otkazivanjeNeuspelo')));
      }
    });
  }

  /** Broj noći iz datuma - backend ga ne vraća posebno. */
  brojNoci(p: Putovanje): number {
    const od = new Date(p.checkIn).getTime();
    const do_ = new Date(p.checkOut).getTime();

    if (Number.isNaN(od) || Number.isNaN(do_)) return 0;

    return Math.max(0, Math.round((do_ - od) / 86400000));
  }

  // ---------------------------------------------------------------
  // Preimenovanje
  // ---------------------------------------------------------------

  pocniIzmenu(p: Putovanje): void {
    this.menjaId.set(p._id);
    this.noviNaziv.set(p.title);
  }

  otkaziIzmenu(): void {
    this.menjaId.set(null);
  }

  sacuvajNaziv(p: Putovanje): void {
    const naziv = this.noviNaziv().trim();

    if (!naziv || naziv === p.title) {
      this.menjaId.set(null);
      return;
    }

    this.cuva.set(true);

    this.api.izmeni(p._id, { title: naziv }).subscribe({
      next: (o) => {
        this.cuva.set(false);
        this.menjaId.set(null);
        this.putovanja.update((lista) => lista.map((t) => (t._id === p._id ? o.data : t)));
        this.toast.uspeh(prevedi('mojaPutovanja.nazivIzmenjen'));
      },
      error: (err: HttpErrorResponse) => {
        this.cuva.set(false);
        this.toast.greska(porukaGreske(err, prevedi('mojaPutovanja.izmenaNeuspela')));
      }
    });
  }

  // ---------------------------------------------------------------
  // Brisanje
  // ---------------------------------------------------------------

  potvrdiBrisanje(id: string): void {
    this.brisanjeId.set(id);
  }

  odustaniOdBrisanja(): void {
    this.brisanjeId.set(null);
  }

  obrisi(id: string): void {
    this.brise.set(true);

    this.api.obrisi(id).subscribe({
      next: () => {
        this.brise.set(false);
        this.brisanjeId.set(null);
        this.putovanja.update((lista) => lista.filter((p) => p._id !== id));

        this.toast.uspeh(prevedi('mojaPutovanja.obrisano'));
      },
      error: (err: HttpErrorResponse) => {
        this.brise.set(false);
        this.toast.greska(porukaGreske(err, prevedi('mojaPutovanja.brisanjeNeuspelo')));
      }
    });
  }
}
