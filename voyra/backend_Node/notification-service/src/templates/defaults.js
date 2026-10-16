/**
 * Podrazumevani sabloni. Pri pokretanju se upisuju u bazu ako ne postoje,
 * pa se posle mogu menjati u bazi bez ponovnog deploy-a.
 */
module.exports = [
  {
    name: 'booking-confirmed',
    type: 'email',
    subject: 'Potvrda rezervacije {{bookingId}}',
    bodyTemplate: `Postovani {{firstName}},

Vasa rezervacija je potvrdjena!

Booking ID: {{bookingId}}
PNR: {{pnr}}
Putnici: {{passengersCount}}
Ukupno: {{total}}

Detaljne informacije se nalaze u prilogu.

---
VOYRA Travel Planning`,
    variables: ['firstName', 'bookingId', 'pnr', 'passengersCount', 'total']
  },
  {
    name: 'booking-failed',
    type: 'email',
    subject: 'Rezervacija {{bookingId}} nije uspela',
    bodyTemplate: `Postovani {{firstName}},

Nazalost, rezervacija {{bookingId}} nije mogla da bude izvrsena.

Razlog: {{reason}}

Ako je iznos naplacen, bice vracen u roku od 3-5 radnih dana.

---
VOYRA Travel Planning`,
    variables: ['firstName', 'bookingId', 'reason']
  },
  {
    name: 'booking-cancelled',
    type: 'email',
    subject: 'Otkazana rezervacija {{bookingId}}',
    bodyTemplate: `Postovani {{firstName}},

Rezervacija {{bookingId}} je otkazana.

Iznos za povracaj: {{refundAmount}}
Status povracaja: {{refundStatus}}

Obrada traje 3-5 radnih dana.

---
VOYRA Travel Planning`,
    variables: ['firstName', 'bookingId', 'refundAmount', 'refundStatus']
  },
  {
    name: 'trip-saved',
    type: 'email',
    subject: 'Sacuvano putovanje: {{title}}',
    bodyTemplate: `Postovani {{firstName}},

Vase putovanje "{{title}}" je sacuvano.

Odrediste: {{destination}}
Datum: {{startDate}}
Trajanje: {{days}} dana

Plan mozete pogledati na: {{link}}

---
VOYRA Travel Planning`,
    variables: ['firstName', 'title', 'destination', 'startDate', 'days', 'link']
  },
  {
    name: 'trip-deleted',
    type: 'email',
    subject: 'Obrisano putovanje: {{title}}',
    bodyTemplate: `Postovani {{firstName}},

Putovanje "{{title}}" je obrisano iz Vaseg naloga.

Ako ovo niste uradili Vi, kontaktirajte podrsku.

---
VOYRA Travel Planning`,
    variables: ['firstName', 'title']
  },
  /*
   * Odluka administratora o nalogu (spec §3.3, §4.10). Korisnik dobija
   * poruku i kada je zahtev odobren i kada je odbijen - specifikacija to
   * trazi izricito, jer bi inace ostao bez ikakve povratne informacije.
   */
  {
    name: 'registration-approved',
    type: 'email',
    subject: 'Vas nalog na Voyri je odobren',
    bodyTemplate: `Postovani {{firstName}},

Vas zahtev za registraciju je odobren. Nalog je aktivan i mozete se
prijaviti korisnickim imenom {{username}}.

Prijava: {{link}}

---
VOYRA Travel Planning`,
    variables: ['firstName', 'username', 'link']
  },
  {
    name: 'registration-rejected',
    type: 'email',
    subject: 'Vas zahtev za registraciju nije odobren',
    bodyTemplate: `Postovani {{firstName}},

Vas zahtev za registraciju na Voyri nije odobren.

Razlog: {{reason}}

Ako mislite da je rec o gresci, odgovorite na ovu poruku.

---
VOYRA Travel Planning`,
    variables: ['firstName', 'reason']
  },
  {
    name: 'account-blocked',
    type: 'email',
    subject: 'Vas nalog je blokiran',
    bodyTemplate: `Postovani {{firstName}},

Vas nalog na Voyri je blokiran, pa prijava trenutno nije moguca.

Razlog: {{reason}}

Za dodatna objasnjenja odgovorite na ovu poruku.

---
VOYRA Travel Planning`,
    variables: ['firstName', 'reason']
  },
  {
    name: 'account-unblocked',
    type: 'email',
    subject: 'Vas nalog je ponovo aktivan',
    bodyTemplate: `Postovani {{firstName}},

Vas nalog na Voyri je odblokiran i ponovo mozete da se prijavite.

Prijava: {{link}}

---
VOYRA Travel Planning`,
    variables: ['firstName', 'link']
  },
  {
    name: 'password-changed',
    type: 'email',
    subject: 'Lozinka vaseg naloga je promenjena',
    bodyTemplate: `Postovani {{firstName}},

Lozinka vaseg naloga je promenjena.

Ako to niste bili vi, javite se administratoru - svi raniji prijavljeni
uredjaji su odjavljeni, ali nalog treba proveriti.

---
VOYRA Travel Planning`,
    variables: ['firstName']
  },
  {
    name: 'admin-action',
    type: 'email',
    subject: 'Obavestenje o promeni na nalogu',
    bodyTemplate: `Postovani {{firstName}},

Administrator je izvrsio promenu na Vasem nalogu.

Akcija: {{action}}
Razlog: {{reason}}

Za pitanja kontaktirajte podrsku.

---
VOYRA Travel Planning`,
    variables: ['firstName', 'action', 'reason']
  }
];
