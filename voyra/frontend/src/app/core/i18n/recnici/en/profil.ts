import type { Recnik } from '../../prevod';
import type * as sr from '../sr/profil';

export const profil: Recnik<typeof sr.profil> = {
  naslov: 'Profile',
  licniPodaci: 'Personal details',
  statusNaloga: 'Account status',
  uloga: 'Role',
  telefonPomoc: 'Used only for SMS notifications; the number is not verified with a code.',
  cuvanje: 'Saving...',
  sacuvajIzmene: 'Save changes',
  telefonIObavestenja: 'Phone and notifications',
  bezTelefona: 'You have not entered a phone number. Add it in the form on the left to receive SMS notifications.',
  broj: 'Number for notifications: {broj}',
  primajSms: 'Receive SMS notifications',
  promenaLozinke: 'Change password',
  promenaOpis: 'After the change you stay logged in here, and all other devices are logged out.',
  trenutnaLozinka: 'Current password',
  unesiteTrenutnu: 'Enter your current password.',
  novaLozinka: 'New password',
  potvrdaNove: 'Confirm new password',
  previsePokusaja: 'Too many failed attempts. Try again in {vreme}.',
  menjamo: 'Changing...',
  promeniLozinku: 'Change password',
  podaciSacuvani: 'Your details have been saved.',
  cuvanjeNeuspelo: 'Saving failed.',
  smsUkljucen: 'SMS notifications are turned on.',
  smsIskljucen: 'SMS notifications are turned off.',
  promenaNijeSacuvana: 'The change was not saved.',
  lozinkaPromenjena: 'The password has been changed.',
  lozinkaNije: 'The password was not changed.'
};
