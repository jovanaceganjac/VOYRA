/**
 * Sadržaj koji uređuje administrator (spec §3.3, §9):
 * kategorije interesovanja, atrakcije i istaknute destinacije.
 */

export interface RadnoVreme {
  open: string;
  close: string;
}

export interface Slika {
  url: string;
  sourceUrl?: string;
  credit?: string;
}

/** `interest_categories` */
export interface Kategorija {
  kljuc: string;
  naziv: string;
  opis: string;
  /** OpenTripMap `kinds` koji pripadaju ovoj kategoriji. */
  eksterneKategorije: string[];
  /** Geoapify kategorije (hijerarhijske, npr. `tourism.sights`). */
  geoapifyKategorije: string[];
  trajanjePoseteMin: number;
  radnoVreme: RadnoVreme;
  redosled: number;
  aktivna: boolean;
  /** Koliko sačuvanih putovanja je koristi - stiže uz pojedinačnu kategoriju. */
  koristiPutovanja?: number;
}

/** `attractions` - atrakcija koju je uneo administrator. */
export interface AdminAtrakcija {
  id: string;
  izvor: 'admin';
  naziv: string;
  opis: string;
  gradId: string;
  gradNaziv: string | null;
  lat: number;
  lon: number;
  kategorije: string[];
  trajanjeMin: number;
  radnoVreme: RadnoVreme | null;
  cenaUlaznice: number | null;
  slika: Slika | null;
  aktivna: boolean;
}

/** `destinations` - istaknuta destinacija na početnoj. */
export interface IstaknutaDestinacija {
  id: string;
  gradId: string;
  naziv: string;
  naslov: string;
  drzava: string | null;
  drzavaNaziv: string | null;
  lat: number | null;
  lon: number | null;
  opis: string;
  slika: Slika | null;
  redosled: number;
  istaknuta: boolean;
}

/** `search_stats` - izračunata popularnost (§4.1). */
export interface PopularnaDestinacija {
  gradId: string;
  naziv: string;
  drzava: string;
  drzavaNaziv: string;
  lat: number;
  lon: number;
  brojPretraga: number;
  brojSacuvanih: number;
  score: number;
}

/** GET /api/admin/logs -> data[] */
export interface RevizioniZapis {
  _id: string;
  action: string;
  userId?: string | null;
  adminId?: string | null;
  target?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  timestamp: string;
  ipAddress?: string;
  status: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
}
