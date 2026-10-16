export const validacija = {
  obavezno: 'Polje je obavezno.',
  email: 'Unesite ispravnu adresu e-pošte.',
  prekratko: 'Vrednost je prekratka.',
  predugo: 'Vrednost je preduga.',
  format: 'Neispravan format.',
  lozinka: 'Lozinka ne ispunjava sva pravila.',
  telefon: 'Format: +381601234567 (znak + i 10-14 cifara).',
  nePoklapajuSe: 'Lozinke se ne poklapaju.',
  neispravno: 'Neispravna vrednost.',
  pravilaLozinke: 'Pravila za lozinku',
  pravilo8: 'Najmanje 8 karaktera',
  praviloVeliko: 'Veliko slovo',
  praviloMalo: 'Malo slovo',
  praviloBroj: 'Broj',
  praviloSpecijalni: 'Specijalni znak (!@#$%^&*)'
};

/** Podaci o putniku (rezervacija leta, spec §4.8). */
export const putnik = {
  titule: {
    mr: 'g. (mr)',
    ms: 'gđa/gđica (ms)',
    mrs: 'gđa (mrs)',
    miss: 'gđica (miss)',
    dr: 'dr (dr)'
  },
  polovi: { m: 'Muški', f: 'Ženski' },
  obavezno: 'Ovo polje je obavezno',
  kratkoIme: 'Unesite bar dva znaka',
  nelatinica: 'Unesite kao u pasošu, latinicom (slova, razmak, crtica, apostrof)',
  email: 'Unesite ispravnu email adresu',
  e164: 'Telefon u obliku +381641234567',
  uBuducnosti: 'Datum rođenja mora biti u prošlosti',
  maloletan: 'Rezervacija dece nije podržana — pretraga je rađena za odrasle putnike',
  datum: 'Unesite ispravan datum',
  predugoIme: 'Ime i prezime zajedno najviše {max} znakova',
  neispravno: 'Vrednost nije ispravna'
};
