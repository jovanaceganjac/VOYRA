import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, throwError } from 'rxjs';

import { prevedi } from '../i18n/prevod';
import { jeNedostupan } from '../services/api-error';
import { AuthService } from '../services/auth.service';
import { LoadingService } from '../services/loading.service';
import { ToastService } from '../services/toast.service';

/** Rute na kojima 401 znaci "pogresni podaci", a ne "istekla sesija". */
const RUTE_PRIJAVE = ['/api/users/login', '/api/users/register'];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const loading = inject(LoadingService);

  loading.pocni();

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const jePrijava = RUTE_PRIJAVE.some((r) => req.url.startsWith(r));

      // Zahtev nije stigao do aplikacije: mreza, 503 sa gateway-a ili
      // 5xx bez tela (dev proxy kada backend nije pokrenut).
      if (jeNedostupan(err)) {
        toast.greska(prevedi('greske.serverNedostupanKratko'));
        return throwError(() => err);
      }

      if (err.status === 401 && !jePrijava) {
        auth.logout();

        /*
         * `TOKEN_REVOKED` znači da je nalog promenjen dok je
         * sesija trajala — promena lozinke na drugom uređaju,
         * blokiranje ili promena uloge. Poruka to kaže, jer „sesija je
         * istekla" ne bi objasnilo zašto se dogodilo posle par minuta.
         */
        const opozvan = err.error?.error === 'TOKEN_REVOKED';

        toast.info(
          prevedi(opozvan ? 'greske.sesijaIsteklaPromenjen' : 'greske.sesijaIstekla')
        );

        router.navigate(['/prijava'], {
          queryParams: { returnUrl: router.url }
        });

        return throwError(() => err);
      }

      if (err.status === 403 && !jePrijava) {
        toast.greska(prevedi('greske.nemaPrava'));
        return throwError(() => err);
      }

      // Ostale greske resava komponenta - ona zna kontekst i prikazuje
      // poruku sa servera ispod polja.
      return throwError(() => err);
    }),
    finalize(() => loading.zavrsi())
  );
};
