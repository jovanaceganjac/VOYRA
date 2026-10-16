import type { Recnik } from '../../prevod';
import type * as sr from '../sr/format';

export const format: Recnik<typeof sr.format> = {
  dani: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].join('|'),
  meseci: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ].join('|'),
  datumSaDanom: '{dan}, {broj} {mesec}',
  direktanLet: 'direct flight',
  presedanje: { jedan: '{broj} stop', nekoliko: '{broj} stops', mnogo: '{broj} stops' },
  pesice: 'on foot',
  prevozom: 'by transport'
};
