import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi } from '../../../core/i18n/prevod';
import { porukeGreske } from '../../../core/services/api-error';
import { AuthService } from '../../../core/services/auth.service';
import { FieldErrorComponent } from '../../../shared/components/field-error';
import { PravilaLozinkeComponent } from '../../../shared/components/pravila-lozinke';
import { normalizujBroj, phoneValidator } from '../../../shared/validators/phone.validator';
import {
  lozinkeSePoklapaju,
  passwordValidator
} from '../../../shared/validators/password.validator';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, PravilaLozinkeComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly greska = signal<string[] | null>(null);
  readonly uspeh = signal<string | null>(null);
  readonly salje = signal(false);

  // Ogranicenja su ista kao Joi seme u user-service-u
  readonly forma = this.fb.nonNullable.group(
    {
      ime: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      prezime: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email]],
      korisnickoIme: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(20),
          Validators.pattern(/^[a-zA-Z0-9_-]+$/)
        ]
      ],
      lozinka: ['', [Validators.required, passwordValidator]],
      lozinkaConfirm: ['', [Validators.required]],
      phone: ['', [phoneValidator]]
    },
    { validators: [lozinkeSePoklapaju('lozinka', 'lozinkaConfirm')] }
  );


  /**
   * Obicna metoda, NE computed(): computed prati samo signale, a stanje
   * reactive forme to nije - vrednost bi ostala zakljucana na prvoj proveri.
   * Ovako se racuna pri svakoj proveri promena, koju okida sam unos.
   */
  nePoklapajuSe(): boolean {
    const potvrda = this.forma.controls.lozinkaConfirm;
    return this.forma.hasError('nePoklapajuSe') && (potvrda.touched || potvrda.dirty);
  }

  posalji(): void {
    this.forma.markAllAsTouched();
    this.greska.set(null);
    this.uspeh.set(null);

    if (this.forma.invalid || this.salje()) return;

    const v = this.forma.getRawValue();
    this.salje.set(true);

    this.auth
      .register({
        ime: v.ime.trim(),
        prezime: v.prezime.trim(),
        email: v.email.trim(),
        korisnickoIme: v.korisnickoIme.trim(),
        lozinka: v.lozinka,
        lozinkaConfirm: v.lozinkaConfirm,
        // Broj ide samo ako je unet; normalizuje se isto kao na backendu
        ...(v.phone.trim() ? { phone: normalizujBroj(v.phone) } : {})
      })
      .subscribe({
        next: () => {
          this.salje.set(false);
          this.forma.reset();

          // Backend NE vraca token - nalog ceka odobrenje administratora.
          // Broj telefona se ne potvrdjuje SMS-om.
          this.uspeh.set(prevedi('registracija.uspeh'));
        },
        error: (err: HttpErrorResponse) => {
          this.salje.set(false);

          this.greska.set(porukeGreske(err, prevedi('registracija.nijeUspela')));
        }
      });
  }
}
