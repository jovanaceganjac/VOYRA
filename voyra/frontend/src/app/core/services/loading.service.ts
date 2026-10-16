import { Injectable, computed, signal } from '@angular/core';

/**
 * Brojac aktivnih zahteva - spinner se prikazuje dok je bar jedan u toku.
 * Brojac (a ne bulean) jer se zahtevi preklapaju.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly aktivnih = signal(0);
  readonly ucitava = computed(() => this.aktivnih() > 0);

  pocni(): void {
    this.aktivnih.update((n) => n + 1);
  }

  zavrsi(): void {
    this.aktivnih.update((n) => Math.max(0, n - 1));
  }
}
