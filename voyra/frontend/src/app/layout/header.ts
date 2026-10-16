import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { I18nService } from '../core/i18n/i18n.service';
import { TPipe } from '../core/i18n/t.pipe';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class HeaderComponent {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly meniOtvoren = signal(false);

  prebaciMeni(): void {
    this.meniOtvoren.update((v) => !v);
  }

  zatvoriMeni(): void {
    this.meniOtvoren.set(false);
  }

  odjava(): void {
    this.auth.logout();
    this.zatvoriMeni();
    this.toast.info(this.i18n.t('nav.odjavljeni'));
    this.router.navigate(['/']);
  }
}
