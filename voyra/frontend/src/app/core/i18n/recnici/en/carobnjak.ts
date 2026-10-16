import type { Recnik } from '../../prevod';
import type * as sr from '../sr/carobnjak';

export const carobnjak: Recnik<typeof sr.carobnjak> = {
  naslov: 'Create a trip',
  koraciAria: 'Trip creation steps',
  koraci: { 1: 'Parameters', 2: 'Flight', 3: 'Accommodation', 4: 'Plan' },
  putnik: { jedan: '{broj} traveller', nekoliko: '{broj} travellers', mnogo: '{broj} travellers' },
  gost: { jedan: '{broj} guest', nekoliko: '{broj} guests', mnogo: '{broj} guests' },
  noc: { jedan: 'night', nekoliko: 'nights', mnogo: 'nights' },
  preporuceno: 'Recommended',
  iznadBudzeta: 'Over budget',
  izabrano: 'Selected',
  demoPodaci: 'Demo data is shown.',
  manjeJeBolje: 'total {broj} (lower is better)',
  cena: 'price {broj}',
  trajanje: 'duration {broj}',
  presedanjaBod: 'stops {broj}',
  udaljenost: 'distance {broj}',
  ocena: 'rating {broj}'
};

export const korak1: Recnik<typeof sr.korak1> = {
  naslov: 'Trip parameters',
  najviseDana: 'At most {broj} days, including the departure and return days.',
  brojPutnika: 'Number of travellers',
  viseDelova: 'For more than {broj} travellers the flight is booked in several parts.',
  budzetOrijentir: 'The budget is a guideline — no offer is rejected because of it.',
  prilagodi: 'Customise preferences',
  prioritet: 'Transport priority',
  tipSmestaja: 'Accommodation type',
  minOcena: 'Minimum accommodation rating',
  bezOgranicenja: 'No limit',
  bezOceneUlazi: 'Accommodation without guest ratings is still included.',
  interesovanja: 'Interests',
  tempo: 'Pace',
  pocetakDana: 'Day starts at',
  krajDana: 'Day ends at',
  dalje: 'Next: choose a flight',
  tipBarJedan: 'Choose at least one accommodation type.',
  interesovanjeBarJedno: 'Choose at least one interest.',
  krajPosle: 'The end of the day must be after its start.'
};

export const korak2: Recnik<typeof sr.korak2> = {
  prioritet: 'Transport priority',
  presedanja: 'Stops',
  svi: 'All',
  direktan: 'Direct',
  najvise1: 'At most 1',
  polazakOd: 'Departure from',
  polazakDo: 'Departure until',
  trazimo: 'Searching for flights…',
  greska: 'Flights could not be loaded.',
  nemaLetova: 'There are no flights for this route and dates',
  demoRuta: 'Without access keys, the demo data only covers the Belgrade → Athens route.',
  bezLetaOpis:
    'You can continue without a flight — the plan will then have full days, since the first and last days will not be shortened by the flight times.',
  nastaviBezLeta: 'Continue without a flight',
  ponuda: { jedan: '{broj} offer', nekoliko: '{broj} offers', mnogo: '{broj} offers' },
  vaziDo: 'offer valid until {vreme}',
  zaSvePutnike: 'total for all travellers',
  odlazak: 'Outbound',
  povratak: 'Return',
  udeoAria: 'Share of the score: price {cena} percent, duration {trajanje} percent, stops {presedanja} percent',
  sakrijSegmente: 'Hide segments',
  prikaziSegmente: 'Show segments',
  dalje: 'Next: choose accommodation',
  objasnjenje: {
    najjeftinije: 'Offers are sorted by price; duration does not affect the order.',
    najbrze: 'Offers are sorted by total duration; price does not affect the order.',
    balans: 'Price and duration each make up half of the score, with a small penalty per stop.'
  }
};

export const korak3: Recnik<typeof sr.korak3> = {
  preostaliBudzet: 'remaining budget {iznos}',
  tip: 'Type',
  minOcena: 'Minimum rating',
  sveOcene: 'All ratings',
  najvisePoNoci: 'Max per night (EUR)',
  trazimo: 'Searching for accommodation…',
  greska: 'Accommodation could not be loaded.',
  nemaSmestaja: 'There is no accommodation for this city and dates',
  bezSmestajaOpis:
    'Check the filters or continue without accommodation — the plan will then start each day from the city centre instead of the accommodation.',
  nastaviBezSmestaja: 'Continue without accommodation',
  bezOcene: 'No guest rating',
  ocena: 'Rating',
  odCentra: '{razdaljina} from the centre',
  udeoAria: 'Share of the score: price {cena} percent, distance {udaljenost} percent, rating {ocena} percent',
  booking: 'Book on Booking.com',
  bookingNapomena: 'Voyra does not book accommodation — you complete the booking on Booking.com.',
  dalje: 'Next: trip plan'
};

export const korak4: Recnik<typeof sr.korak4> = {
  pravimo: 'Building the plan…',
  letIstekao: 'The selected flight is no longer available',
  smestajIstekao: 'The selected accommodation is no longer available',
  isteklo: 'The offer has expired in the meantime. Choose again and the plan will be built from the new offer.',
  nazadNaLet: 'Back to flight selection',
  nazadNaSmestaj: 'Back to accommodation selection',
  pocniIspocetka: 'Start over',
  otvoriPutovanje: 'Open trip',
  sacuvaj: 'Save trip',
  prijaviSacuvaj: 'Log in and save',
  sveAtrakcije: 'See all attractions in {grad}',
  nijeNapravljen: 'The plan could not be created.',
  sesijaNePostoji: 'The plan no longer exists - a session lasts 24 hours. You can generate it again.',
  nijeUcitan: 'The plan could not be loaded.',
  vecSacuvano: 'The trip is already saved in "My trips".',
  sacuvano: 'The trip has been saved in "My trips".',
  sesijaIstekla: 'The plan no longer exists - a session lasts 24 hours.',
  cuvanjeNeuspelo: 'Saving failed.'
};

export const preferencije: Recnik<typeof sr.preferencije> = {
  najjeftinije: 'Cheapest',
  najbrze: 'Fastest',
  balans: 'Balanced',
  hotel: 'Hotel',
  apartman: 'Apartment',
  hostel: 'Hostel',
  kultura: 'Culture',
  priroda: 'Nature',
  gastronomija: 'Food & drink',
  nocni_zivot: 'Nightlife',
  soping: 'Shopping',
  muzeji: 'Museums',
  opusten: 'Relaxed',
  umeren: 'Moderate',
  intenzivan: 'Intensive',
  tempoJedan: '{naziv} ({broj} activities per day)',
  tempoRaspon: '{naziv} ({od}–{do} activities per day)'
};
