import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { TPipe } from '../../core/i18n/t.pipe';
import { prevedi, prevediBroj } from '../../core/i18n/prevod';
import { Grad } from '../../core/models/grad.model';
import { IstaknutaDestinacija, PopularnaDestinacija } from '../../core/models/sadrzaj.model';
import { CityApiService } from '../../core/services/city-api.service';
import { DestinacijeApiService } from '../../core/services/destinacije-api.service';
import { FieldErrorComponent } from '../../shared/components/field-error';
import { GradUnosComponent } from '../../shared/components/grad-unos';
import { MapaSvetaComponent } from './mapa-sveta';

/**
 * Specifikacija §4.2: najvise 14 dana (racunaju se i dan dolaska i dan
 * povratka), putnika najmanje 1 bez gornje granice.
 */
const MAX_DANA = 14;

/**
 * Gradovi koji su ponuđeni pri otvaranju stranice.
 *
 * Traže se po IATA kodu, a ne po ugrađenom identifikatoru: baza gradova
 * se puni uvozom (`npm run import:gradovi`), pa identifikatori nisu deo
 * koda aplikacije.
 */
const PODRAZUMEVANO_OD = 'BEG';
const PODRAZUMEVANO_DO = 'ATH';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [ReactiveFormsModule, FieldErrorComponent, GradUnosComponent, MapaSvetaComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly gradovi = inject(CityApiService);
  private readonly destinacije = inject(DestinacijeApiService);

  readonly danas = new Date().toISOString().split('T')[0];
  readonly maxDana = MAX_DANA;

  /** Izabrani gradovi - vrednost je ceo grad, a u URL ide njegov `id`. */
  readonly polaziste = signal<Grad | null>(null);
  readonly odrediste = signal<Grad | null>(null);

  /** Greske koje zavise od vise polja - forma ih cuva odvojeno. */
  readonly greska = signal<string | null>(null);

  /** Polje za grad je dodirnuto - greska se prikazuje tek posle slanja. */
  readonly poslato = signal(false);

  /*
   * Istaknute i popularne destinacije (spec §4.1).
   *
   * Obe sekcije se prikazuju samo kada imaju sadržaj: prazna lista znači
   * da administrator još ništa nije istakao, odnosno da niko nije
   * pretraživao - a izmišljene destinacije ne prikazujemo.
   */
  readonly istaknute = signal<IstaknutaDestinacija[]>([]);
  readonly popularne = signal<PopularnaDestinacija[]>([]);

  readonly forma = this.fb.nonNullable.group({
    checkIn: ['', [Validators.required]],
    checkOut: ['', [Validators.required]],
    passengers: [2, [Validators.required, Validators.min(1)]],
    // Opcion - bez njega planer ne ogranicava ponude cenom.
    budget: [null as number | null, [Validators.min(1)]]
  });

  constructor() {
    this.gradovi.poIataKodu(PODRAZUMEVANO_OD).subscribe((g) => g && this.polaziste.set(g));
    this.gradovi.poIataKodu(PODRAZUMEVANO_DO).subscribe((g) => g && this.odrediste.set(g));

    this.destinacije.istaknute().subscribe((d) => this.istaknute.set(d));
    this.destinacije.popularne(8).subscribe((d) => this.popularne.set(d));
  }

  /** „1 pretraga", „3 pretrage", „7 pretraga" / „1 search", „3 searches". */
  opisPretraga(broj: number): string {
    return prevediBroj('pocetna.pretraga', broj);
  }

  /**
   * Klik na destinaciju vodi u korak 1 sa već izabranim odredištem.
   *
   * Datumi se ne pogađaju - korisnik ih bira sam, a polazište ostaje ono
   * koje je već u polju.
   */
  planirajZa(gradId: string): void {
    const parametri: Record<string, string> = { toCityId: gradId };

    const od = this.polaziste();
    if (od) parametri['fromCityId'] = od.id;

    this.router.navigate(['/planiranje', 1], { queryParams: parametri });
  }

  posalji(): void {
    this.greska.set(null);
    this.poslato.set(true);
    this.forma.markAllAsTouched();

    const polaziste = this.polaziste();
    const odrediste = this.odrediste();

    if (!polaziste || !odrediste) {
      this.greska.set(prevedi('provera.izaberiteGradove'));
      return;
    }

    const v = this.forma.getRawValue();

    if (this.forma.invalid) return;

    if (polaziste.id === odrediste.id) {
      this.greska.set(prevedi('provera.razlicitiGradovi'));
      return;
    }

    const od = new Date(v.checkIn);
    const do_ = new Date(v.checkOut);

    if (od < new Date(this.danas)) {
      this.greska.set(prevedi('provera.polazakProslost'));
      return;
    }

    if (do_ <= od) {
      this.greska.set(prevedi('provera.povratakPosle'));
      return;
    }

    // Dan dolaska i dan povratka se broje, isto kao na backendu
    const dana = Math.round((do_.getTime() - od.getTime()) / 86400000) + 1;

    if (dana > MAX_DANA) {
      this.greska.set(prevedi('provera.najviseDana', { max: MAX_DANA, dana }));
      return;
    }

    // Prazan budzet se ne prosledjuje - inace bi u URL-u stajalo budget=
    const parametri: Record<string, string | number> = {
      fromCityId: polaziste.id,
      toCityId: odrediste.id,
      checkIn: v.checkIn,
      checkOut: v.checkOut,
      passengers: v.passengers
    };

    if (v.budget) parametri['budget'] = v.budget;

    // Vodi na KORAK 1 sa popunjenim poljima; plan se ne pravi sam (§4.1)
    this.router.navigate(['/planiranje', 1], { queryParams: parametri });
  }
}
