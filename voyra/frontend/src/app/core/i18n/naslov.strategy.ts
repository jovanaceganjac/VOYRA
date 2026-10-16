import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { aktivniJezik } from './jezik';
import { prevedi } from './prevod';

/**
 * Naslov stranice iz rečnika.
 *
 * Rute nose ključ (`title: 'naslovi.profil'`), a ovde se prevodi na
 * aktivni jezik - i ponovo kada se jezik promeni, bez nove navigacije.
 */
@Injectable({ providedIn: 'root' })
export class NaslovStrategija extends TitleStrategy {
  private readonly title = inject(Title);
  private kljuc: string | null = null;

  constructor() {
    super();

    effect(() => {
      aktivniJezik();
      if (this.kljuc) this.title.setTitle(prevedi(this.kljuc));
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.kljuc = this.buildTitle(snapshot) ?? null;
    if (this.kljuc) this.title.setTitle(prevedi(this.kljuc));
  }
}
