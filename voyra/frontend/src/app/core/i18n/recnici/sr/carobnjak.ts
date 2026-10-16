export const carobnjak = {
  naslov: 'Kreiranje putovanja',
  koraciAria: 'Koraci kreiranja putovanja',
  koraci: { 1: 'Parametri', 2: 'Izbor leta', 3: 'Izbor smeštaja', 4: 'Plan' },
  putnik: { jedan: '{broj} putnik', nekoliko: '{broj} putnika', mnogo: '{broj} putnika' },
  gost: { jedan: '{broj} gost', nekoliko: '{broj} gosta', mnogo: '{broj} gostiju' },
  noc: { jedan: 'noć', nekoliko: 'noći', mnogo: 'noći' },
  preporuceno: 'Preporučeno',
  iznadBudzeta: 'Iznad budžeta',
  izabrano: 'Izabrano',
  demoPodaci: 'Prikazani su demonstracioni podaci.',
  manjeJeBolje: 'ukupno {broj} (manje je bolje)',
  cena: 'cena {broj}',
  trajanje: 'trajanje {broj}',
  presedanjaBod: 'presedanja {broj}',
  udaljenost: 'udaljenost {broj}',
  ocena: 'ocena {broj}'
};

export const korak1 = {
  naslov: 'Parametri putovanja',
  najviseDana: 'Najviše {broj} dana, uključujući dan polaska i povratka.',
  brojPutnika: 'Broj putnika',
  viseDelova: 'Za više od {broj} putnika let se rezerviše u više delova.',
  budzetOrijentir: 'Budžet je orijentir — nijedna ponuda se ne odbacuje zbog njega.',
  prilagodi: 'Prilagodi preferencije',
  prioritet: 'Prioritet prevoza',
  tipSmestaja: 'Tip smeštaja',
  minOcena: 'Minimalna ocena smeštaja',
  bezOgranicenja: 'Bez ograničenja',
  bezOceneUlazi: 'Smeštaj bez ocene gostiju i dalje ulazi u listu.',
  interesovanja: 'Interesovanja',
  tempo: 'Tempo',
  pocetakDana: 'Početak dana',
  krajDana: 'Kraj dana',
  dalje: 'Dalje: izbor leta',
  tipBarJedan: 'Izaberite bar jedan tip smeštaja.',
  interesovanjeBarJedno: 'Izaberite bar jedno interesovanje.',
  krajPosle: 'Kraj dana mora biti posle početka dana.'
};

export const korak2 = {
  prioritet: 'Prioritet prevoza',
  presedanja: 'Presedanja',
  svi: 'Svi',
  direktan: 'Direktan',
  najvise1: 'Najviše 1',
  polazakOd: 'Polazak od',
  polazakDo: 'Polazak do',
  trazimo: 'Tražimo letove…',
  greska: 'Letovi nisu mogli da se učitaju.',
  nemaLetova: 'Za ovu rutu i datume nema letova',
  demoRuta: 'Bez pristupnih ključeva demo podaci pokrivaju samo rutu Beograd → Atina.',
  bezLetaOpis:
    'Možete nastaviti bez leta — plan će tada imati pune dane, jer prvi i poslednji dan neće biti skraćeni prema vremenu leta.',
  nastaviBezLeta: 'Nastavi bez leta',
  ponuda: { jedan: '{broj} ponuda', nekoliko: '{broj} ponude', mnogo: '{broj} ponuda' },
  vaziDo: 'ponuda važi do {vreme}',
  zaSvePutnike: 'ukupno za sve putnike',
  odlazak: 'Odlazak',
  povratak: 'Povratak',
  udeoAria: 'Udeo u oceni: cena {cena} odsto, trajanje {trajanje} odsto, presedanja {presedanja} odsto',
  sakrijSegmente: 'Sakrij segmente',
  prikaziSegmente: 'Prikaži segmente',
  dalje: 'Dalje: izbor smeštaja',
  objasnjenje: {
    najjeftinije: 'Ponude su poređane po ceni; trajanje ne utiče na redosled.',
    najbrze: 'Ponude su poređane po ukupnom trajanju; cena ne utiče na redosled.',
    balans: 'Cena i trajanje nose po pola ocene, uz malu kaznu po presedanju.'
  }
};

export const korak3 = {
  preostaliBudzet: 'preostali budžet {iznos}',
  tip: 'Tip',
  minOcena: 'Minimalna ocena',
  sveOcene: 'Sve ocene',
  najvisePoNoci: 'Najviše po noći (EUR)',
  trazimo: 'Tražimo smeštaj…',
  greska: 'Smeštaj nije mogao da se učita.',
  nemaSmestaja: 'Za ovaj grad i datume nema smeštaja',
  bezSmestajaOpis:
    'Proverite filtere ili nastavite bez smeštaja — plan će tada obilazak računati od centra grada umesto od smeštaja.',
  nastaviBezSmestaja: 'Nastavi bez smeštaja',
  bezOcene: 'Bez ocene gostiju',
  ocena: 'Ocena',
  odCentra: '{razdaljina} od centra',
  udeoAria: 'Udeo u oceni: cena {cena} odsto, udaljenost {udaljenost} odsto, ocena {ocena} odsto',
  booking: 'Rezerviši na Booking.com',
  bookingNapomena: 'Voyra ne rezerviše smeštaj — rezervaciju završavate na Booking.com.',
  dalje: 'Dalje: plan putovanja'
};

export const korak4 = {
  pravimo: 'Pravimo plan…',
  letIstekao: 'Izabrani let više nije dostupan',
  smestajIstekao: 'Izabrani smeštaj više nije dostupan',
  isteklo: 'Ponuda je u međuvremenu istekla. Izaberite ponovo i plan će se napraviti od nove ponude.',
  nazadNaLet: 'Nazad na izbor leta',
  nazadNaSmestaj: 'Nazad na izbor smeštaja',
  pocniIspocetka: 'Počni ispočetka',
  otvoriPutovanje: 'Otvori putovanje',
  sacuvaj: 'Sačuvaj putovanje',
  prijaviSacuvaj: 'Prijavi se i sačuvaj',
  sveAtrakcije: 'Pogledaj sve atrakcije u gradu {grad}',
  nijeNapravljen: 'Plan nije mogao da se napravi.',
  sesijaNePostoji: 'Plan više ne postoji - sesija važi 24 sata. Možete ga generisati ponovo.',
  nijeUcitan: 'Plan nije mogao da se učita.',
  vecSacuvano: 'Putovanje je već sačuvano u "Moja putovanja".',
  sacuvano: 'Putovanje je sačuvano u "Moja putovanja".',
  sesijaIstekla: 'Plan više ne postoji - sesija važi 24 sata.',
  cuvanjeNeuspelo: 'Čuvanje nije uspelo.'
};

/** Nazivi vrednosti preferencija (kodovi iz Planner Service-a). */
export const preferencije = {
  najjeftinije: 'Najjeftinije',
  najbrze: 'Najbrže',
  balans: 'Balans',
  hotel: 'Hotel',
  apartman: 'Apartman',
  hostel: 'Hostel',
  kultura: 'Kultura',
  priroda: 'Priroda',
  gastronomija: 'Gastronomija',
  nocni_zivot: 'Noćni život',
  soping: 'Šoping',
  muzeji: 'Muzeji',
  opusten: 'Opušten',
  umeren: 'Umeren',
  intenzivan: 'Intenzivan',
  tempoJedan: '{naziv} ({broj} aktivnosti dnevno)',
  tempoRaspon: '{naziv} ({od}–{do} aktivnosti dnevno)'
};
