export type Uloga = 'korisnik' | 'admin';
export type StatusNaloga = 'na_cekanju' | 'odobren' | 'odbijen' | 'blokiran';

/** Telefon za SMS obaveštenja - broj se ne potvrđuje SMS kodom. */
export interface Telefon {
  number: string;
  smsOptIn: boolean;
}

/**
 * Korisnik iz POST /api/users/login -> odgovor.user
 * Napomena: prijava NE vraca email; on stize tek sa GET /api/users/me.
 */
export interface PrijavljeniKorisnik {
  id: string;
  ime: string;
  prezime: string;
  korisnickoIme: string;
  uloga: Uloga;
  status: StatusNaloga;
  email?: string;
  phone?: Telefon | null;
}

/** GET /api/users/me -> data (koristi _id, ne id) */
export interface ProfilKorisnika {
  _id: string;
  ime: string;
  prezime: string;
  email: string;
  korisnickoIme: string;
  uloga: Uloga;
  status: StatusNaloga;
  phone: Telefon | null;
}

/** POST /api/users/login */
export interface OdgovorPrijave {
  success: boolean;
  token: string;
  user: PrijavljeniKorisnik;
}

/** POST /api/users/register - NE vraca token, nalog ceka odobrenje */
export interface OdgovorRegistracije {
  success: boolean;
  message: string;
  userId: string;
  phone: Telefon | null;
}

export interface ZahtevRegistracije {
  ime: string;
  prezime: string;
  email: string;
  korisnickoIme: string;
  lozinka: string;
  lozinkaConfirm: string;
  phone?: string;
}

export interface ZahtevPrijave {
  korisnickoIme: string;
  lozinka: string;
}

/** Sadrzaj JWT-a koji izdaje user-service. */
export interface JwtSadrzaj {
  id: string;
  korisnickoIme: string;
  email: string;
  uloga: Uloga;
  iat: number;
  exp: number;
}
