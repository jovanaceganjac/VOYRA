import type { Recnik } from '../../prevod';
import type * as sr from '../sr/nalog';

export const prijava: Recnik<typeof sr.prijava> = {
  naslov: 'Log in',
  korisnickoIme: 'Username',
  unesiteKorisnickoIme: 'Enter your username.',
  lozinka: 'Password',
  unesiteLozinku: 'Enter your password.',
  prijavljivanje: 'Logging in...',
  prijaviSe: 'Log in',
  nemateNalog: "Don't have an account?",
  registrujteSe: 'Sign up',
  uspesno: 'You have logged in successfully.',
  previsePokusaja: 'Too many failed attempts. Try again in {vreme}.',
  nijeUspela: 'Login failed. Please try again.'
};

export const registracija: Recnik<typeof sr.registracija> = {
  naslov: 'Sign up',
  ime: 'First name',
  unesiteIme: 'Enter your first name.',
  prezime: 'Last name',
  unesitePrezime: 'Enter your last name.',
  najmanje2: 'At least 2 characters.',
  email: 'Email',
  unesiteEmail: 'Enter your email address.',
  korisnickoImePomoc: '3-20 characters: letters, digits, _ and -',
  najmanje3: 'At least 3 characters.',
  najvise20: 'At most 20 characters.',
  dozvoljeniZnaci: 'Only letters, digits, _ and - are allowed',
  potvrdaLozinke: 'Confirm password',
  nePoklapajuSe: 'The passwords do not match.',
  ponoviteLozinku: 'Repeat the password.',
  telefon: 'Phone number',
  telefonPomoc: 'Used only for SMS trip notifications.',
  slanje: 'Sending...',
  registrujSe: 'Sign up',
  vecImateNalog: 'Already have an account?',
  prijaviteSe: 'Log in',
  uspeh: 'Your request has been sent. You will get an email when an administrator approves the account.',
  nijeUspela: 'Registration failed. Please try again.'
};

export const vreme: Recnik<typeof sr.vreme> = {
  minut: { jedan: '{broj} minute', nekoliko: '{broj} minutes', mnogo: '{broj} minutes' }
};
