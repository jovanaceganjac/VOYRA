import { TestBed } from '@angular/core/testing';

import { I18nService, prevediServer } from './i18n.service';
import { JEZICI, aktivniJezik, postaviJezik } from './jezik';
import { RECNICI, prevedi, prevediBroj, prevediIli } from './prevod';

/** Svi ključevi rečnika kao lista putanja („nav.pocetna"). */
const kljucevi = (cvor: unknown, prefiks = ''): string[] =>
  Object.entries(cvor as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefiks}${k}`] : kljucevi(v, `${prefiks}${k}.`)
  );

describe('Dvojezičnost (i18n)', () => {
  afterEach(() => postaviJezik('sr'));

  it('podrazumevani jezik je srpski', () => {
    expect(aktivniJezik()).toBe('sr');
    expect(prevedi('nav.pocetna')).toBe('Početna');
  });

  it('promena jezika menja tekst, bez osvežavanja', () => {
    const servis = TestBed.inject(I18nService);

    servis.promeni('en');
    expect(servis.t('nav.pocetna')).toBe('Home');
    expect(document.documentElement.lang).toBe('en');

    servis.promeni('sr');
    expect(servis.t('nav.pocetna')).toBe('Početna');
  });

  it('izbor jezika se pamti', () => {
    postaviJezik('en');
    expect(localStorage.getItem('voyra_jezik')).toBe('en');
  });

  it('svaki jezik ima iste ključeve kao srpski (ništa ne nedostaje)', () => {
    const osnova = kljucevi(RECNICI.sr).sort();

    for (const jezik of JEZICI) {
      expect(kljucevi(RECNICI[jezik]).sort()).withContext(jezik).toEqual(osnova);
    }
  });

  it('parametri se umeću u tekst', () => {
    postaviJezik('en');
    expect(prevedi('plan.danBroj', { broj: 3 })).toBe('Day 3');
  });

  it('množina prati pravila jezika', () => {
    expect(prevediBroj('pocetna.pretraga', 1)).toBe('1 pretraga');
    expect(prevediBroj('pocetna.pretraga', 3)).toBe('3 pretrage');
    expect(prevediBroj('pocetna.pretraga', 7)).toBe('7 pretraga');
    expect(prevediBroj('pocetna.pretraga', 12)).toBe('12 pretraga');

    postaviJezik('en');
    expect(prevediBroj('pocetna.pretraga', 1)).toBe('1 search');
    expect(prevediBroj('pocetna.pretraga', 3)).toBe('3 searches');
  });

  it('nepoznat ključ vraća rezervu', () => {
    expect(prevediIli('statusi.putovanje.draft', 'draft')).toBe('draft');
  });

  it('poruke servera se prevode na engleski, a na srpskom ostaju iste', () => {
    const poruka = 'Korisnicko ime ili lozinka nisu tacni';

    expect(prevediServer(poruka)).toBe(poruka);

    postaviJezik('en');
    expect(prevediServer(poruka)).toBe('The username or password is incorrect');
    expect(prevediServer('Putovanje moze trajati najvise 14 dana (trazeno 16)')).toBe(
      'A trip can last at most 14 days (16 requested)'
    );
    expect(prevediServer('Nepoznata poruka')).toBe('Nepoznata poruka');
  });
});
