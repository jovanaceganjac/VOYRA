import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="omotac nadjeno">
      <h1>404</h1>
      <p>{{ 'stranica404.poruka' | t }}</p>
      <a routerLink="/" class="dugme">{{ 'stranica404.nazad' | t }}</a>
    </section>
  `,
  styles: `
    .nadjeno {
      text-align: center;
      padding-block: 5rem;
    }
    .nadjeno h1 {
      font-size: 4rem;
      margin-bottom: 0.25rem;
      color: var(--boja-primarna);
    }
  `
})
export class NotFoundComponent {}
