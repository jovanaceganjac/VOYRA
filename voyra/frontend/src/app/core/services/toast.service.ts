import { Injectable, signal } from '@angular/core';

export type VrstaToasta = 'uspeh' | 'greska' | 'info';

export interface Toast {
  id: number;
  vrsta: VrstaToasta;
  poruka: string;
}

const TRAJANJE_MS = 5000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _poruke = signal<Toast[]>([]);
  readonly poruke = this._poruke.asReadonly();

  private sledeciId = 1;

  private dodaj(vrsta: VrstaToasta, poruka: string): void {
    const id = this.sledeciId++;
    this._poruke.update((lista) => [...lista, { id, vrsta, poruka }]);

    setTimeout(() => this.zatvori(id), TRAJANJE_MS);
  }

  uspeh(poruka: string): void {
    this.dodaj('uspeh', poruka);
  }

  greska(poruka: string): void {
    this.dodaj('greska', poruka);
  }

  info(poruka: string): void {
    this.dodaj('info', poruka);
  }

  zatvori(id: number): void {
    this._poruke.update((lista) => lista.filter((t) => t.id !== id));
  }
}
