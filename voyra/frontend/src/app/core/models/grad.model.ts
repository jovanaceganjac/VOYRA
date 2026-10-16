import { aktivniJezik } from '../i18n/jezik';
import { prevedi } from '../i18n/prevod';

/**
 * Grad iz sopstvene baze referentnih podataka (`GET /v1/cities`).
 *
 * Izvori: GeoNames (CC BY 4.0) za gradove, OurAirports (javni domen) za
 * aerodrome — navedeni u podnožju i u README-u.
 */

export interface Aerodrom {
  iata: string;
  naziv: string;
  udaljenostKm: number;
  tip?: string;
}

export interface Grad {
  id: string;
  /** Srpski naziv kada postoji, inače lokalni. */
  naziv: string;
  nazivLokalni: string;
  nazivEn: string;
  /** ISO-2 oznaka države. */
  drzava: string;
  drzavaNaziv: string;
  lat: number;
  lon: number;
  stanovnika: number;
  /** Najbliži aerodrom, ili `null` kada ga nema u dometu. */
  aerodrom: Aerodrom | null;
  aerodromi: Aerodrom[];
  /** IATA kod grada (LON, PAR, MIL) kada ga grad ima. */
  iataGrada: string | null;
  /** Aerodrom je dalje od 30 km — plan računa transfer. */
  bezAerodroma: boolean;
  /** Nema aerodroma u dometu (150 km) — let nije moguć. */
  bezLeta: boolean;
}

/**
 * Naziv grada na aktivnom jeziku: srpski naziv, a na engleskom
 * međunarodni (`nazivEn`) kada ga zapis ima.
 */
export const nazivGrada = (g: { naziv?: string; nazivEn?: string } | null | undefined): string =>
  (aktivniJezik() !== 'sr' && g?.nazivEn) || g?.naziv || '';

/** Naziv države: srpski iz baze, a na drugom jeziku iz ISO oznake (Intl). */
export const nazivDrzave = (g: { drzava?: string; drzavaNaziv?: string }): string => {
  if (aktivniJezik() !== 'sr' && g.drzava) {
    try {
      return new Intl.DisplayNames([aktivniJezik()], { type: 'region' }).of(g.drzava) || g.drzavaNaziv || '';
    } catch {
      /* pregledač bez Intl.DisplayNames - ostaje naziv iz baze */
    }
  }

  return g.drzavaNaziv || '';
};

/** „Minhen, Nemačka" / „Munich, Germany" */
export const nazivSaDrzavom = (g: Grad): string => `${nazivGrada(g)}, ${nazivDrzave(g)}`;

/**
 * Deo predloga koji govori kako se do grada stiže.
 *
 * Aerodrom u gradu se navodi kratko („MUC 29 km"), a udaljen izričito
 * („najbliži aerodrom LJU, 31 km"), jer to menja plan prvog i poslednjeg
 * dana — putovanje od aerodroma se uračunava.
 */
export const opisAerodroma = (g: Grad): string => {
  const a = g.aerodrom;

  if (!a) return prevedi('gradovi.bezAerodromaBlizu');

  const km = Math.round(a.udaljenostKm);

  if (g.bezLeta) return prevedi('gradovi.predalekoZaLet', { iata: a.iata, km });
  if (g.bezAerodroma) return prevedi('gradovi.najblizi', { iata: a.iata, km });

  return `${a.iata} ${km} km`;
};

/** „Minhen, Nemačka · MUC 29 km" */
export const opisGrada = (g: Grad): string => `${nazivSaDrzavom(g)} · ${opisAerodroma(g)}`;

/** Kod koji ide u pretragu leta — kod grada ima prednost nad aerodromom. */
export const kodZaLet = (g: Grad | null): string | null => {
  if (!g || g.bezLeta) return null;

  return g.iataGrada || g.aerodrom?.iata || null;
};

/**
 * Kratak zapis grada koji se čuva uz putovanje i uz plan (spec §9).
 *
 * Nosi samo ono što prikaz traži, pa naziv grada više ne mora da se
 * pogađa iz IATA koda.
 */
export interface GradUPutovanju {
  id: string;
  naziv: string;
  /** Međunarodni naziv; putovanja sačuvana ranije ga nemaju. */
  nazivEn?: string;
  drzava: string;
  drzavaNaziv: string;
  lat: number;
  lon: number;
  aerodrom: (Aerodrom & { izvanGrada?: boolean }) | null;
}

/**
 * Naziv mesta za prikaz.
 *
 * Grad ima prednost; kada ga nema (putovanje sačuvano pre uvoza baze
 * gradova), prikazuje se sam IATA kod — bez izmišljanja naziva.
 */
export const nazivMesta = (
  grad: { naziv?: string; nazivEn?: string } | null | undefined,
  kod?: string | null
): string => nazivGrada(grad) || (kod ? String(kod).toUpperCase() : '');
