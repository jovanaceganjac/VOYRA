import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TPipe } from '../../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../../core/i18n/prevod';
import { porukaGreske } from '../../../core/services/api-error';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { FieldErrorComponent } from '../../../shared/components/field-error';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  readonly greska = signal<string | null>(null);

  /** Sekundi čekanja posle 429; dok traje, dugme je isključeno. */
  readonly cekanjeSek = signal(0);
  readonly salje = signal(false);

  readonly forma = this.fb.nonNullable.group({
    korisnickoIme: ['', [Validators.required]],
    lozinka: ['', [Validators.required]]
  });

  posalji(): void {
    this.forma.markAllAsTouched();
    this.greska.set(null);
    this.cekanjeSek.set(0);

    if (this.forma.invalid || this.salje()) return;

    this.salje.set(true);

    this.auth.login(this.forma.getRawValue()).subscribe({
      next: () => {
        this.salje.set(false);
        this.toast.uspeh(prevedi('prijava.uspesno'));

        const q = this.route.snapshot.queryParamMap;
        const povratak = q.get('returnUrl') ?? '/';
        const sesija = q.get('sesija');

        // Gost koji je čuvao plan vraća se na TAJ plan, koji se onda
        // čuva bez ponovnog generisanja
        if (sesija) {
          this.router.navigate([povratak], { queryParams: { sesija } });
          return;
        }

        this.router.navigateByUrl(povratak);
      },
      error: (err: HttpErrorResponse) => {
        this.salje.set(false);

        /*
         * Backend razlikuje slučajeve: 401 pogrešni podaci (ista poruka
         * za nepostojećeg korisnika i pogrešnu lozinku), 403 nalog na
         * čekanju / odbijen / blokiran, 429 previše pokušaja.
         */
        if (err.status === 429) {
          const sekundi = Number(err.error?.retryAfter) || 0;
          const minuta = Math.max(1, Math.ceil(sekundi / 60));

          this.cekanjeSek.set(sekundi);
          this.greska.set(
            prevedi('prijava.previsePokusaja', { vreme: prevediBroj('vreme.minut', minuta) })
          );

          return;
        }

        this.cekanjeSek.set(0);
        this.greska.set(porukaGreske(err, prevedi('prijava.nijeUspela')));
      }
    });
  }
}
