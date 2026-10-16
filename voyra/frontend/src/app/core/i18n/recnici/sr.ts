/* Generisano iz sr/*.ts - srpski je izvorni jezik i odredjuje kljuceve. */
import { admin, adminPregled, adminZahtevi, adminKorisnici, adminDestinacije, adminAtrakcije, adminKategorije, adminStatistika } from './sr/admin';
import { carobnjak, korak1, korak2, korak3, korak4, preferencije } from './sr/carobnjak';
import { format } from './sr/format';
import { gradovi, atrakcije } from './sr/gradovi';
import { prijava, registracija, vreme } from './sr/nalog';
import { naslovi } from './sr/naslovi';
import { opste, nav, podnozje, stranica404, greske } from './sr/opste';
import { plan } from './sr/plan';
import { pocetna, provera } from './sr/pocetna';
import { profil } from './sr/profil';
import { statusi, mojaPutovanja, putovanje, izmena } from './sr/putovanja';
import { rezervacija } from './sr/rezervacija';
import { validacija, putnik } from './sr/validacija';

export const sr = {
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
