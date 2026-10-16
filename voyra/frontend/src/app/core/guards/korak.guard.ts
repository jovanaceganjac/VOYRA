import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { PlanWizardService } from '../services/plan-wizard.service';

/**
 * Čuva redosled koraka čarobnjaka (spec §4.2).
 *
 * Na korak N se ne može skočiti dok korak N−1 nije završen - inače bi
 * korisnik ručnim unosom URL-a stigao do izbora smeštaja bez parametara
 * putovanja. Preusmerava se na PRVI nezavršen korak, ne uvek na prvi, da
 * se ne gubi ono što je već popunjeno.
 */
export const korakGuard: CanActivateFn = (route) => {
  const wizard = inject(PlanWizardService);
  const router = inject(Router);

  // Korak stoji u `data` jer su koraci zasebne dece-rute, a ne parametar
  const trazeni = Number(route.data?.['korak'] ?? route.paramMap.get('korak')) || 1;
  const dozvoljeni = wizard.prviNezavrsenKorak();

  if (trazeni <= dozvoljeni) return true;

  return router.createUrlTree(['/planiranje', dozvoljeni]);
};
