import { ChangeDetectionStrategy, Component } from '@angular/core';

import { TPipe } from '../core/i18n/t.pipe';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="podnozje">
      <div class="omotac podnozje__sadrzaj">
        <p class="podnozje__ime">VOYRA</p>

        <!--
          Navođenje izvora referentnih podataka. GeoNames je pod licencom
          CC BY 4.0, koja navođenje IZRIČITO zahteva; OurAirports je u
          javnom domenu, pa je navođenje ovde stvar poštenja, ne obaveze.
        -->
        <p class="podnozje__izvori">
          {{ 'podnozje.gradovi' | t }}
          <span class="podnozje__celina"
            ><a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>
          (<a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            >CC BY 4.0</a
          >)</span
          >
          <span class="podnozje__tacka" aria-hidden="true">&middot;</span>
          {{ 'podnozje.aerodromi' | t }}
          <a href="https://ourairports.com/" target="_blank" rel="noopener noreferrer">OurAirports</a>
        </p>

        <p class="podnozje__prava">&copy; {{ godina }} Voyra</p>
      </div>
    </footer>
  `,
  styles: `
    .podnozje {
      margin-top: auto;
      padding-block: var(--razmak-4) var(--razmak-3);
      background: var(--boja-povrsina);
      border-top: 1px solid var(--boja-ivica);
      color: var(--boja-tekst-slab);
      font-size: 0.88rem;
    }
    .podnozje__sadrzaj {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .podnozje__ime {
      margin: 0;
      font-family: var(--font-naslov);
      font-size: 1.15rem;
      letter-spacing: 0.35em;
      /* razmak posle poslednjeg slova, da naziv bude tacno na sredini */
      margin-right: -0.35em;
      color: var(--boja-primarna);
    }
    .podnozje__izvori {
      margin: 0.75rem 0 0;
      padding-top: 0.75rem;
      border-top: 1px solid var(--boja-ivica);
      max-width: 40rem;
      font-size: 0.8rem;
      line-height: 1.7;
    }
    .podnozje__celina {
      white-space: nowrap;
    }
    .podnozje__tacka {
      margin-inline: 0.5rem;
    }
    .podnozje__izvori a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .podnozje__izvori a:hover,
    .podnozje__izvori a:focus-visible {
      color: var(--boja-primarna);
    }
    .podnozje__prava {
      margin: 0.35rem 0 0;
      font-size: 0.75rem;
      opacity: 0.8;
    }
  `
})
export class FooterComponent {
  readonly godina = new Date().getFullYear();
}
