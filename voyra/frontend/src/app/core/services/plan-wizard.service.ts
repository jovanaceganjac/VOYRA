import { Injectable, computed, signal } from '@angular/core';

import { Grad } from '../models/grad.model';
import { Let, Plan, Preferencije, Smestaj } from '../models/plan.model';

/** Parametri iz koraka 1 (spec §4.2). */
export interface ParametriPutovanja {
  /**
   * IATA kod koji ide u pretragu leta - kod grada (LON, PAR) kada ga
   * grad ima, inače kod najbližeg aerodroma.
   */
  from: string;
  to: string;
  /** Prava vrednost izbora: identifikator grada iz sopstvene baze. */
  fromCityId: string | null;
  toCityId: string | null;
  /** Razrešeni gradovi - koraci 2-4 iz njih uzimaju naziv i aerodrom. */
  fromCity: Grad | null;
  toCity: Grad | null;
  checkIn: string;
  checkOut: string;
  passengers: number;
  budget: number | null;
  preferences: Preferencije;
}

/** Ono što preživljava osvežavanje stranice. */
interface SacuvanoStanje {
  parametri: ParametriPutovanja | null;
  letOfferId: string | null;
  smestajId: string | null;
  bezLeta: boolean;
  bezSmestaja: boolean;
  planSessionId: string | null;
}

const KLJUC = 'voyra_carobnjak';

/**
 * Stanje čarobnjaka za kreiranje putovanja (spec §4.2).
 *
 *   1. parametri → 2. izbor leta → 3. izbor smeštaja → 4. plan
 *
 * Zavisnosti koraka su jednosmerne: promena ranijeg koraka poništava sve
 * kasnije. Bez toga bi plan mogao da nastane od leta koji više ne
 * odgovara datumima, ili od smeštaja izabranog uz drugi (skuplji) let.
 */
@Injectable({ providedIn: 'root' })
export class PlanWizardService {
  private readonly _parametri = signal<ParametriPutovanja | null>(null);
  private readonly _izabraniLet = signal<Let | null>(null);
  private readonly _izabraniSmestaj = signal<Smestaj | null>(null);
  private readonly _bezLeta = signal(false);
  private readonly _bezSmestaja = signal(false);
  private readonly _plan = signal<Plan | null>(null);

  /**
   * Identifikatori iz `sessionStorage` koji još nisu spojeni sa ponudom.
   * Posle osvežavanja stranice korak 2 ih koristi da ponovo označi
   * izabranu ponudu - same ponude se ne čuvaju, jer brzo zastare.
   */
  private readonly _zapamcenLetId = signal<string | null>(null);
  private readonly _zapamcenSmestajId = signal<string | null>(null);

  readonly parametri = this._parametri.asReadonly();
  readonly izabraniLet = this._izabraniLet.asReadonly();
  readonly izabraniSmestaj = this._izabraniSmestaj.asReadonly();
  readonly bezLeta = this._bezLeta.asReadonly();
  readonly bezSmestaja = this._bezSmestaja.asReadonly();
  readonly plan = this._plan.asReadonly();

  readonly zapamcenLetId = this._zapamcenLetId.asReadonly();
  readonly zapamcenSmestajId = this._zapamcenSmestajId.asReadonly();

  /** Korak 1 je završen kada postoje parametri. */
  readonly korak1Zavrsen = computed(() => this._parametri() !== null);

  /**
   * Korak 2 je završen kada je let izabran ili je svesno preskočen.
   *
   * Posle osvežavanja stranice u memoriji postoji samo ZAPAMĆEN ID, jer
   * se ponude ne čuvaju - i on se računa kao završen korak, inače bi
   * guard vraćao korisnika unazad na svako osvežavanje.
   */
  readonly korak2Zavrsen = computed(
    () =>
      this.korak1Zavrsen() &&
      (this._izabraniLet() !== null || this._zapamcenLetId() !== null || this._bezLeta())
  );

  readonly korak3Zavrsen = computed(
    () =>
      this.korak2Zavrsen() &&
      (this._izabraniSmestaj() !== null ||
        this._zapamcenSmestajId() !== null ||
        this._bezSmestaja())
  );

  /** Prvi korak koji još nije završen - guard na njega preusmerava. */
  readonly prviNezavrsenKorak = computed(() => {
    if (!this.korak1Zavrsen()) return 1;
    if (!this.korak2Zavrsen()) return 2;
    if (!this.korak3Zavrsen()) return 3;

    return 4;
  });

  constructor() {
    this.ucitaj();
  }

  // ---------------------------------------------------------------
  // Koraci
  // ---------------------------------------------------------------

  /** Korak 1: novi parametri poništavaju sve kasnije korake. */
  postaviParametre(p: ParametriPutovanja): void {
    this._parametri.set(p);

    this._izabraniLet.set(null);
    this._izabraniSmestaj.set(null);
    this._bezLeta.set(false);
    this._bezSmestaja.set(false);
    this._plan.set(null);
    this._zapamcenLetId.set(null);
    this._zapamcenSmestajId.set(null);

    this.sacuvaj();
  }

  /** Korak 2: drugi let menja preostali budžet, pa pada i izbor smeštaja. */
  postaviLet(let_: Let | null): void {
    this._izabraniLet.set(let_);
    this._bezLeta.set(false);
    this._zapamcenLetId.set(let_?.offerId ?? null);

    this._izabraniSmestaj.set(null);
    this._zapamcenSmestajId.set(null);
    this._bezSmestaja.set(false);
    this._plan.set(null);

    this.sacuvaj();
  }

  /**
   * Vraća ranije izabranu ponudu posle osvežavanja stranice.
   *
   * Za razliku od `postaviLet`, NE poništava kasnije korake - korisnik
   * nije ništa promenio, samo je ponovo učitana ista ponuda.
   */
  vratiLet(let_: Let): void {
    this._izabraniLet.set(let_);
    this._zapamcenLetId.set(let_.offerId);
    this.sacuvaj();
  }

  vratiSmestaj(smestaj: Smestaj): void {
    this._izabraniSmestaj.set(smestaj);
    this._zapamcenSmestajId.set(smestaj.id);
    this.sacuvaj();
  }

  /** Korak 2: svestan nastavak bez leta (nema ponuda za tu rutu). */
  nastaviBezLeta(): void {
    this._izabraniLet.set(null);
    this._zapamcenLetId.set(null);
    this._bezLeta.set(true);

    this._izabraniSmestaj.set(null);
    this._zapamcenSmestajId.set(null);
    this._bezSmestaja.set(false);
    this._plan.set(null);

    this.sacuvaj();
  }

  /** Korak 3. */
  postaviSmestaj(smestaj: Smestaj | null): void {
    this._izabraniSmestaj.set(smestaj);
    this._bezSmestaja.set(false);
    this._zapamcenSmestajId.set(smestaj?.id ?? null);
    this._plan.set(null);

    this.sacuvaj();
  }

  nastaviBezSmestaja(): void {
    this._izabraniSmestaj.set(null);
    this._zapamcenSmestajId.set(null);
    this._bezSmestaja.set(true);
    this._plan.set(null);

    this.sacuvaj();
  }

  /** Korak 4. */
  postaviPlan(plan: Plan | null): void {
    this._plan.set(plan);
    this.sacuvaj();
  }

  /** Posle čuvanja putovanja plan dobija `savedTripId`. */
  oznaciSacuvano(savedTripId: string): void {
    this._plan.update((p) => (p ? { ...p, savedTripId } : p));
    this.sacuvaj();
  }

  /**
   * Ponuda više ne postoji (410 SELECTION_EXPIRED) - izbor se poništava,
   * da korisnik ne bi ponovo poslao isti nepostojeći identifikator.
   */
  ponistiIzborLeta(): void {
    this._izabraniLet.set(null);
    this._zapamcenLetId.set(null);
    this._bezLeta.set(false);
    this._plan.set(null);

    this.sacuvaj();
  }

  ponistiIzborSmestaja(): void {
    this._izabraniSmestaj.set(null);
    this._zapamcenSmestajId.set(null);
    this._bezSmestaja.set(false);
    this._plan.set(null);

    this.sacuvaj();
  }

  ocisti(): void {
    this._parametri.set(null);
    this._izabraniLet.set(null);
    this._izabraniSmestaj.set(null);
    this._bezLeta.set(false);
    this._bezSmestaja.set(false);
    this._plan.set(null);
    this._zapamcenLetId.set(null);
    this._zapamcenSmestajId.set(null);

    this.obrisiIzMemorije();
  }

  // ---------------------------------------------------------------
  // sessionStorage
  //
  // Svaki pristup je u try/catch: u privatnom prozoru ili sa blokiranim
  // skladištem `sessionStorage` baca izuzetak. Aplikacija tada radi
  // normalno, samo gubi stanje pri osvežavanju stranice.
  // ---------------------------------------------------------------

  private sacuvaj(): void {
    const stanje: SacuvanoStanje = {
      parametri: this._parametri(),
      // Čuvaju se samo identifikatori: ponude brzo zastare, pa bi
      // sačuvana lista posle osvežavanja prikazala stare cene
      letOfferId: this._izabraniLet()?.offerId ?? this._zapamcenLetId(),
      smestajId: this._izabraniSmestaj()?.id ?? this._zapamcenSmestajId(),
      bezLeta: this._bezLeta(),
      bezSmestaja: this._bezSmestaja(),
      planSessionId: this._plan()?.planSessionId ?? null
    };

    try {
      sessionStorage.setItem(KLJUC, JSON.stringify(stanje));
    } catch {
      /* skladište nije dostupno - stanje ostaje samo u memoriji */
    }
  }

  private ucitaj(): void {
    let sirovo: string | null = null;

    try {
      sirovo = sessionStorage.getItem(KLJUC);
    } catch {
      return;
    }

    if (!sirovo) return;

    try {
      const stanje = JSON.parse(sirovo) as SacuvanoStanje;

      this._parametri.set(stanje.parametri ?? null);
      this._zapamcenLetId.set(stanje.letOfferId ?? null);
      this._zapamcenSmestajId.set(stanje.smestajId ?? null);
      this._bezLeta.set(Boolean(stanje.bezLeta));
      this._bezSmestaja.set(Boolean(stanje.bezSmestaja));
    } catch {
      this.obrisiIzMemorije();
    }
  }

  /** Id sačuvane sesije - korak 4 njime vraća plan posle osvežavanja. */
  sacuvanaSesija(): string | null {
    try {
      const sirovo = sessionStorage.getItem(KLJUC);
      if (!sirovo) return null;

      return (JSON.parse(sirovo) as SacuvanoStanje).planSessionId ?? null;
    } catch {
      return null;
    }
  }

  private obrisiIzMemorije(): void {
    try {
      sessionStorage.removeItem(KLJUC);
    } catch {
      /* nema šta da se obriše */
    }
  }
}
