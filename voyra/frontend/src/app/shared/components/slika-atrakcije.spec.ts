import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SlikaAtrakcijeComponent } from './slika-atrakcije';
import { Atrakcija } from '../../core/models/plan.model';

const atrakcija = (izmene: Partial<Atrakcija> = {}): Atrakcija =>
  ({
    id: 'A1',
    name: 'Akropolj',
    city: 'Athens',
    category: 'kultura',
    categories: ['kultura'],
    lat: 37.97,
    lon: 23.72,
    description: '',
    price: 0,
    currency: 'EUR',
    duration: 120,
    rating: 4.9,
    views: 0,
    order: 1,
    ...izmene
  }) as Atrakcija;

const SLIKA = {
  url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/640px-X.jpg',
  width: 640,
  height: 427,
  sourceUrl: 'https://en.wikipedia.org/wiki/Acropolis_of_Athens',
  credit: 'Wikimedia Commons'
};

describe('SlikaAtrakcijeComponent', () => {
  let fixture: ComponentFixture<SlikaAtrakcijeComponent>;

  const napravi = (a: Atrakcija, mala = false): HTMLElement => {
    fixture = TestBed.createComponent(SlikaAtrakcijeComponent);
    fixture.componentRef.setInput('atrakcija', a);
    fixture.componentRef.setInput('mala', mala);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SlikaAtrakcijeComponent] });
  });

  it('prikazuje sliku sa alt tekstom i lenjim učitavanjem', () => {
    const el = napravi(atrakcija({ image: SLIKA }));
    const img = el.querySelector('img') as HTMLImageElement;

    expect(img).not.toBeNull();
    expect(img.getAttribute('alt')).toBe('Akropolj');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('ispod slike stoji potpis sa vezom ka izvoru', () => {
    const el = napravi(atrakcija({ image: SLIKA }));
    const veza = el.querySelector('.slika__potpis a') as HTMLAnchorElement;

    expect(veza.textContent?.trim()).toBe('Slika: Wikimedia Commons');
    expect(veza.getAttribute('href')).toBe(SLIKA.sourceUrl);
    expect(veza.getAttribute('target')).toBe('_blank');
    expect(veza.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('bez slike prikazuje znak po kategoriji, bez razbijene ikonice', () => {
    const el = napravi(atrakcija({ image: null }));

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.slika__znak')).not.toBeNull();
  });

  /**
   * Isto što se vidi kada nema interneta: slika sa Wikimedia Commons-a se
   * ne učita, pa kartica mora da padne na znak, a ne na razbijenu ikonicu.
   */
  it('kada se slika ne učita, pada na znak po kategoriji', () => {
    const el = napravi(atrakcija({ image: SLIKA }));
    const img = el.querySelector('img') as HTMLImageElement;

    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.slika__znak')).not.toBeNull();
  });

  it('znak se bira po kategoriji atrakcije', () => {
    const muzej = napravi(atrakcija({ image: null, categories: ['muzeji'] }));
    const priroda = napravi(atrakcija({ image: null, categories: ['priroda'] }));

    const putanja = (el: HTMLElement) => el.querySelector('path')?.getAttribute('d');

    expect(putanja(muzej)).not.toBe(putanja(priroda));
  });

  it('sličica uz tekst nema potpis - on stoji uz opis', () => {
    const el = napravi(atrakcija({ image: SLIKA }), true);

    expect(el.querySelector('img')).not.toBeNull();
    expect(el.querySelector('.slika__potpis')).toBeNull();
  });
});
