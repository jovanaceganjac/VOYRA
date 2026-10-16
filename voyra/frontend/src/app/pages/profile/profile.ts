import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj, prevediIli } from '../../core/i18n/prevod';
import { ApiGreska } from '../../core/models/api.model';
import { porukaGreske } from '../../core/services/api-error';
import { ProfilKorisnika } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UserApiService } from '../../core/services/user-api.service';
import { FieldErrorComponent } from '../../shared/components/field-error';
import { PravilaLozinkeComponent } from '../../shared/components/pravila-lozinke';
import { normalizujBroj, phoneValidator } from '../../shared/validators/phone.validator';
import {
  lozinkeSePoklapaju,
  passwordValidator
} from '../../shared/validators/password.validator';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule, FieldErrorComponent, PravilaLozinkeComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(UserApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly profil = signal<ProfilKorisnika | null>(null);
  readonly ucitavanje = signal(true);

  readonly cuvaPodatke = signal(false);

  // --- Promena lozinke (spec §4.10) ---
  readonly cuvaLozinku = signal(false);
  readonly greskaLozinke = signal<string | null>(null);
  readonly greskeLozinke = signal<string[]>([]);
  /** Koliko sekundi treba čekati posle 429; 0 znači da nije zaključano. */
  readonly cekanjeSek = signal(0);

  readonly formaLozinke = this.fb.nonNullable.group(
    {
      trenutnaLozinka: ['', [Validators.required]],
      novaLozinka: ['', [Validators.required, passwordValidator]],
      potvrda: ['', [Validators.required]]
    },
    { validators: lozinkeSePoklapaju('novaLozinka', 'potvrda') }
  );

  readonly podaciForma = this.fb.nonNullable.group({
    ime: ['', [Validators.required, Validators.minLength(2)]],
    prezime: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [phoneValidator]]
  });

  readonly imaTelefon = computed(() => !!this.profil()?.phone?.number);
  readonly smsUkljucen = computed(() => this.profil()?.phone?.smsOptIn !== false);

  constructor() {
    this.ucitaj();
  }

  opisStatusa(status: string): string {
    return prevediIli(`statusi.nalog.${status}`, status);
  }

  private ucitaj(): void {
    this.api.profil().subscribe({
      next: (o) => {
        this.postavi(o.data);
        this.ucitavanje.set(false);
      },
      error: () => this.ucitavanje.set(false)
    });
  }

  private postavi(p: ProfilKorisnika): void {
    this.profil.set(p);

    this.podaciForma.patchValue({
      ime: p.ime,
      prezime: p.prezime,
      phone: p.phone?.number ?? ''
    });
  }

  // ---------------------------------------------------------------
  // Licni podaci i telefon
  // ---------------------------------------------------------------

  sacuvajPodatke(): void {
    this.podaciForma.markAllAsTouched();

    if (this.podaciForma.invalid || this.cuvaPodatke()) return;

    const v = this.podaciForma.getRawValue();
    this.cuvaPodatke.set(true);

    this.api
      .izmeniProfil({
        ime: v.ime.trim(),
        prezime: v.prezime.trim(),
        ...(v.phone.trim() ? { phone: normalizujBroj(v.phone) } : {})
      })
      .subscribe({
        next: (o) => {
          this.cuvaPodatke.set(false);
          this.postavi(o.data);
          this.auth.refreshProfile().subscribe();

          this.toast.uspeh(prevedi('profil.podaciSacuvani'));
        },
        error: (err: HttpErrorResponse) => {
          this.cuvaPodatke.set(false);
          this.toast.greska(porukaGreske(err, prevedi('profil.cuvanjeNeuspelo')));
        }
      });
  }

  prebaciSms(event: Event): void {
    const ukljuci = (event.target as HTMLInputElement).checked;

    this.api.smsPreferenca(ukljuci).subscribe({
      next: (o) => {
        this.postavi(o.data);
        this.toast.uspeh(
          prevedi(ukljuci ? 'profil.smsUkljucen' : 'profil.smsIskljucen')
        );
      },
      error: () => this.toast.greska(prevedi('profil.promenaNijeSacuvana'))
    });
  }
  /** Potvrda se ne poklapa - greška stoji na formi, ne na polju. */
  lozinkeSeNePoklapaju(): boolean {
    const potvrda = this.formaLozinke.controls.potvrda;

    return this.formaLozinke.hasError('nePoklapajuSe') && (potvrda.touched || potvrda.dirty);
  }

  /** „2 minuta" - vreme čekanja posle 429. */
  opisCekanja(): string {
    return prevediBroj('vreme.minut', Math.ceil(this.cekanjeSek() / 60));
  }

  promeniLozinku(): void {
    this.formaLozinke.markAllAsTouched();
    this.greskaLozinke.set(null);
    this.greskeLozinke.set([]);

    if (this.formaLozinke.invalid || this.cuvaLozinku()) return;

    const { trenutnaLozinka, novaLozinka } = this.formaLozinke.getRawValue();

    this.cuvaLozinku.set(true);

    this.api.promeniLozinku(trenutnaLozinka, novaLozinka).subscribe({
      next: (o) => {
        this.cuvaLozinku.set(false);
        this.cekanjeSek.set(0);

        // Svi ostali tokeni su upravo prestali da važe - ovaj je nov
        this.auth.zameniToken(o.token);

        this.formaLozinke.reset({ trenutnaLozinka: '', novaLozinka: '', potvrda: '' });
        this.toast.uspeh(prevedi('profil.lozinkaPromenjena'));
      },
      error: (err: HttpErrorResponse) => {
        this.cuvaLozinku.set(false);

        const telo = err.error as ApiGreska & { retryAfter?: number };

        if (err.status === 429) {
          this.cekanjeSek.set(Number(telo?.retryAfter) || 0);
        }

        if (Array.isArray(telo?.errors)) this.greskeLozinke.set(telo.errors);

        this.greskaLozinke.set(porukaGreske(err, prevedi('profil.lozinkaNije')));
      }
    });
  }

}
