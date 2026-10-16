import {
  datum,
  datumSaDanom,
  novac,
  prelaz,
  presedanja,
  razdaljina,
  trajanje,
  vreme
} from './format';
import { postaviJezik } from '../core/i18n/jezik';

describe('format', () => {
  describe('datum', () => {
    it('ispisuje ISO datum u domaćem obliku', () => {
      expect(datum('2026-05-09')).toBe('09.05.2026.');
    });

    it('vraća crticu za prazno i neispravno', () => {
      expect(datum(null)).toBe('-');
      expect(datum('')).toBe('-');
      expect(datum('ovo nije datum')).toBe('-');
    });
  });

  describe('vreme', () => {
    it('dopunjava nulom', () => {
      expect(vreme('2026-05-09T08:05:00')).toBe('08:05');
    });
  });

  describe('trajanje', () => {
    it('razdvaja sate i minute', () => {
      expect(trajanje(145)).toBe('2 h 25 min');
    });

    it('izostavlja deo koji je nula', () => {
      expect(trajanje(45)).toBe('45 min');
      expect(trajanje(120)).toBe('2 h');
    });
  });

  describe('novac', () => {
    it('koristi zarez za decimale i tačku za hiljade', () => {
      expect(novac(1234.5)).toBe('1.234,50 EUR');
      expect(novac(123456)).toBe('123.456,00 EUR');
    });

    it('ne ubacuje separator u male iznose', () => {
      expect(novac(12.5)).toBe('12,50 EUR');
    });

    it('poštuje prosleđenu valutu', () => {
      expect(novac(10, 'RSD')).toBe('10,00 RSD');
    });
  });

  describe('razdaljina', () => {
    it('ispod kilometra prikazuje metre', () => {
      expect(razdaljina(0.45)).toBe('450 m');
    });

    it('iznad kilometra zaokružuje na jednu decimalu', () => {
      expect(razdaljina(12.44)).toBe('12,4 km');
    });
  });

  describe('presedanja', () => {
    it('imenuje direktan let', () => {
      expect(presedanja(0)).toBe('direktan let');
    });

    it('slaže broj i imenicu', () => {
      expect(presedanja(1)).toBe('1 presedanje');
      expect(presedanja(2)).toBe('2 presedanja');
    });
  });

  describe('datumSaDanom', () => {
    it('ispisuje dan u nedelji, dan i mesec', () => {
      expect(datumSaDanom('2027-06-10')).toBe('četvrtak, 10. jun');
    });

    it('radi i kada uz datum stoji vreme', () => {
      expect(datumSaDanom('2027-06-14T13:30:00')).toBe('ponedeljak, 14. jun');
    });

    it('vraća crticu za neispravan zapis', () => {
      expect(datumSaDanom(null)).toBe('-');
      expect(datumSaDanom('juče')).toBe('-');
    });
  });

  describe('prelaz', () => {
    it('sastavlja vreme, način i razdaljinu', () => {
      expect(prelaz(12, 'pesice', 0.9)).toBe('12 min pešice · 900 m');
      expect(prelaz(7, 'prevoz', 2.3)).toBe('7 min prevozom · 2,3 km');
    });

    it('bez razdaljine ispisuje samo vreme i način', () => {
      expect(prelaz(5, 'pesice', null)).toBe('5 min pešice');
    });

    it('bez podatka o kretanju vraća prazan tekst', () => {
      expect(prelaz(null, 'pesice', 1)).toBe('');
    });
  });

  /**
   * Vremena leta su lokalno vreme aerodroma (Duffel: `departing_at`),
   * pa prikaz NE sme da zavisi od zone pregledaca - inace bi korak 2
   * pokazivao sletanje u 14:15, a plan dan koji pocinje u 13:45.
   */
  describe('nezavisnost od vremenske zone', () => {
    it('čita sat i datum iz samog zapisa, ne kroz Date', () => {
      expect(vreme('2027-06-10T12:15:00')).toBe('12:15');
      expect(vreme('2027-06-10T12:15:00Z')).toBe('12:15');
      expect(vreme('2027-06-10T12:15:00+05:00')).toBe('12:15');
    });

    it('datum ne beži u susedni dan', () => {
      expect(datum('2027-06-10T23:30:00Z')).toBe('10.06.2027.');
      expect(datum('2027-06-10T00:30:00Z')).toBe('10.06.2027.');
      expect(datumSaDanom('2027-06-10T23:30:00Z')).toBe('četvrtak, 10. jun');
    });
  });

  /** Isti podaci na engleskom - zapis brojeva, datuma i reči prati jezik. */
  describe('engleski jezik', () => {
    beforeEach(() => postaviJezik('en'));
    afterEach(() => postaviJezik('sr'));

    it('datum, novac i razdaljina u engleskom zapisu', () => {
      expect(datum('2026-05-09')).toBe('09/05/2026');
      expect(novac(1234.5)).toBe('1,234.50 EUR');
      expect(razdaljina(12.44)).toBe('12.4 km');
    });

    it('dan u nedelji, presedanja i prelaz na engleskom', () => {
      expect(datumSaDanom('2027-06-10')).toBe('Thursday, 10 June');
      expect(presedanja(0)).toBe('direct flight');
      expect(presedanja(1)).toBe('1 stop');
      expect(presedanja(2)).toBe('2 stops');
      expect(prelaz(7, 'prevoz', 2.3)).toBe('7 min by transport · 2.3 km');
    });
  });
});
