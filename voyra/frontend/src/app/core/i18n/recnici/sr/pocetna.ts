export const pocetna = {
  nadnaslov: 'Planiranje putovanja',
  naslov: 'Let, smeštaj i plan obilaska — na jednom mestu',
  opis:
    'Unesite gradove, datume i budžet. Voyra rangira ponude, grupiše atrakcije po danima i određuje redosled obilaska tako da se najmanje putuje.',
  brzaPretraga: 'Brza pretraga',
  polaziste: 'Polazište',
  odrediste: 'Odredište',
  polazak: 'Polazak',
  povratak: 'Povratak',
  putnika: 'Putnika',
  budzet: 'Budžet',
  budzetOpciono: '(opciono, EUR)',
  izaberitePolazak: 'Izaberite datum polaska.',
  izaberitePovratak: 'Izaberite datum povratka.',
  najmanjeJedanPutnik: 'Najmanje 1 putnik.',
  budzetVeciOdNule: 'Budžet mora biti veći od nule.',
  najviseDana: 'Putovanje može trajati najviše {broj} dana.',
  pronadji: 'Pronađi plan',
  istaknute: 'Istaknute destinacije',
  fotografija: 'Fotografija: {naziv}',
  foto: 'Foto:',
  popularno: 'Popularno poslednjih 30 dana',
  pretraga: { jedan: '{broj} pretraga', nekoliko: '{broj} pretrage', mnogo: '{broj} pretraga' },
  mapaTacka: 'Planiraj putovanje: {grad}',
  kakoRadi: 'Kako radi',
  korak1Naslov: 'Unesete parametre',
  korak1Opis: 'Gradove, datume, broj putnika i budžet u evrima.',
  korak2Naslov: 'Sistem rangira ponude',
  korak2Opis:
    'Letove po ceni, trajanju i presedanjima; smeštaj po ceni, oceni i udaljenosti od centra.',
  korak3Naslov: 'Dobijate dnevni plan',
  korak3Opis: 'Atrakcije grupisane po danima i poređane tako da se najmanje putuje između njih.'
};

/** Provere parametara putovanja - iste na početnoj i u koraku 1. */
export const provera = {
  izaberiteGradove: 'Izaberite polazište i odredište iz liste predloga.',
  razlicitiGradovi: 'Polazište i odredište moraju biti različiti.',
  polazakProslost: 'Datum polaska ne može biti u prošlosti.',
  povratakPosle: 'Datum povratka mora biti posle datuma polaska.',
  najviseDana: 'Putovanje može trajati najviše {max} dana (izabrano {dana}).'
};
