/* Generisano iz en/*.ts - tip `Recnik` trazi svaki kljuc iz srpskog. */
import type { Recnik } from '../prevod';
import { admin, adminPregled, adminZahtevi, adminKorisnici, adminDestinacije, adminAtrakcije, adminKategorije, adminStatistika } from './en/admin';
import { carobnjak, korak1, korak2, korak3, korak4, preferencije } from './en/carobnjak';
import { format } from './en/format';
import { gradovi, atrakcije } from './en/gradovi';
import { prijava, registracija, vreme } from './en/nalog';
import { naslovi } from './en/naslovi';
import { opste, nav, podnozje, stranica404, greske } from './en/opste';
import { plan } from './en/plan';
import { pocetna, provera } from './en/pocetna';
import { profil } from './en/profil';
import { statusi, mojaPutovanja, putovanje, izmena } from './en/putovanja';
import { rezervacija } from './en/rezervacija';
import { validacija, putnik } from './en/validacija';

export const en: Recnik = {
  admin,
  adminPregled,
  adminZahtevi,
  adminKorisnici,
  adminDestinacije,
  adminAtrakcije,
  adminKategorije,
  adminStatistika,
  carobnjak,
  korak1,
  korak2,
  korak3,
  korak4,
  preferencije,
  format,
  gradovi,
  atrakcije,
  prijava,
  registracija,
  vreme,
  naslovi,
  opste,
  nav,
  podnozje,
  stranica404,
  greske,
  plan,
  pocetna,
  provera,
  profil,
  statusi,
  mojaPutovanja,
  putovanje,
  izmena,
  rezervacija,
  validacija,
  putnik
};
