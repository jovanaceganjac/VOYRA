import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AdminApiService } from '../../core/services/admin-api.service';
import { TPipe } from '../../core/i18n/t.pipe';

/** Odeljci panela (spec §10). */
interface Odeljak {
  putanja: string;
  naziv: string;
  /** Broj koji stoji uz stavku, npr. zahtevi na čekanju. */
  znacka?: 'zahtevi';
}

/** `naziv` je ključ prevoda. */
const ODELJCI: Odeljak[] = [
  { putanja: '/admin', naziv: 'admin.odeljci.pregled' },
  { putanja: '/admin/zahtevi', naziv: 'admin.odeljci.zahtevi', znacka: 'zahtevi' },
  { putanja: '/admin/korisnici', naziv: 'admin.odeljci.korisnici' },
  { putanja: '/admin/destinacije', naziv: 'admin.odeljci.destinacije' },
  { putanja: '/admin/atrakcije', naziv: 'admin.odeljci.atrakcije' },
  { putanja: '/admin/kategorije', naziv: 'admin.odeljci.kategorije' },
  { putanja: '/admin/statistika', naziv: 'admin.odeljci.statistika' }
];

/**
 * ADMIN PANEL (spec §10) — okvir sa navigacijom po odeljcima.
 *
 * Na širokom ekranu navigacija stoji sa strane, a na uskom se svodi na
 * padajući izbor: sedam stavki u redu bi na 360 px tražilo horizontalno
 * pomeranje, a to je upravo ono što tabele ovde izbegavaju.
 */
@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="omotac panel" data-testid="admin-panel">
      <header class="panel__zaglavlje">
        <h1>{{ 'admin.naslov' | t }}</h1>
        <p class="panel__opis">{{ 'admin.opis' | t }}</p>
      </header>

      <div class="panel__telo">
        <!-- Široki ekran: bočna navigacija -->
        <nav class="panel__nav" data-testid="admin-nav" [attr.aria-label]="'admin.odeljciAria' | t">
          <ul>
            @for (o of odeljci; track o.putanja) {
              <li>
                <a
                  [routerLink]="o.putanja"
                  data-testid="admin-nav-stavka"
                  [attr.data-putanja]="o.putanja"
                  routerLinkActive="panel__stavka--aktivna"
                  [routerLinkActiveOptions]="{ exact: o.putanja === '/admin' }"
                  class="panel__stavka">
                  {{ o.naziv | t }}
                  @if (o.znacka === 'zahtevi' && naCekanju() > 0) {
                    <span class="panel__znacka" [attr.aria-label]="'admin.naCekanjuAria' | t: { broj: naCekanju() }">
                      {{ naCekanju() }}
                    </span>
                  }
                </a>
              </li>
            }
          </ul>
        </nav>

        <!-- Uski ekran: padajući izbor umesto liste -->
        <div class="panel__izbor">
          <label for="odeljak">{{ 'admin.odeljak' | t }}</label>
          <select id="odeljak" data-testid="admin-izbor-odeljka"
                  (change)="idiNa($any($event.target).value)">
            @for (o of odeljci; track o.putanja) {
              <option [value]="o.putanja" [selected]="jeAktivan(o.putanja)">
                {{ o.naziv | t }}
                {{ o.znacka === 'zahtevi' && naCekanju() > 0 ? '(' + naCekanju() + ')' : '' }}
              </option>
            }
          </select>
        </div>

        <div class="panel__sadrzaj" data-testid="admin-sadrzaj">
          <router-outlet />
        </div>
      </div>
    </section>
  `,
  styleUrl: './admin.css'
})
export class AdminPanelComponent {
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);

  readonly odeljci = ODELJCI;

  /** Broj zahteva na čekanju - stoji uz stavku „Zahtevi". */
  readonly naCekanju = signal(0);

  constructor() {
    this.osveziZnacku();
  }

  /** Znak se osvežava i posle odluke u odeljku „Zahtevi". */
  osveziZnacku(): void {
    this.api.korisnici().subscribe({
      next: (o) => this.naCekanju.set((o.data ?? []).filter((k) => k.status === 'na_cekanju').length),
      error: () => this.naCekanju.set(0)
    });
  }

  jeAktivan(putanja: string): boolean {
    const trenutna = this.router.url.split('?')[0];

    return putanja === '/admin' ? trenutna === '/admin' : trenutna.startsWith(putanja);
  }

  idiNa(putanja: string): void {
    this.router.navigateByUrl(putanja);
  }
}
