import type { Recnik } from '../../prevod';
import type * as sr from '../sr/gradovi';

export const gradovi: Recnik<typeof sr.gradovi> = {
  oznaka: 'City',
  placeholder: 'City or airport',
  bezAerodromaBlizu: 'no airport nearby',
  predalekoZaLet: 'nearest airport {iata}, {km} km — too far for a flight',
  najblizi: 'nearest airport {iata}, {km} km',
  uputstvo: 'Type at least {broj} characters, then choose a city with the arrow keys and Enter.',
  nemaGrada: 'There is no city with that name.',
  bezLeta: 'There is no airport within 150 km of {grad} — the plan can be made without a flight.',
  transfer: 'The flight goes to {iata} airport, {km} km from the city — the transfer is included in the first and last day.',
  trazimo: 'Searching for cities.',
  nemaPredloga: 'No suggestions.',
  predlog: {
    jedan: '{broj} suggestion. Use the arrow keys.',
    nekoliko: '{broj} suggestions. Use the arrow keys.',
    mnogo: '{broj} suggestions. Use the arrow keys.'
  }
};

export const atrakcije: Recnik<typeof sr.atrakcije> = {
  naslov: 'Attractions',
  opis: 'Attractions are scored with the same formula as in planning: match with interests and popularity.',
  interesovanja: 'Interests',
  bezIzbora: '(with no selection, all are shown)',
  trazimo: 'Searching...',
  prikazi: 'Show attractions',
  trazimoAtrakcije: 'Searching for attractions…',
  kategorija: 'Category',
  sve: 'All ({broj})',
  sortiranje: 'Sort by',
  poOceni: 'Match score',
  poNazivu: 'Name',
  prikazano: '{broj} shown',
  ocenaPoklapanja: 'Match score: {broj}',
  bodovanje: 'match with interests {interesovanja} · popularity {popularnost}',
  nijePronadjena: 'No attractions were found for {grad}.',
  izaberiteGrad: 'Choose a city from the list of suggestions.',
  nisuUcitane: 'Attractions could not be loaded.'
};
