import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Atrakcija, Dan, UkupanTrosak } from '../models/plan.model';
import { Putovanje } from '../models/trip.model';
import { IzmenaDana, PlanEditApiService } from './plan-edit-api.service';
import { prevedi } from '../i18n/prevod';

/** Koliko koraka unazad „Poništi" pamti (spec traži najmanje 20). */
export const DUBINA_PONISTAVANJA = 30;

/** Koliko se čeka pre nego što se pošalje `preview` (§3.2 taska). */
export const CEKANJE_PREGLEDA_MS = 300;

/** Jedan korak u steku poništavanja. */
interface Korak {
  dani: Dan[];
  izmenjeniDani: number[];
  opis: string;
}

/**
 * Režim izmene plana (spec §4.6).
 *
 * Izmene su LOKALNE dok se ne sačuvaju. Posle svake izmene server
 * preračunava vremena (`preview`), pa se tokom kucanja ne šalje po jedan
 * zahtev za svaki klik - `debounceTime` + `switchMap` ostavljaju samo
 * poslednji, a zakasneli odgovor ne može da pregazi noviji.
 */
@Injectable()
export class PlanEditService {
  private readonly api = inject(PlanEditApiService);

  /** Sačuvano stanje - „Odbaci izmene" vraća na njega. */
  private sacuvaniDani: Dan[] = [];

  private readonly _tripId = signal<string | null>(null);
  private readonly _dani = signal<Dan[]>([]);
  private readonly _izmenjeniDani = signal<Set<number>>(new Set());
  private readonly _stek = signal<Korak[]>([]);
  private readonly _trosak = signal<UkupanTrosak | null>(null);
  private readonly _verzija = signal<string | null>(null);
  private readonly _racuna = signal(false);
  private readonly _greska = signal<string | null>(null);
  private readonly _najava = signal<string>('');

  readonly dani = this._dani.asReadonly();
  readonly trosak = this._trosak.asReadonly();
  readonly verzija = this._verzija.asReadonly();
  readonly racuna = this._racuna.asReadonly();
  readonly greska = this._greska.asReadonly();

  /** Tekst za `aria-live` - čitač ekrana najavljuje preračunavanje. */
  readonly najava = this._najava.asReadonly();

  readonly imaIzmena = computed(() => this._izmenjeniDani().size > 0);
  readonly mozePonistiti = computed(() => this._stek().length > 0);

  /** Koliko aktivnosti krši radno vreme ili prelazi kraj dana. */
  readonly brojKrsenja = computed(() =>
    this._dani().reduce(
      (zbir, d) => zbir + (d.attractions ?? []).filter((a) => a.violation).length,
      0
    )
  );

  private readonly trazi = new Subject<void>();

  constructor() {
    this.trazi
      .pipe(
        debounceTime(CEKANJE_PREGLEDA_MS),
        switchMap(() => {
          this._racuna.set(true);
          this._greska.set(null);

          return this.api.pregled(this._tripId()!, this.izmene());
        }),
        takeUntilDestroyed()
      )
      .subscribe({
        next: (o) => {
          this._racuna.set(false);
          this.primeniPregled(o.days);
          this._trosak.set(o.totalBudget);
          this._najava.set(
            prevedi('izmena.preracunato', { dani: o.days.map((d) => d.day).join(', ') })
          );
        },
        error: () => {
          this._racuna.set(false);
          // Prethodna vremena ostaju vidljiva - bolje stara nego nikakva
          this._greska.set(prevedi('izmena.nijePreracunato'));
        }
      });
  }

  // ---------------------------------------------------------------
  // Život režima izmene
  // ---------------------------------------------------------------

  pocni(trip: Putovanje, verzija: string | null): void {
    this._tripId.set(trip._id);
    this.sacuvaniDani = this.kopija(trip.itinerary?.itinerary ?? []);

    this._dani.set(this.kopija(this.sacuvaniDani));
    this._trosak.set(trip.itinerary?.totalBudget ?? null);
    this._verzija.set(verzija);
    this._izmenjeniDani.set(new Set());
    this._stek.set([]);
    this._greska.set(null);
    this._najava.set('');
  }

  /** „Odbaci izmene" - nazad na poslednje sačuvano stanje. */
  odbaci(): void {
    this._dani.set(this.kopija(this.sacuvaniDani));
    this._izmenjeniDani.set(new Set());
    this._stek.set([]);
    this._greska.set(null);
  }

  /** Posle uspešnog čuvanja novo stanje postaje sačuvano. */
  oznaciSacuvano(trip: Putovanje, verzija: string | null): void {
    this.sacuvaniDani = this.kopija(trip.itinerary?.itinerary ?? []);

    this._dani.set(this.kopija(this.sacuvaniDani));
    this._trosak.set(trip.itinerary?.totalBudget ?? null);
    this._verzija.set(verzija);
    this._izmenjeniDani.set(new Set());
    this._stek.set([]);
  }

  postaviVerziju(v: string | null): void {
    this._verzija.set(v);
  }

  /** Šta se šalje serveru: samo izmenjeni dani i samo identifikatori. */
  izmene(): IzmenaDana[] {
    const izmenjeni = this._izmenjeniDani();

    return this._dani()
      .filter((d) => izmenjeni.has(d.day))
      .map((d) => ({ day: d.day, attractionIds: (d.attractions ?? []).map((a) => a.id) }));
  }

  // ---------------------------------------------------------------
  // Izmene (svaka ide na stek i pokreće preračunavanje)
  // ---------------------------------------------------------------

  pomeriGore(dan: number, id: string): void {
    this.primeni('izmena.pomeriGore', [dan], (dani) => {
      const d = dani.find((x) => x.day === dan);
      if (!d) return;

      const i = (d.attractions ?? []).findIndex((a) => a.id === id);
      if (i <= 0) return;

      const lista = [...d.attractions];
      [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
      d.attractions = lista;
    });
  }

  pomeriDole(dan: number, id: string): void {
    this.primeni('izmena.pomeriDole', [dan], (dani) => {
      const d = dani.find((x) => x.day === dan);
      if (!d) return;

      const lista = [...(d.attractions ?? [])];
      const i = lista.findIndex((a) => a.id === id);
      if (i === -1 || i === lista.length - 1) return;

      [lista[i], lista[i + 1]] = [lista[i + 1], lista[i]];
      d.attractions = lista;
    });
  }

  ukloni(dan: number, id: string): void {
    this.primeni('izmena.ukloni', [dan], (dani) => {
      const d = dani.find((x) => x.day === dan);
      if (!d) return;

      d.attractions = (d.attractions ?? []).filter((a) => a.id !== id);
    });
  }

  /** Premeštanje između dana; ide na kraj ciljnog dana. */
  premesti(izDana: number, id: string, uDan: number): void {
    if (izDana === uDan) return;

    this.primeni('izmena.premesti', [izDana, uDan], (dani) => {
      const iz = dani.find((x) => x.day === izDana);
      const u = dani.find((x) => x.day === uDan);
      if (!iz || !u) return;

      const atrakcija = (iz.attractions ?? []).find((a) => a.id === id);
      if (!atrakcija) return;

      iz.attractions = (iz.attractions ?? []).filter((a) => a.id !== id);
      u.attractions = [...(u.attractions ?? []), atrakcija];
    });
  }

  dodaj(dan: number, atrakcija: Atrakcija): void {
    this.primeni('izmena.dodaj', [dan], (dani) => {
      const d = dani.find((x) => x.day === dan);
      if (!d) return;

      d.attractions = [...(d.attractions ?? []), { ...atrakcija }];
    });
  }

  /** Rezultat „Optimizuj redosled" ulazi kao obična lokalna izmena. */
  primeniOptimizaciju(dan: Dan): void {
    this.primeni('izmena.optimizuj', [dan.day], (dani) => {
      const i = dani.findIndex((x) => x.day === dan.day);
      if (i === -1) return;

      dani[i] = { ...dani[i], ...dan };
    });
  }

  /** „Poništi" - vraća poslednju izmenu. */
  ponisti(): void {
    const stek = this._stek();
    if (stek.length === 0) return;

    const poslednji = stek[stek.length - 1];

    this._stek.set(stek.slice(0, -1));
    this._dani.set(poslednji.dani);
    this._izmenjeniDani.set(new Set(poslednji.izmenjeniDani));
    this._najava.set(prevedi('izmena.ponisteno', { radnja: prevedi(poslednji.opis) }));

    if (this._izmenjeniDani().size > 0) this.trazi.next();
  }

  /** Da li dan čeka nova vremena. */
  jeIzmenjen(dan: number): boolean {
    return this._izmenjeniDani().has(dan);
  }

  // ---------------------------------------------------------------
  // Unutrašnje
  // ---------------------------------------------------------------

  private primeni(opis: string, dani: number[], izmena: (dani: Dan[]) => void): void {
    // Stanje PRE izmene ide na stek
    this._stek.update((s) =>
      [...s, { dani: this.kopija(this._dani()), izmenjeniDani: [...this._izmenjeniDani()], opis }]
        .slice(-DUBINA_PONISTAVANJA)
    );

    const kopija = this.kopija(this._dani());
    izmena(kopija);

    this._dani.set(kopija);
    this._izmenjeniDani.update((s) => new Set([...s, ...dani]));
    this._najava.set(prevedi('izmena.racunam', { radnja: prevedi(opis) }));

    this.trazi.next();
  }

  /** Nova vremena sa servera ulaze u lokalne dane. */
  private primeniPregled(noviDani: Dan[]): void {
    this._dani.update((dani) =>
      dani.map((d) => {
        const novi = noviDani.find((n) => n.day === d.day);
        return novi ? { ...d, ...novi } : d;
      })
    );
  }

  /**
   * Plitka kopija dana sa novim nizom aktivnosti.
   *
   * Same atrakcije se ne kopiraju duboko: izmena ih samo premešta, ne
   * menja im sadržaj, pa bi duboka kopija bila trošak bez koristi.
   */
  private kopija(dani: Dan[]): Dan[] {
    return dani.map((d) => ({ ...d, attractions: [...(d.attractions ?? [])] }));
  }
}
