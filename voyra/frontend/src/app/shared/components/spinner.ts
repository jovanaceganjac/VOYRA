import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TPipe } from '../../core/i18n/t.pipe';
import { LoadingService } from '../../core/services/loading.service';

@Component({
  selector: 'app-spinner',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading.ucitava()) {
      <div class="spinner-traka" role="status" [attr.aria-label]="'opste.ucitavanje' | t">
        <div class="spinner-traka__linija"></div>
      </div>
    }
  `,
  styles: `
    .spinner-traka {
      position: fixed;
      inset: 0 0 auto 0;
      height: 3px;
      z-index: 1100;
      background: color-mix(in srgb, var(--boja-primarna) 20%, transparent);
      overflow: hidden;
    }
    .spinner-traka__linija {
      width: 40%;
      height: 100%;
      background: var(--boja-primarna);
      animation: klizi 1.1s ease-in-out infinite;
    }
    @keyframes klizi {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner-traka__linija { animation: none; width: 100%; opacity: 0.6; }
    }
  `
})
export class SpinnerComponent {
  readonly loading = inject(LoadingService);
}
