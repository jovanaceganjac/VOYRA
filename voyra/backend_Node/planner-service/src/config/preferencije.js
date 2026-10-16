/**
 * Sve konstante algoritma planiranja na jednom mestu (spec §4.2 i §6).
 *
 * treba da kategorije interesovanja prebaci u bazu (uredjuje ih
 * administrator), pa su ovde odvojene od koda koji ih koristi.
 *
 * Svaka vrednost je obrazlozena u documentation/ALGORITHMS.md.
 */

// =================================================================
// Preferencije (spec §4.2)
// =================================================================

const PRIORITETI_PREVOZA = ['najjeftinije', 'najbrze', 'balans'];
const TIPOVI_SMESTAJA = ['hotel', 'apartman', 'hostel'];
const INTERESOVANJA = ['kultura', 'priroda', 'gastronomija', 'nocni_zivot', 'soping', 'muzeji'];
const TEMPO = ['opusten', 'umeren', 'intenzivan'];

const PODRAZUMEVANE_PREFERENCIJE = {
  transportPriority: 'balans',
  accommodationTypes: [...TIPOVI_SMESTAJA],
  minAccommodationRating: null,
  interests: ['kultura', 'muzeji'],
  pace: 'umeren',
  dayStart: '09:00',
  dayEnd: '20:00'
};

/**
 * Tempo -> ciljni broj aktivnosti dnevno.
 * Spec §4.2 daje opsege (opusten 2, umeren 3-4, intenzivan 5-6); uzima se
 * GORNJA granica, jer se broj posle skracuje prema raspolozivom vremenu.
 */
const AKTIVNOSTI_PO_TEMPU = {
  opusten: 2,
  umeren: 4,
  intenzivan: 6
};

// =================================================================
// FAZA 1: rangiranje letova (spec §6.1)
// =================================================================

/** Tezine (w_c cena, w_t trajanje) po prioritetu prevoza. */
const TEZINE_LETA = {
  najjeftinije: { cena: 1, trajanje: 0 },
  najbrze: { cena: 0, trajanje: 1 },
  balans: { cena: 0.5, trajanje: 0.5 }
};

/**
 * Kazna po presedanju, u jedinicama normalizovane ocene.
 *
 * Cena i trajanje su na [0, 1], pa 0.1 znaci: jedno presedanje vredi
 * kao desetina raspona izmedju najjeftinije i najskuplje ponude. Direktan
 * let tako pobedjuje let sa presedanjem koji je za manje od 10 % raspona
 * bolji po ceni i vremenu, a ne pobedjuje onaj koji je znatno jeftiniji.
 */
const KAZNA_PRESEDANJA = 0.1;

// =================================================================
// FAZA 2: rangiranje smestaja (spec §6.1)
// =================================================================

/**
 * Tezine za smestaj; zbir je 1.
 *
 * Cena nosi najvise jer je budzet glavno ogranicenje putovanja.
 * Udaljenost od centra je druga po vaznosti - ulazi u svaki dan obilaska
 * kroz vreme kretanja. Ocena je najmanja jer je izvor cesto nema
 * (`rating: null`), pa bi veca tezina uvela slucajnost.
 */
const TEZINE_SMESTAJA = {
  cena: 0.5,
  distanca: 0.3,
  ocena: 0.2
};

/**
 * Vrednost koju u normalizaciji dobija smestaj bez ocene.
 * Sredina skale: ne nagradjuje se, ali se ni ne kaznjava kao najgori.
 */
const NORMALIZOVANA_OCENA_BEZ_PODATKA = 0.5;

// =================================================================
// FAZA 3: izbor atrakcija (spec §6.2)
// =================================================================

/**
 * ocena = ALFA * poklapanje sa interesovanjima + (1 - ALFA) * popularnost
 *
 * Korisnik je interesovanja izabrao svesno, pa nose vecinu ocene;
 * popularnost sluzi da razdvoji atrakcije istog poklapanja.
 */
const ALFA_INTERESOVANJA = 0.7;

/** Pauza za rucak (spec §6.4 t.3). */
const RUCAK_MINUTA = 60;

/** Prvi put kada satnica predje ovo vreme, ubacuje se rucak. */
const RUCAK_NE_PRE = '12:30';

/** Prvi dan: transfer sa aerodroma i prijava u smestaj posle sletanja. */
const TRANSFER_PO_DOLASKU_MIN = 90;

/**
 * Prosecna brzina drumskog prevoza od aerodroma do grada (km/h).
 *
 * Koristi se samo kada grad nema sopstveni aerodrom (Bled -> LJU, 31 km).
 * 70 km/h je razuman prosek za mesavinu auto-puta i regionalnog puta sa
 * zadrzavanjima - transfer autobusom ili kolima retko ide brze, a ni
 * mnogo sporije. Procena je namerno blago konzervativna: bolje je da
 * putnik stigne ranije nego da plan racuna sa vremenom koje nema.
 */
const BRZINA_PREVOZA_DO_GRADA_KMH = 70;

/** Preko ove udaljenosti aerodrom se ne racuna kao gradski. */
const PRAG_AERODROMA_U_GRADU_KM = 30;

/** Poslednji dan: dolazak na aerodrom pre poletanja. */
const REZERVA_PRE_POLETANJA_MIN = 180;

/** Ispod ovoliko slobodnog vremena dan nema aktivnosti. */
const MIN_VREME_ZA_AKTIVNOST_MIN = 60;

/** Spec §4.2: putovanje traje najvise 14 dana. */
const MAX_DANA = 14;

// =================================================================
// FAZA 5: kretanje i radno vreme (spec §6.4)
// =================================================================

/** Do ove udaljenosti se ide pesice. */
const PRAG_PESACENJA_KM = 2;
const BRZINA_PESACENJA_KMH = 5;
const BRZINA_PREVOZA_KMH = 20;

/**
 * Procenjeno radno vreme po interesovanju.
 *
 * OpenTripMap radno vreme uglavnom ne daje. Vrednosti su tipicne za
 * evropske gradove i uvek nose `openingHoursEstimated: true`; kada izvor
 * posalje pravo radno vreme, ono ima prednost.
 */
const RADNO_VREME = {
  muzeji: { open: '09:00', close: '17:00' },
  kultura: { open: '09:00', close: '18:00' },
  priroda: { open: '00:00', close: '24:00' },
  gastronomija: { open: '12:00', close: '23:00' },
  nocni_zivot: { open: '20:00', close: '02:00' },
  soping: { open: '10:00', close: '21:00' },
  ostalo: { open: '09:00', close: '18:00' }
};

/** Procena trajanja posete po interesovanju, u minutima. */
const TRAJANJE_POSETE = {
  muzeji: 120,
  kultura: 60,
  priroda: 75,
  gastronomija: 90,
  nocni_zivot: 120,
  soping: 60,
  ostalo: 60
};

// =================================================================
// Mapiranje na OpenTripMap (spec §5)
// =================================================================

/**
 * Interesovanje -> `kinds` koje treba TRAZITI od OpenTripMap-a.
 *
 * Nazivi su iz OpenTripMap taksonomije; navode se i nadredjena i
 * podredjena imena, jer objekat u odgovoru nosi oba. `adult` se namerno
 * NE trazi: ta grupa sadrzi i sadrzaje koji ne pripadaju planu putovanja,
 * pa se nocni zivot trazi preko konkretnih podgrupa.
 */
const INTERESOVANJE_U_KINDS = {
  kultura: [
    'cultural',
    'historic',
    'architecture',
    'historic_architecture',
    'monuments_and_memorials',
    'religion',
    'archaeology',
    'fortifications',
    'castles'
  ],
  muzeji: ['museums'],
  priroda: ['natural', 'gardens_and_parks', 'beaches', 'nature_reserves', 'water'],
  gastronomija: ['foods', 'restaurants', 'cafes', 'marketplaces'],
  nocni_zivot: ['nightclubs', 'bars', 'pubs', 'theatres_and_entertainments'],
  soping: ['shops', 'malls', 'department_stores']
};

/**
 * OpenTripMap `kind` -> interesovanja aplikacije.
 * Jedna atrakcija moze da pripada vise interesovanja (muzej je i muzej
 * i kultura), pa se kategorije skupljaju, a ne biraju.
 */
const KIND_U_INTERESOVANJA = {
  museums: ['muzeji', 'kultura'],

  cultural: ['kultura'],
  historic: ['kultura'],
  historic_architecture: ['kultura'],
  architecture: ['kultura'],
  monuments_and_memorials: ['kultura'],
  religion: ['kultura'],
  archaeology: ['kultura'],
  fortifications: ['kultura'],
  castles: ['kultura'],
  palaces: ['kultura'],

  natural: ['priroda'],
  gardens_and_parks: ['priroda'],
  beaches: ['priroda'],
  nature_reserves: ['priroda'],
  water: ['priroda'],
  geological_formations: ['priroda'],

  foods: ['gastronomija'],
  restaurants: ['gastronomija'],
  cafes: ['gastronomija'],
  fast_food: ['gastronomija'],
  biergartens: ['gastronomija', 'nocni_zivot'],
  marketplaces: ['gastronomija', 'soping'],

  nightclubs: ['nocni_zivot'],
  bars: ['nocni_zivot'],
  pubs: ['nocni_zivot'],
  theatres_and_entertainments: ['nocni_zivot', 'kultura'],

  shops: ['soping'],
  malls: ['soping'],
  department_stores: ['soping'],
  supermarkets: ['soping']
};

/** Kada nijedan `kind` nije prepoznat. */
const PODRAZUMEVANA_KATEGORIJA = 'kultura';

module.exports = {
  BRZINA_PREVOZA_DO_GRADA_KMH,
  PRAG_AERODROMA_U_GRADU_KM,
  PRIORITETI_PREVOZA,
  TIPOVI_SMESTAJA,
  INTERESOVANJA,
  TEMPO,
  PODRAZUMEVANE_PREFERENCIJE,
  AKTIVNOSTI_PO_TEMPU,

  TEZINE_LETA,
  KAZNA_PRESEDANJA,

  TEZINE_SMESTAJA,
  NORMALIZOVANA_OCENA_BEZ_PODATKA,

  ALFA_INTERESOVANJA,
  RUCAK_MINUTA,
  RUCAK_NE_PRE,
  TRANSFER_PO_DOLASKU_MIN,
  REZERVA_PRE_POLETANJA_MIN,
  MIN_VREME_ZA_AKTIVNOST_MIN,
  MAX_DANA,

  PRAG_PESACENJA_KM,
  BRZINA_PESACENJA_KMH,
  BRZINA_PREVOZA_KMH,
  RADNO_VREME,
  TRAJANJE_POSETE,

  INTERESOVANJE_U_KINDS,
  KIND_U_INTERESOVANJA,
  PODRAZUMEVANA_KATEGORIJA
};
