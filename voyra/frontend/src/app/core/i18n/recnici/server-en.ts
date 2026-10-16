/**
 * Prevod poruka koje šalju servisi (na srpskom) na engleski.
 *
 * `tacne` - poruka od reči do reči; `obrasci` - poruke sa promenljivim
 * delom (iznos, broj dana, naziv grada). Poruka koje ovde nema ostaje u
 * originalu. Tehničke poruke namenjene programerima (interni ključevi,
 * .env) se ne prevode - korisnik ih ne vidi.
 */
export interface TabelaServera {
  tacne: Record<string, string>;
  obrasci: [RegExp, string][];
}

export const SERVER_EN: TabelaServera = {
  tacne: {
    // --- Prijava i registracija (User Service) ---
    'Korisnicko ime ili lozinka nisu tacni': 'The username or password is incorrect',
    'Nalog je blokiran': 'The account is blocked',
    'Registracija je odbijena': 'The registration was rejected',
    'Cekanje na odobrenje admina': 'Waiting for administrator approval',
    'Korisnik sa ovim email-om vec postoji': 'A user with this email already exists',
    'Korisnicko ime je vec zauzeto': 'The username is already taken',
    'Broj telefona je vec u upotrebi': 'The phone number is already in use',
    'Broj telefona je prazan': 'The phone number is empty',
    'Invalid phone format: broj mora da pocinje sa + i pozivnim brojem':
      'Invalid phone format: the number must start with + and the country code',
    'Invalid phone format: ocekivano + i 10-14 cifara (npr. +381601234567)':
      'Invalid phone format: expected + and 10-14 digits (e.g. +381601234567)',
    'Korisnik nije pronadjen': 'The user was not found',
    'Trenutna lozinka nije tacna': 'The current password is incorrect',
    'Nova lozinka mora da se razlikuje od trenutne': 'The new password must differ from the current one',
    'Lozinka je promenjena. Ostali uredjaji su odjavljeni.':
      'The password has been changed. Other devices have been logged out.',
    'Ime mora imati minimum 2 karaktera': 'The first name must have at least 2 characters',
    'Ime sme imati najvise 50 karaktera': 'The first name may have at most 50 characters',
    'Ime sme sadrzati samo slova': 'The first name may contain only letters',
    'Ime je obavezno': 'The first name is required',
    'Prezime mora imati minimum 2 karaktera': 'The last name must have at least 2 characters',
    'Prezime sme imati najvise 50 karaktera': 'The last name may have at most 50 characters',
    'Prezime sme sadrzati samo slova': 'The last name may contain only letters',
    'Prezime je obavezno': 'The last name is required',
    'Unesite validan email': 'Enter a valid email',
    'Email je obavezan': 'The email is required',
    'Korisnicko ime sme sadrzati samo slova, brojeve, _ i - (bez razmaka)':
      'The username may contain only letters, digits, _ and - (no spaces)',
    'Korisnicko ime mora imati najmanje 3 karaktera': 'The username must have at least 3 characters',
    'Korisnicko ime sme imati najvise 20 karaktera': 'The username may have at most 20 characters',
    'Korisnicko ime je obavezno': 'The username is required',
    'Lozinke se ne poklapaju': 'The passwords do not match',
    'Potvrda lozinke je obavezna': 'The password confirmation is required',
    'Trenutna lozinka je obavezna': 'The current password is required',
    'Lozinka je obavezna': 'The password is required',
    'Nova lozinka je obavezna': 'The new password is required',
    'Lozinka mora imati: VELIKA SLOVA, mala slova, broj, poseban karakter (!@#$%^&*)':
      'The password must have: UPPERCASE letters, lowercase letters, a digit, a special character (!@#$%^&*)',

    // --- Sesija i pristup ---
    'Nevazeci ili istekao token': 'Invalid or expired token',
    'Ova akcija zahteva prijavu': 'This action requires logging in',
    'Cuvanje putovanja zahteva prijavu': 'Saving a trip requires logging in',
    'Samo administratori mogu da pristupe ovom resursu': 'Only administrators can access this resource',
    'Plan pripada drugom korisniku': 'The plan belongs to another user',

    // --- Planiranje (Orchestrator, Planner) ---
    'Zahtev nije ispravan': 'The request is not valid',
    'Planner Service trenutno nije dostupan': 'The planning service is currently unavailable',
    'Trip Service trenutno nije dostupan': 'The trip service is currently unavailable',
    'Ciljni servis trenutno nije dostupan': 'The target service is currently unavailable',
    'Prikazani su demonstracioni podaci': 'Demo data is shown',
    'Provera rezervacije trenutno nije dostupna': 'The booking check is currently unavailable',
    'Putovanje nije sačuvano — pokušajte ponovo': 'The trip was not saved — please try again',
    'Sesija nema plan koji bi mogao da se sacuva': 'The session has no plan that could be saved',
    'Sesija nije pronadjena ili je istekla': 'The session was not found or has expired',
    'Izabrani let više nije dostupan — izaberite ponovo':
      'The selected flight is no longer available — please choose again',
    'Izabrani smeštaj više nije dostupan — izaberite ponovo':
      'The selected accommodation is no longer available — please choose again',
    'Izabrani let trenutno ne može da se proveri — pokušajte ponovo':
      'The selected flight cannot be checked at the moment — please try again',
    'checkIn je obavezan': 'The departure date is required',
    'checkOut je obavezan': 'The return date is required',
    'checkIn mora biti validan datum': 'The departure date must be a valid date',
    'checkOut mora biti validan datum': 'The return date must be a valid date',
    'checkIn ne sme biti u proslosti': 'The departure date cannot be in the past',
    'checkOut mora biti posle checkIn-a': 'The return date must be after the departure date',
    'passengers mora biti ceo broj najmanje 1': 'The number of travellers must be a whole number of at least 1',
    'budget mora biti broj veci od 0': 'The budget must be a number greater than 0',
    'polaziste i odrediste moraju biti razliciti': 'The origin and destination must be different',
    'from i to moraju biti razliciti': 'The origin and destination must be different',
    'dayEnd mora biti posle dayStart': 'The end of the day must be after its start',
    'dayStart mora biti u obliku HH:MM': 'The start of the day must be in the HH:MM format',
    'dayEnd mora biti u obliku HH:MM': 'The end of the day must be in the HH:MM format',
    'minAccommodationRating mora biti broj izmedju 1 i 5, ili null':
      'The minimum rating must be a number between 1 and 5, or empty',
    'Nema više atrakcija koje odgovaraju izabranom tempu i interesovanjima':
      'There are no more attractions matching the selected pace and interests',
    'Nema dovoljno vremena za aktivnosti': 'There is not enough time for activities',
    'Nijedna atrakcija ne odgovara izabranim interesovanjima':
      'No attraction matches the selected interests',
    'Za ovu rutu i datume nije pronađen nijedan let': 'No flight was found for this route and dates',
    'Za ovaj grad i datume nije pronađen nijedan smeštaj':
      'No accommodation was found for this city and dates',
    'Let je potrošio ceo budžet — preporučen je najjeftiniji smeštaj':
      'The flight used up the whole budget — the cheapest accommodation is recommended',
    'zatvoreno u vreme dolaska': 'closed at the time of arrival',
    'nema dovoljno vremena u danu': 'not enough time in the day',
    'uklonjena da bi se oslobodilo vreme za drugu atrakciju':
      'removed to free up time for another attraction',

    // --- Putovanja i rezervacije ---
    'Putovanje nije pronadjeno': 'The trip was not found',
    'Putovanje nije pronađeno': 'The trip was not found',
    'Neispravan format ID-a putovanja': 'Invalid trip ID format',
    'Let za ovo putovanje je vec rezervisan': 'The flight for this trip is already booked',
    'Rezervacija nije pronadjena': 'The booking was not found',
    'Nemate pristup ovoj rezervaciji': 'You do not have access to this booking',
    'Podaci o putnicima nisu ispravni': 'The passenger details are not valid',
    'Potvrda postoji tek za potvrdjenu rezervaciju': 'A confirmation exists only for a confirmed booking',
    'Ponuda vise ne vazi - potrebno je ponovo generisati plan':
      'The offer is no longer valid - the plan needs to be generated again',
    'Ponuda vise ne vazi - potrebno je ponovo izabrati let':
      'The offer is no longer valid - the flight needs to be chosen again',

    // --- Administracija ---
    'Ne mozete blokirati poslednjeg aktivnog administratora':
      'You cannot block the last active administrator',
    'Ne mozete obrisati poslednjeg administratora': 'You cannot delete the last administrator',
    'Ne mozete obrisati sopstveni nalog': 'You cannot delete your own account',
    'Ne mozete oduzeti ulogu poslednjem administratoru':
      'You cannot remove the role from the last administrator',
    'Ne mozete sami sebi oduzeti admin ulogu': 'You cannot remove the admin role from yourself',
    'Ne mozete sami sebi promeniti status u neaktivan': 'You cannot change your own status to inactive',
    'Atrakcija nije ispravna': 'The attraction is not valid',
    'Atrakcija nije pronadjena': 'The attraction was not found',
    'Kategorija nije ispravna': 'The category is not valid',
    'Kategorija nije pronadjena': 'The category was not found',
    'Destinacija nije pronadjena': 'The destination was not found',
    'Grad nije pronađen': 'The city was not found',
    'naziv je obavezan': 'the name is required',
    'gradId je obavezan': 'the city is required',
    'lat i lon moraju biti brojevi': 'latitude and longitude must be numbers',
    'izaberite bar jednu kategoriju': 'choose at least one category',
    'cenaUlaznice ne moze biti negativna': 'the ticket price cannot be negative',
    'trajanjeMin mora biti broj izmedju 15 i 600': 'the duration must be a number between 15 and 600',
    'trajanjePoseteMin mora biti broj izmedju 15 i 600':
      'the visit duration must be a number between 15 and 600',
    'radnoVreme.open i radnoVreme.close moraju biti u obliku HH:MM':
      'opening hours must be in the HH:MM format',
    'radnoVreme.open i radnoVreme.close ne smeju biti isti':
      'the opening and closing times must not be the same',
    'slika.url mora da pocinje sa https://': 'the image URL must start with https://',
    'uz sliku je obavezan potpis izvora': 'an image requires a source credit',
    'kljuc sme da ima samo mala slova i donju crtu (3-30 znakova)':
      'the key may contain only lowercase letters and underscores (3-30 characters)'
  },

  obrasci: [
    // Planer: upozorenja sa iznosom, brojem i nazivom
    [
      /^Plan premasuje budzet za (.+) EUR - ponude nisu odsecene, izaberi jeftiniju varijantu ako zelis$/,
      'The plan exceeds the budget by $1 EUR - no offers were removed, choose a cheaper option if you like'
    ],
    [
      /^Za vise od (\d+) putnika let se rezervise u vise delova$/,
      'For more than $1 travellers the flight is booked in several parts'
    ],
    [
      /^Pronađeno je (\d+) atrakcija, a izabrani tempo traži (\d+)\. (\d+) (?:dan je ostavljen|dana je ostavljeno) slobodno — dodajte interesovanja ili izaberite opušteniji tempo$/,
      '$1 attractions were found, and the selected pace needs $2. $3 day(s) left free — add interests or choose a more relaxed pace'
    ],
    [
      /^(\S+) tempo: u pojedine dane stalo je manje aktivnosti zbog trajanja poseta$/,
      '$1 pace: fewer activities fit into some days because of visit durations'
    ],
    [
      /^Let ide do aerodroma (\w{3})(?: \((.+)\))?, (\d+) km od grada (.+) — procenjen transfer (.+), uračunat u prvi i poslednji dan$/,
      'The flight goes to $1 airport, $3 km from $4 — estimated transfer $5, included in the first and last day'
    ],
    [
      /^Za (.+) trenutno nema dostupnih atrakcija — dani su zato prazni$/,
      'There are no attractions available for $1 at the moment — the days are therefore empty'
    ],
    [
      /^Nijedan smeštaj ne staje u preostali budžet \((\d+) EUR\) — preporučen je najjeftiniji$/,
      'No accommodation fits into the remaining budget ($1 EUR) — the cheapest one is recommended'
    ],
    // Satnica dana (Planner, Dani.js)
    [
      /^Dan počinje po sletanju u (\d{2}:\d{2}), uz (\d+) km do grada — procenjen transfer (.+)$/,
      'The day starts after landing at $1, with $2 km to the city — estimated transfer $3'
    ],
    [
      /^Dan počinje po sletanju u (\d{2}:\d{2}) i (\d+) min za transfer i prijavu u smeštaj$/,
      'The day starts after landing at $1 and $2 min for the transfer and check-in'
    ],
    [
      /^Dan se završava (.+) pre poletanja u (\d{2}:\d{2}) \(uključen put od (\d+) km do aerodroma\)$/,
      'The day ends $1 before take-off at $2 (including $3 km to the airport)'
    ],
    [/^Dan se završava (\d+) min pre poletanja u (\d{2}:\d{2})$/, 'The day ends $1 min before take-off at $2'],
    [/^(.+) — nema dovoljno vremena za aktivnosti$/, '$1 — not enough time for activities'],
    // Validacija i pretraga
    [/^Putovanje moze trajati najvise (\d+) dana \(trazeno (\d+)\)$/, 'A trip can last at most $1 days ($2 requested)'],
    [/^Lozinka mora imati najmanje (\d+) karaktera$/, 'The password must have at least $1 characters'],
    [/^Nova lozinka mora imati najmanje (\d+) karaktera$/, 'The new password must have at least $1 characters'],
    [/^Grad (.+) ne postoji$/, 'City $1 does not exist'],
    [/^Za (.+) nema aerodroma u krugu od 150 km — plan se može napraviti bez leta$/, 'There is no airport within 150 km of $1 — the plan can be made without a flight'],
    [/^Kategorija "(.+)" vec postoji$/, 'Category "$1" already exists'],
    [/^Razlog moze imati najvise (\d+) znakova$/, 'The reason may have at most $1 characters'],
    [/^Previse pogresnih pokusaja\. Pokusajte ponovo za (\d+) s$/, 'Too many failed attempts. Try again in $1 s'],
    // Podaci o putniku (Booking Service): „Putnik 1: ..."
    [/^Putnik (\d+): ime je obavezno$/, 'Passenger $1: the first name is required'],
    [/^Putnik (\d+): prezime je obavezno$/, 'Passenger $1: the last name is required'],
    [/^Putnik (\d+): titula je obavezna$/, 'Passenger $1: the title is required'],
    [/^Putnik (\d+): pol je obavezan$/, 'Passenger $1: the gender is required'],
    [/^Putnik (\d+): email je obavezan$/, 'Passenger $1: the email is required'],
    [/^Putnik (\d+): telefon je obavezan$/, 'Passenger $1: the phone is required'],
    [/^Putnik (\d+): datum rođenja je obavezan$/, 'Passenger $1: the date of birth is required'],
    [/^Putnik (\d+): datum rođenja mora biti u prošlosti$/, 'Passenger $1: the date of birth must be in the past'],
    [/^Putnik (\d+): email nije ispravan$/, 'Passenger $1: the email is not valid'],
    [/^Putnik (\d+): telefon mora biti u obliku \+381641234567$/, 'Passenger $1: the phone must be in the format +381641234567']
  ]
};
