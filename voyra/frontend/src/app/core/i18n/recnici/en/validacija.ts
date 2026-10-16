import type { Recnik } from '../../prevod';
import type * as sr from '../sr/validacija';

export const validacija: Recnik<typeof sr.validacija> = {
  obavezno: 'This field is required.',
  email: 'Enter a valid email address.',
  prekratko: 'The value is too short.',
  predugo: 'The value is too long.',
  format: 'Invalid format.',
  lozinka: 'The password does not meet all the rules.',
  telefon: 'Format: +381601234567 (+ sign and 10-14 digits).',
  nePoklapajuSe: 'The passwords do not match.',
  neispravno: 'Invalid value.',
  pravilaLozinke: 'Password rules',
  pravilo8: 'At least 8 characters',
  praviloVeliko: 'Uppercase letter',
  praviloMalo: 'Lowercase letter',
  praviloBroj: 'Digit',
  praviloSpecijalni: 'Special character (!@#$%^&*)'
};

export const putnik: Recnik<typeof sr.putnik> = {
  titule: {
    mr: 'Mr',
    ms: 'Ms',
    mrs: 'Mrs',
    miss: 'Miss',
    dr: 'Dr'
  },
  polovi: { m: 'Male', f: 'Female' },
  obavezno: 'This field is required',
  kratkoIme: 'Enter at least two characters',
  nelatinica: 'Enter it as in your passport, in Latin letters (letters, space, hyphen, apostrophe)',
  email: 'Enter a valid email address',
  e164: 'Phone in the format +381641234567',
  uBuducnosti: 'The date of birth must be in the past',
  maloletan: 'Booking for children is not supported — the search was made for adult passengers',
  datum: 'Enter a valid date',
  predugoIme: 'First and last name together at most {max} characters',
  neispravno: 'The value is not valid'
};
