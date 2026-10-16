import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

import { aktivniJezik } from '../i18n/jezik';
import { prevedi } from '../i18n/prevod';
import { ApiOdgovor } from '../models/api.model';
import { Preferencije } from '../models/plan.model';

/** Kategorija interesovanja iz baze (spec §9). */
export interface KategorijaInteresovanja {
  kljuc: string;
  naziv: string;
  opis: string;
}

/** `GET /v1/preferences/schema` - dozvoljene vrednosti iz Planner-a. */
export interface ShemaPreferencija {
  transportPriority: string[];
  accommodationTypes: string[];
  interests: string[];
  /** Nazivi i opisi kategorija - uređuje ih administrator (§3.3). */
  interestDetails?: KategorijaInteresovanja[];
  /** `baza` ili `konstante` - odakle su kategorije stigle. */
  interestsSource?: string;
  pace: string[];
  activitiesPerPace: Record<string, number>;
  maxDays: number;
  defaults: Preferencije;
}

/**
 * Rezerva kada shema nije dostupna (servis ne odgovara).
 * Namerno je minimalna: aplikacija tada radi, a prave vrednosti stižu
 * čim se servis vrati.
 */
const REZERVNA_SHEMA: ShemaPreferencija = {
  transportPriority: ['najjeftinije', 'najbrze', 'balans'],
  accommodationTypes: ['hotel', 'apartman', 'hostel'],
  interests: ['kultura', 'priroda', 'gastronomija', 'nocni_zivot', 'soping', 'muzeji'],
  pace: ['opusten', 'umeren', 'intenzivan'],
  activitiesPerPace: { opusten: 2, umeren: 4, intenzivan: 6 },
  maxDays: 14,
  defaults: {
    transportPriority: 'balans',
    accommodationTypes: ['hotel', 'apartman', 'hostel'],
    minAccommodationRating: null,
    interests: ['kultura', 'muzeji'],
    pace: 'umeren',
    dayStart: '09:00',
    dayEnd: '20:00'
  }
};

/**
 * Ugrađeni kodovi koji imaju prevod u rečniku (`preferencije.*`):
 * prioritet prevoza, tip smeštaja, tempo i početne kategorije.
 *
 * Interesovanja su sada u bazi i naziv im stiže u `interestDetails`;
 * za kategorije koje je administrator dodao prevoda nema, pa se prikazuje
 * naziv iz baze.
 */
const UGRADJENI = new Set([
  'najjeftinije', 'najbrze', 'balans',
  'hotel', 'apartman', 'hostel',
  'kultura', 'priroda', 'gastronomija', 'nocni_zivot', 'soping', 'muzeji',
  'opusten', 'umeren', 'intenzivan'
]);

@Injectable({ providedIn: 'root' })
export class PreferencijeService {
  private readonly http = inject(HttpClient);

  private zahtev?: Observable<ShemaPreferencija>;

  /** Poslednja poznata shema - komponente je čitaju sinhrono. */
  readonly shema = signal<ShemaPreferencija>(REZERVNA_SHEMA);

  /** Shema se dohvata jednom i deli između koraka čarobnjaka. */
  ucitaj(): Observable<ShemaPreferencija> {
    if (!this.zahtev) {
      this.zahtev = this.http.get<ApiOdgovor<ShemaPreferencija>>('/v1/preferences/schema').pipe(
        map((o) => o.data),
        // Nedostupna shema ne sme da zaustavi čarobnjak
        catchError(() => of(REZERVNA_SHEMA)),
        tap((shema) => this.shema.set(shema)),
        shareReplay(1)
      );
    }

    return this.zahtev;
  }

  /**
   * Naziv za prikaz.
   *
   * Kategorije interesovanja imaju prednost iz baze (administrator ih
   * menja), pa tek ako ih nema, važi ugrađeni prevod. Nepoznat kod se
   * prikazuje kakav jeste - ne sme da sruši prikaz.
   */
  naziv(kod: string): string {
    const ugradjen = UGRADJENI.has(kod) ? prevedi(`preferencije.${kod}`) : null;

    // Na drugom jeziku ugrađeni prevod ima prednost nad (srpskim) nazivom iz baze
    if (ugradjen && aktivniJezik() !== 'sr') return ugradjen;

    const izBaze = this.shema().interestDetails?.find((k) => k.kljuc === kod);

    return izBaze?.naziv || ugradjen || kod;
  }

  /** Kratak opis kategorije, kada ga administrator upiše. */
  opis(kod: string): string {
    return this.shema().interestDetails?.find((k) => k.kljuc === kod)?.opis || '';
  }

  /** „Umeren (3-4 aktivnosti dnevno)" */
  opisTempa(kod: string): string {
    const broj = this.shema().activitiesPerPace?.[kod];

    if (!broj) return this.naziv(kod);
    if (kod === 'opusten') return prevedi('preferencije.tempoJedan', { naziv: this.naziv(kod), broj });

    return prevedi('preferencije.tempoRaspon', { naziv: this.naziv(kod), od: broj - 1, do: broj });
  }
}
