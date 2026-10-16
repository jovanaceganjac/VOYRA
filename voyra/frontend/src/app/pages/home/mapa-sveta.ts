import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

import { TPipe } from '../../core/i18n/t.pipe';
import { PopularnaDestinacija } from '../../core/models/sadrzaj.model';

/**
 * Koordinatni sistem mape: dimenzije izvorne slike (`pozadina-mapa.jpg`).
 * `mapa-kontinenti.webp` je ista mapa bez mreže i granica, uvećana 1,5×,
 * pa kalibracija gradova važi i za nju.
 */
const SIRINA = 1672;
const VISINA = 941;

/** Tačka na mapi (Evropa) koja se postavlja na zadato mesto u okviru. */
const SIDRO = { x: 860, y: 300 };

/** Središte i poluprečnik „globusa" - mekanog kruga oko kontinenata. */
const GLOBUS = { x: 900, y: 470, r: 780 };

/**
 * Geografske koordinate -> piksel na slici mape.
 *
 * Slika nije u poznatoj standardnoj projekciji, pa je preslikavanje
 * kalibrisano po obalama (Gibraltar, Bosfor, Land's End, Sankt Peterburg,
 * Bejrut): bilinearni model, greška do ~3 px na slici. Važi za Evropu i
 * okolinu - samo tu Voyra i ima destinacije.
 */
const naSlici = (lat: number, lon: number): { x: number; y: number } => ({
  x: 775.272 + 5.107 * lon + 0.4831 * lat - 0.0337 * lon * lat,
  y: 529.9916 + 0.0181 * lon - 4.8544 * lat - 0.0011 * lon * lat
});

const uEvropi = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat > 30 && lat < 72 && lon > -30 && lon < 50;

/** Ruta preko Atlantika: Njujork -> Beograd, luk iznad okeana. */
const POCETAK = { x: 540, y: 322 };
const KRAJ = naSlici(44.8, 20.46);
const RUTA = `M${POCETAK.x},${POCETAK.y} Q705,160 ${KRAJ.x.toFixed(1)},${KRAJ.y.toFixed(1)}`;

/** Avion (24×24, nos nagore) - ista silueta kao u znaku aplikacije. */
const AVION =
  'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

const TRAJANJE_MS = 3400;
const KASNJENJE_MS = 500;

/**
 * Mapa sveta u naslovnom delu početne strane.
 *
 * - avion jednom preleti isprekidanu rutu pri učitavanju; kada je u
 *   sistemu isključena animacija (`prefers-reduced-motion`), ruta i avion
 *   su odmah na kraju, bez pokreta;
 * - svetleće tačke su gradovi iz sekcije „Popularno" i vode u planiranje.
 *
 * Globus je bleda, poluprovidna mapa bez mreže i granica, kao vodeni žig;
 * isti račun razmere postavlja tačke, pa one ostaju na gradu na svakoj
 * širini.
 */
@Component({
  selector: 'app-mapa-sveta',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="mapa"
      [attr.viewBox]="'0 0 ' + okvir().w + ' ' + okvir().h"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <!-- Globus: bleda plava površina koja se ka ivicama gubi u pozadini -->
        <radialGradient id="mapa-globus" gradientUnits="userSpaceOnUse"
                        [attr.cx]="globus.x" [attr.cy]="globus.y" [attr.r]="globus.r">
          <stop offset="0" stop-color="#9fbbdd" stop-opacity="0.16" />
          <stop offset="0.72" stop-color="#9fbbdd" stop-opacity="0.08" />
          <stop offset="1" stop-color="#9fbbdd" stop-opacity="0" />
        </radialGradient>

        <!-- Kontinenti bledе ka ivici globusa -->
        <radialGradient id="mapa-bledi" gradientUnits="userSpaceOnUse"
                        [attr.cx]="globus.x" [attr.cy]="globus.y" [attr.r]="globus.r * 1.05">
          <stop offset="0.45" stop-color="#fff" stop-opacity="1" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <mask id="mapa-maska-globusa" maskUnits="userSpaceOnUse"
              x="0" y="0" [attr.width]="sirina" [attr.height]="visina">
          <rect [attr.width]="sirina" [attr.height]="visina" fill="url(#mapa-bledi)" />
        </mask>

        <!-- Svetlo polje iza naslova - tekst ostaje potpuno čitljiv -->
        <radialGradient id="mapa-oreol">
          <stop offset="0" stop-color="#fefbf6" stop-opacity="0.92" />
          <stop offset="0.6" stop-color="#fefbf6" stop-opacity="0.55" />
          <stop offset="1" stop-color="#fefbf6" stop-opacity="0" />
        </radialGradient>

        <!-- Plavi sjaj oko aviona (svetli i na svetloj pozadini) -->
        <filter id="mapa-sjaj" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="zamuceno" />
          <feFlood flood-color="#6f9ad6" flood-opacity="0.95" />
          <feComposite in2="zamuceno" operator="in" result="sjaj" />
          <feMerge>
            <feMergeNode in="sjaj" />
            <feMergeNode in="sjaj" />
            <feMergeNode in="sjaj" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id="mapa-avion-oreol">
          <stop offset="0" stop-color="#8fb3e6" stop-opacity="0.75" />
          <stop offset="1" stop-color="#8fb3e6" stop-opacity="0" />
        </radialGradient>

        <!-- Maska otkriva isprekidanu rutu iza aviona -->
        <mask id="mapa-otkrij" maskUnits="userSpaceOnUse">
          <path
            [attr.d]="putanjaRute"
            fill="none"
            stroke="#fff"
            stroke-width="14"
            pathLength="1"
            stroke-dasharray="1"
            [attr.stroke-dashoffset]="1 - napredak()"
          />
        </mask>
      </defs>

      <g [attr.transform]="'translate(' + okvir().dx + ' ' + okvir().dy + ') scale(' + okvir().s + ')'">
        <circle [attr.cx]="globus.x" [attr.cy]="globus.y" [attr.r]="globus.r" fill="url(#mapa-globus)" />

        <image
          class="kontinenti"
          href="/mapa-kontinenti.webp"
          [attr.width]="sirina"
          [attr.height]="visina"
          mask="url(#mapa-maska-globusa)"
        />
      </g>

      <ellipse
        [attr.cx]="okvir().w / 2"
        [attr.cy]="okvir().h * 0.46"
        [attr.rx]="okvir().w * 0.34"
        [attr.ry]="okvir().h * 0.36"
        fill="url(#mapa-oreol)"
      />

      <g [attr.transform]="'translate(' + okvir().dx + ' ' + okvir().dy + ') scale(' + okvir().s + ')'">
        <path #rutaEl class="ruta" [attr.d]="putanjaRute" mask="url(#mapa-otkrij)" />

        @if (napredak() >= 1) {
          <circle class="cilj" [attr.cx]="kraj.x" [attr.cy]="kraj.y" [attr.r]="5 / okvir().s" />
        }

        @if (avion(); as a) {
          <g class="avion" [attr.transform]="a">
            <circle cx="12" cy="12" r="16" fill="url(#mapa-avion-oreol)" />
            <path [attr.d]="avionPutanja" filter="url(#mapa-sjaj)" />
          </g>
        }
      </g>
    </svg>

    <!-- Tačke su iznad teksta, da bi mogle da se kliknu -->
    <div class="tacke">
      @for (t of tacke(); track t.gradId; let i = $index) {
        <button
          type="button"
          class="tacka"
          data-testid="mapa-tacka"
          [attr.data-grad]="t.gradId"
          [style.left.px]="t.left"
          [style.top.px]="t.top"
          [style.animation-delay.ms]="600 + i * 120"
          [attr.aria-label]="'pocetna.mapaTacka' | t: { grad: t.naziv }"
          (click)="izaberi.emit(t.gradId)"
        >
          <span class="tacka__oznaka" aria-hidden="true">{{ t.naziv }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    /* Globus je nešto veći od naslovnog dela i nastavlja se iza forme */
    :host {
      position: absolute;
      inset: 0 0 -9rem 0;
      display: block;
      overflow: hidden;
      pointer-events: none;
      /* Donja ivica se neprimetno gubi u pozadini stranice */
      -webkit-mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
      mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
    }
    .mapa {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }
    .kontinenti {
      opacity: 0.36;
    }
    .ruta {
      fill: none;
      stroke: rgba(92, 128, 176, 0.55);
      stroke-width: 1.6;
      stroke-dasharray: 5 7;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }
    .cilj {
      fill: none;
      stroke: rgba(92, 128, 176, 0.6);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
    }
    .avion path {
      fill: #fefbf6;
    }
    .tacke {
      position: absolute;
      inset: 0;
      z-index: 2;
    }
    .tacka {
      position: absolute;
      width: 1.5rem;
      height: 1.5rem;
      margin: -0.75rem 0 0 -0.75rem;
      padding: 0;
      background: none;
      border: 0;
      border-radius: 50%;
      cursor: pointer;
      pointer-events: auto;
      opacity: 0;
      animation: tacka-pojava 500ms ease-out forwards;
    }
    /* Svetleće jezgro i talas oko njega */
    .tacka::before,
    .tacka::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      border-radius: 50%;
      transform: translate(-50%, -50%);
    }
    .tacka::before {
      width: 0.55rem;
      height: 0.55rem;
      background: radial-gradient(circle, #fefbf6 35%, #9dbde6 100%);
      box-shadow:
        0 0 0.35rem 0.12rem rgba(111, 154, 214, 0.9),
        0 0 1rem 0.35rem rgba(140, 180, 232, 0.55);
    }
    .tacka::after {
      width: 0.55rem;
      height: 0.55rem;
      border: 1px solid rgba(111, 154, 214, 0.8);
      box-shadow: 0 0 0.3rem rgba(140, 180, 232, 0.6);
      animation: tacka-talas 2.4s ease-out infinite;
    }
    .tacka__oznaka {
      position: absolute;
      left: 50%;
      bottom: calc(100% + 0.25rem);
      transform: translate(-50%, 0.2rem);
      padding: 0.15rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
      color: var(--boja-primarna);
      background: var(--boja-pozadina);
      border-radius: var(--radijus);
      box-shadow: var(--senka);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--prelaz), transform var(--prelaz);
    }
    .tacka:hover .tacka__oznaka,
    .tacka:focus-visible .tacka__oznaka {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    .tacka:focus-visible {
      outline: 2px solid var(--boja-primarna);
      outline-offset: 2px;
    }
    @keyframes tacka-pojava {
      to { opacity: 1; }
    }
    @keyframes tacka-talas {
      from { width: 0.55rem; height: 0.55rem; opacity: 0.9; }
      to { width: 1.9rem; height: 1.9rem; opacity: 0; }
    }
    /* Na telefonu bi tačke pale preko naslova; iste destinacije su tada
       kartice u sekciji „Popularno" ispod forme */
    @media (max-width: 600px) {
      .tacke { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tacka { animation: none; opacity: 1; }
      .tacka::after { animation: none; opacity: 0; }
    }
  `
})
export class MapaSvetaComponent implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zona = inject(NgZone);
  private readonly unistavanje = inject(DestroyRef);

  /** Gradovi iz sekcije „Popularno". */
  readonly popularne = input<PopularnaDestinacija[]>([]);

  /** Klik na tačku - id grada za planiranje. */
  readonly izaberi = output<string>();

  readonly sirina = SIRINA;
  readonly visina = VISINA;
  readonly globus = GLOBUS;
  readonly putanjaRute = RUTA;
  readonly kraj = KRAJ;
  readonly avionPutanja = AVION;

  private readonly rutaEl = viewChild<ElementRef<SVGPathElement>>('rutaEl');

  /** Veličina okvira i razmera/pomeraj mape u njemu. */
  readonly okvir = signal({ w: 1, h: 1, s: 1, dx: 0, dy: 0 });

  /** 0 = avion na početku rute, 1 = sleteo. */
  readonly napredak = signal(0);

  readonly tacke = computed(() => {
    const { s, dx, dy } = this.okvir();

    return this.popularne()
      .filter((p) => uEvropi(Number(p.lat), Number(p.lon)))
      .map((p) => {
        const { x, y } = naSlici(Number(p.lat), Number(p.lon));

        return { gradId: p.gradId, naziv: p.naziv, left: dx + x * s, top: dy + y * s };
      });
  });

  /** Položaj i nagib aviona na ruti. */
  readonly avion = computed(() => {
    const el = this.rutaEl()?.nativeElement;
    const p = this.napredak();
    if (!el || typeof el.getTotalLength !== 'function') return null;

    const duzina = el.getTotalLength();
    if (!duzina) return null;

    const tacka = el.getPointAtLength(Math.min(1, p) * duzina);
    const ispred = el.getPointAtLength(Math.min(duzina, Math.min(1, p) * duzina + 1));
    const iza = el.getPointAtLength(Math.max(0, Math.min(1, p) * duzina - 1));
    const ugao = (Math.atan2(ispred.y - iza.y, ispred.x - iza.x) * 180) / Math.PI + 90;

    // Avion je ~22 px na ekranu bez obzira na razmeru mape
    const k = 0.95 / this.okvir().s;

    return `translate(${tacka.x.toFixed(1)} ${tacka.y.toFixed(1)}) rotate(${ugao.toFixed(1)}) scale(${k.toFixed(3)}) translate(-12 -12)`;
  });

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;

    const izmeri = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;

      /*
       * Asimetrično: globus je veći od okvira, a Evropa (sidro) stoji
       * desno i iznad naslova, pa tačke i ruta ne padaju preko teksta.
       * Na uskom ekranu globus je još veći, a sidro bliže sredini.
       */
      const usko = w < 700;
      const s = usko ? (w * 2.3) / SIRINA : Math.max((w * 1.3) / SIRINA, (h * 1.45) / VISINA);
      const cilj = usko ? { x: w * 0.6, y: h * 0.12 } : { x: w * 0.74, y: h * 0.13 };

      this.okvir.set({ w, h, s, dx: cilj.x - SIDRO.x * s, dy: cilj.y - SIDRO.y * s });
    };

    izmeri();

    if (typeof ResizeObserver !== 'undefined') {
      const posmatrac = new ResizeObserver(() => izmeri());
      posmatrac.observe(el);
      this.unistavanje.onDestroy(() => posmatrac.disconnect());
    }

    this.pokreniLet();
  }

  /** Jedan prelet; bez animacije kada ju je korisnik isključio u sistemu. */
  private pokreniLet(): void {
    const bezPokreta =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (bezPokreta || typeof requestAnimationFrame !== 'function') {
      this.napredak.set(1);
      return;
    }

    let pocetak: number | null = null;
    let okvir = 0;

    const korak = (vreme: number) => {
      if (pocetak === null) pocetak = vreme + KASNJENJE_MS;

      const t = Math.max(0, Math.min(1, (vreme - pocetak) / TRAJANJE_MS));
      // Blago ubrzanje i usporavanje
      const p = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      this.zona.run(() => this.napredak.set(p));

      if (t < 1) okvir = requestAnimationFrame(korak);
    };

    // Van Angular zone, da svaki kadar ne pokreće celu proveru promena
    this.zona.runOutsideAngular(() => (okvir = requestAnimationFrame(korak)));
    this.unistavanje.onDestroy(() => cancelAnimationFrame(okvir));
  }
}
