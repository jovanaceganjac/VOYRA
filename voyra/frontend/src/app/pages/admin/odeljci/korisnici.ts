import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminKorisnik } from '../../../core/models/admin.model';
import { StatusNaloga, Uloga } from '../../../core/models/user.model';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { porukaGreske } from '../../../core/services/api-error';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { datum } from '../../../shared/format';
import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi, prevediIli } from '../../../core/i18n/prevod';

const STATUSI: StatusNaloga[] = ['na_cekanju', 'odobren', 'odbijen', 'blokiran'];

/**
 * Prelazi koje backend dozvoljava (user-service `config/statusi.js`).
 *
 * Ponavljaju se ovde da se korisniku ne bi nudila radnja koju server
 * odbija; server je i dalje taj koji odlučuje, ovo je samo prikaz.
 */
const PRELAZI: Record<string, StatusNaloga[]> = {
  na_cekanju: ['odobren', 'odbijen'],
  odobren: ['blokiran'],
  blokiran: ['odobren'],
  odbijen: ['odobren']
};

/** Odluke koje traže razlog - on ide korisniku u e-poruci. */
const TRAZE_RAZLOG: StatusNaloga[] = ['odbijen', 'blokiran'];

/**
 * KORISNICI (`/admin/korisnici`, spec §3.3).
 *
 * Pretraga po imenu, korisničkom imenu i e-pošti; filter po statusu i
 * ulozi; blokiranje i deblokiranje sa razlogom; promena uloge.
 * Sopstveni nalog se ne može blokirati ni obrisati.
 */
@Component({
  selector: 'app-admin-korisnici',
  standalone: true,
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './korisnici.html',
  styleUrl: '../admin.css'
})
export class AdminKorisniciComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly datum = datum;
  readonly statusi = STATUSI;

  readonly korisnici = signal<AdminKorisnik[]>([]);
  readonly ucitava = signal(true);
  readonly greska = signal<string | null>(null);

  readonly uToku = signal<string | null>(null);
  readonly brisanjeId = signal<string | null>(null);

  /** Korisnik i status za koji se traži razlog. */
  readonly odluka = signal<{ id: string; status: StatusNaloga } | null>(null);
  razlog = '';

  readonly pretraga = signal('');
  readonly filterStatusa = signal<StatusNaloga | ''>('');
  readonly filterUloge = signal<Uloga | ''>('');

  readonly mojId = computed(() => this.auth.currentUser()?.id ?? null);

  readonly prikazani = computed(() => {
    const upit = this.pretraga().trim().toLowerCase();
    const status = this.filterStatusa();
    const uloga = this.filterUloge();

    return this.korisnici().filter((k) => {
      if (status && k.status !== status) return false;
      if (uloga && k.uloga !== uloga) return false;
      if (!upit) return true;

      return (
        k.korisnickoIme.toLowerCase().includes(upit) ||
        k.email.toLowerCase().includes(upit) ||
        `${k.ime} ${k.prezime}`.toLowerCase().includes(upit)
      );
    });
  });

  constructor() {
    this.ucitaj();
  }

  ucitaj(): void {
    this.ucitava.set(true);
    this.greska.set(null);

    this.api.korisnici().subscribe({
      next: (o) => {
        this.korisnici.set(o.data ?? []);
        this.ucitava.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.ucitava.set(false);
        this.greska.set(porukaGreske(err, prevedi('adminKorisnici.nisuUcitani')));
      }
    });
  }

  opisStatusa(status: string): string {
    return prevediIli(`statusi.nalog.${status}`, status);
  }

  jaSam(k: AdminKorisnik): boolean {
    return k._id === this.mojId();
  }

  /** Statusi u koje nalog sme da pređe iz trenutnog. */
  moguciPrelazi(k: AdminKorisnik): StatusNaloga[] {
    if (this.jaSam(k)) return [];

    return PRELAZI[k.status] ?? [];
  }

  /** Naziv dugmeta za prelaz - „Odobri", „Blokiraj", „Odblokiraj"… */
  nazivPrelaza(k: AdminKorisnik, status: StatusNaloga): string {
    if (status === 'blokiran') return prevedi('adminKorisnici.blokiraj');
    if (status === 'odbijen') return prevedi('adminKorisnici.odbij');

    return prevedi(k.status === 'blokiran' ? 'adminKorisnici.odblokiraj' : 'adminKorisnici.odobri');
  }

  // ---------------------------------------------------------------
  // Izmene
  // ---------------------------------------------------------------

  private zameni(izmenjen: AdminKorisnik): void {
    this.korisnici.update((lista) =>
      lista.map((k) => (k._id === izmenjen._id ? { ...k, ...izmenjen } : k))
    );
  }

  /** Blokiranje i odbijanje prvo traže razlog; ostalo ide odmah. */
  zapocni(k: AdminKorisnik, status: StatusNaloga): void {
    if (TRAZE_RAZLOG.includes(status)) {
      this.razlog = '';
      this.odluka.set({ id: k._id, status });
      return;
    }

    this.promeniStatus(k, status);
  }

  odustani(): void {
    this.odluka.set(null);
    this.razlog = '';
  }

  promeniStatus(k: AdminKorisnik, status: StatusNaloga): void {
    this.uToku.set(k._id);

    const razlog = TRAZE_RAZLOG.includes(status) ? this.razlog.trim() : '';

    this.api.promeniStatus(k._id, status, razlog || null).subscribe({
      next: (o) => {
        this.uToku.set(null);
        this.odustani();
        this.zameni(o.data);

        const posta = o.obavestenje
          ? prevedi(o.obavesten ? 'adminKorisnici.postaPoslata' : 'adminKorisnici.postaNije')
          : '';

        this.toast.uspeh(
          prevedi('adminKorisnici.statusSada', {
            ime: k.korisnickoIme,
            status: this.opisStatusa(status),
            posta
          })
        );
      },
      error: (err: HttpErrorResponse) => {
        this.uToku.set(null);
        this.toast.greska(porukaGreske(err, prevedi('adminKorisnici.statusNeuspeo')));
      }
    });
  }

  promeniUlogu(k: AdminKorisnik, uloga: string): void {
    if (uloga === k.uloga) return;

    this.uToku.set(k._id);

    this.api.promeniUlogu(k._id, uloga as Uloga).subscribe({
      next: (o) => {
        this.uToku.set(null);
        this.zameni(o.data);
        this.toast.uspeh(
          prevedi('adminKorisnici.ulogaSada', { ime: k.korisnickoIme, uloga: prevedi(`statusi.uloga.${uloga}`) })
        );
      },
      error: (err: HttpErrorResponse) => {
        this.uToku.set(null);
        // Vrednost u <select> je već promenjena - vraća se na staru
        this.zameni({ ...k });
        this.toast.greska(porukaGreske(err, prevedi('adminKorisnici.ulogaNeuspela')));
      }
    });
  }

  potvrdiBrisanje(id: string): void {
    this.brisanjeId.set(id);
  }

  odustaniOdBrisanja(): void {
    this.brisanjeId.set(null);
  }

  obrisi(k: AdminKorisnik): void {
    this.uToku.set(k._id);

    this.api.obrisiKorisnika(k._id).subscribe({
      next: () => {
        this.uToku.set(null);
        this.brisanjeId.set(null);
        this.korisnici.update((lista) => lista.filter((u) => u._id !== k._id));
        this.toast.uspeh(prevedi('adminKorisnici.obrisan', { ime: k.korisnickoIme }));
      },
      error: (err: HttpErrorResponse) => {
        this.uToku.set(null);
        this.toast.greska(porukaGreske(err, prevedi('adminKorisnici.brisanjeNeuspelo')));
      }
    });
  }
}
