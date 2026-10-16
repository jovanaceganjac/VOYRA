import { FormControl, FormGroup, Validators } from '@angular/forms';

import {
  MAX_IME_PREZIME,
  datumRodjenjaValidator,
  duzinaImenaValidator,
  godineNa,
  imePutnikaValidator,
  porukaZaPolje,
  telefonE164Validator
} from './putnik.validator';

/**
 * Pravila potiču iz zvanične Duffel dokumentacije („Create an order"),
 * pa se ovde proverava da ih klijent tumači isto kao server.
 */
describe('validatori putnika (§4.8 t.3)', () => {
  const kontrola = (v: unknown) => new FormControl(v);

  describe('ime i prezime', () => {
    it('prihvata obično latinično ime', () => {
      expect(imePutnikaValidator(kontrola('Marko'))).toBeNull();
    });

    it('prihvata srpska slova — Latin Extended-A je dozvoljen', () => {
      expect(imePutnikaValidator(kontrola('Miloš'))).toBeNull();
      expect(imePutnikaValidator(kontrola('Čeganjac'))).toBeNull();
      expect(imePutnikaValidator(kontrola('Đorđević'))).toBeNull();
    });

    it('prihvata crticu i apostrof', () => {
      expect(imePutnikaValidator(kontrola("O'Brien"))).toBeNull();
      expect(imePutnikaValidator(kontrola('Ana-Marija'))).toBeNull();
    });

    it('odbija ćirilicu', () => {
      expect(imePutnikaValidator(kontrola('Милош'))).toEqual({ nelatinica: true });
    });

    it('odbija cifre i znakove interpunkcije', () => {
      expect(imePutnikaValidator(kontrola('Marko2'))).toEqual({ nelatinica: true });
      expect(imePutnikaValidator(kontrola('Marko.'))).toEqual({ nelatinica: true });
    });

    it('odbija jedno slovo', () => {
      expect(imePutnikaValidator(kontrola('M'))).toEqual({ kratkoIme: true });
    });

    it('prazno polje prepušta `required` validatoru', () => {
      expect(imePutnikaValidator(kontrola(''))).toBeNull();
    });
  });

  describe('ime i prezime zajedno', () => {
    const grupa = (ime: string, prezime: string) =>
      new FormGroup({ givenName: new FormControl(ime), familyName: new FormControl(prezime) });

    it('prolazi kada je zbir ispod granice', () => {
      expect(duzinaImenaValidator(grupa('Marko', 'Markovic'))).toBeNull();
    });

    it('pada kada zbir pređe granicu', () => {
      const dugo = 'a'.repeat(MAX_IME_PREZIME);

      expect(duzinaImenaValidator(grupa(dugo, 'Markovic'))).toEqual({ predugoIme: true });
    });
  });

  describe('telefon', () => {
    it('prihvata E.164', () => {
      expect(telefonE164Validator(kontrola('+381641234567'))).toBeNull();
    });

    it('odbija broj bez pozivnog i sa razmacima', () => {
      expect(telefonE164Validator(kontrola('0641234567'))).toEqual({ e164: true });
      expect(telefonE164Validator(kontrola('+381 64 123 4567'))).toEqual({ e164: true });
    });
  });

  describe('datum rođenja', () => {
    const validator = datumRodjenjaValidator('2027-06-14');

    it('prihvata punoletnog putnika', () => {
      expect(validator(kontrola('1990-05-10'))).toBeNull();
    });

    it('odbija dete — pretraga je rađena za odrasle putnike', () => {
      expect(validator(kontrola('2015-01-01'))).toEqual({ maloletan: true });
    });

    it('odbija datum u budućnosti', () => {
      expect(validator(kontrola('2099-01-01'))).toEqual({ uBuducnosti: true });
    });

    it('punoletstvo se meri na dan povratka, ne danas', () => {
      // Osamnaesti rođendan pada dan pre povratka
      expect(validator(kontrola('2009-06-13'))).toBeNull();
      // ...i dan posle povratka
      expect(validator(kontrola('2009-06-15'))).toEqual({ maloletan: true });
    });
  });

  describe('godineNa', () => {
    it('računa godine na zadati datum', () => {
      expect(godineNa('1990-06-15', '2027-06-14')).toBe(36);
      expect(godineNa('1990-06-14', '2027-06-14')).toBe(37);
    });
  });

  describe('porukaZaPolje', () => {
    it('objašnjava zašto ime nije prihvaćeno', () => {
      expect(porukaZaPolje({ nelatinica: true })).toContain('latinicom');
    });

    it('imenuje razlog za maloletnog putnika', () => {
      expect(porukaZaPolje({ maloletan: true })).toContain('odrasle putnike');
    });

    it('obavezno polje ima svoju poruku', () => {
      const k = new FormControl('', [Validators.required]);

      expect(porukaZaPolje(k.errors)).toBe('Ovo polje je obavezno');
    });

    it('bez greške nema poruke', () => {
      expect(porukaZaPolje(null)).toBe('');
    });
  });
});
