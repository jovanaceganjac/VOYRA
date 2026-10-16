import type { Recnik } from '../../prevod';
import type * as sr from '../sr/pocetna';

export const pocetna: Recnik<typeof sr.pocetna> = {
  nadnaslov: 'Trip planning',
  naslov: 'Flight, accommodation and sightseeing plan — in one place',
  opis:
    'Enter the cities, dates and budget. Voyra ranks the offers, groups attractions by day and determines the visiting order so that you travel as little as possible.',
  brzaPretraga: 'Quick search',
  polaziste: 'From',
  odrediste: 'To',
  polazak: 'Departure',
  povratak: 'Return',
  putnika: 'Travellers',
  budzet: 'Budget',
  budzetOpciono: '(optional, EUR)',
  izaberitePolazak: 'Choose a departure date.',
  izaberitePovratak: 'Choose a return date.',
  najmanjeJedanPutnik: 'At least 1 traveller.',
  budzetVeciOdNule: 'The budget must be greater than zero.',
  najviseDana: 'A trip can last at most {broj} days.',
  pronadji: 'Find a plan',
  istaknute: 'Featured destinations',
  fotografija: 'Photo: {naziv}',
  foto: 'Photo:',
  popularno: 'Popular in the last 30 days',
  pretraga: { jedan: '{broj} search', nekoliko: '{broj} searches', mnogo: '{broj} searches' },
  mapaTacka: 'Plan a trip: {grad}',
  kakoRadi: 'How it works',
  korak1Naslov: 'Enter the parameters',
  korak1Opis: 'Cities, dates, number of travellers and a budget in euros.',
  korak2Naslov: 'The system ranks the offers',
  korak2Opis:
    'Flights by price, duration and stops; accommodation by price, rating and distance from the centre.',
  korak3Naslov: 'You get a daily plan',
  korak3Opis: 'Attractions grouped by day and ordered so that you travel as little as possible between them.'
};

export const provera: Recnik<typeof sr.provera> = {
  izaberiteGradove: 'Choose the origin and destination from the list of suggestions.',
  razlicitiGradovi: 'The origin and destination must be different.',
  polazakProslost: 'The departure date cannot be in the past.',
  povratakPosle: 'The return date must be after the departure date.',
  najviseDana: 'A trip can last at most {max} days ({dana} selected).'
};
