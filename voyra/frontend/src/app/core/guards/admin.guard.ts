import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/** Samo admin; obican korisnik se vraca na pocetnu. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) return true;

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/prijava'], {
      queryParams: { returnUrl: state.url }
    });
  }

  inject(ToastService).greska('Nemate pravo pristupa.');
  return router.createUrlTree(['/']);
};
