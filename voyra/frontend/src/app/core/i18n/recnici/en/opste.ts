import type { Recnik } from '../../prevod';
import type * as sr from '../sr/opste';

export const opste: Recnik<typeof sr.opste> = {
  preskoci: 'Skip to content',
  ucitavanje: 'Loading',
  zatvori: 'Close',
  nazad: 'Back',
  dalje: 'Next',
  sacuvaj: 'Save',
  cuvam: 'Saving...',
  otkazi: 'Cancel',
  obrisi: 'Delete',
  izmeni: 'Edit',
  pokusajPonovo: 'Try again',
  da: 'Yes',
  ne: 'No',
  opciono: '(optional)',
  nema: '-',
  jezik: 'Language',
  jezici: { sr: 'Srpski', en: 'English' },
  jeziciKratko: { sr: 'SR', en: 'EN' }
};

export const nav: Recnik<typeof sr.nav> = {
  pocetnaAria: 'Voyra - home',
  meni: 'Menu',
  pocetna: 'Home',
  planiraj: 'Plan a trip',
  atrakcije: 'Attractions',
  mojaPutovanja: 'My trips',
  admin: 'Admin panel',
  profil: 'Profile',
  odjava: 'Log out',
  prijava: 'Log in',
  registracija: 'Sign up',
  odjavljeni: 'You have been logged out.'
};

export const podnozje: Recnik<typeof sr.podnozje> = {
  gradovi: 'City data provided by',
  aerodromi: 'airport data by'
};

export const stranica404: Recnik<typeof sr.stranica404> = {
  poruka: 'The page you are looking for does not exist.',
  nazad: 'Back to home'
};

export const greske: Recnik<typeof sr.greske> = {
  serverNedostupan:
    'The server is not available. Check that it is running (npm run start-all) and try again.',
  serverNedostupanKratko: 'The server is not available. Check that the backend is running.',
  sesijaIsteklaPromenjen: 'Your session has expired or the account was changed. Please log in again.',
  sesijaIstekla: 'Your session has expired. Please log in again.',
  nemaPrava: 'You do not have permission to access this.'
};
