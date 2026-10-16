import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TPipe } from '../../core/i18n/t.pipe';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-oblast" data-testid="toast-oblast" aria-live="polite" aria-atomic="true">
      @for (t of toast.poruke(); track t.id) {
        <div class="toast" data-testid="toast" [attr.data-vrsta]="t.vrsta"
             [class]="'toast--' + t.vrsta">
          <span data-testid="toast-poruka">{{ t.poruka }}</span>
          <button type="button" class="toast__x" (click)="toast.zatvori(t.id)" [attr.aria-label]="'opste.zatvori' | t">
            &times;
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-oblast {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: min(22rem, calc(100vw - 2rem));
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: var(--radijus);
      border-left: 4px solid;
      background: var(--boja-povrsina);
      box-shadow: var(--senka);
      font-size: 0.9rem;
    }
    .toast--uspeh { border-color: var(--boja-uspeh); }
    .toast--greska { border-color: var(--boja-greska); }
    .toast--info { border-color: var(--boja-primarna); }
    .toast__x {
      margin-left: auto;
      background: none;
      border: 0;
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      color: var(--boja-tekst-slab);
    }
  `
})
export class ToastComponent {
  readonly toast = inject(ToastService);
}
