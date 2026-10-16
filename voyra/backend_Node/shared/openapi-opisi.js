/**
 * OPISI RUTA ZA OPENAPI SEME.
 *
 * Kljuc je `METOD /putanja` u OpenAPI zapisu (`{id}`, ne `:id`). Isti
 * opis koristi i API Gateway i servis koji rutu zaista drzi - gateway
 * vecinu ruta samo prosledjuje, pa bi dva odvojena teksta neminovno
 * otisla u stranu.
 *
 * Svaki unos ima bar `summary`. `tags` grupisu rute u Swagger UI, a
 * `zasticeno` oznacava sta trazi JWT.
 */

/** Rute koje postoje na vise servisa - opis se deli. */
const OPISI = {
  // ---------------- Zdravlje i pocetna ----------------
  'GET /': { summary: 'Spisak ruta servisa', tags: ['Servis'] },
  'GET /health': { summary: 'Provera da servis radi', tags: ['Servis'] },

  // ---------------- Nalozi (§4.10) ----------------
  'POST /api/users/register': {
    summary: 'Registracija korisnika',
    description:
      'Nalog se otvara u statusu `na_cekanju` i ceka odluku administratora. ' +
      'Lozinka mora imati najmanje 8 znakova, veliko i malo slovo, broj i poseban znak.',
    tags: ['Nalozi']
  },
  'POST /api/users/login': {
    summary: 'Prijava korisnickim imenom i lozinkom',
    description:
      'Vraca JWT koji vazi 24 h. Pet neuspesnih pokusaja u 15 minuta po paru ' +
      '(korisnicko ime, IP) daje `429`. Poruka je ista za nepostojeceg korisnika ' +
      'i pogresnu lozinku, da se ne otkriva koji nalozi postoje.',
    tags: ['Nalozi']
  },
  'GET /api/users/profile': { summary: 'Podaci prijavljenog korisnika', tags: ['Nalozi'], zasticeno: true },
  'GET /api/users/me': { summary: 'Profil prijavljenog korisnika', tags: ['Profil'], zasticeno: true },
  'PUT /api/users/me': {
    summary: 'Izmena licnih podataka',
    description: 'Nov ili izmenjen broj telefona gubi potvrdu i dobija nov kod SMS-om.',
    tags: ['Profil'],
    zasticeno: true
  },
  'PUT /api/users/me/password': {
    summary: 'Promena lozinke',
    description:
      'Trenutna lozinka mora biti tacna (`400 WRONG_PASSWORD`), a nova razlicita ' +
      'od nje (`400 SAME_PASSWORD`) i po istim pravilima kao pri registraciji. ' +
      'Uspeh ponistava SVE ranije tokene i vraca nov token za ovu sesiju.',
    tags: ['Profil'],
    zasticeno: true
  },
  'PATCH /api/users/me/sms-preference': { summary: 'Ukljucivanje i iskljucivanje SMS obavestenja', tags: ['Profil'], zasticeno: true },

  // Stare skracenice bez prefiksa - zadrzane zbog ranijih klijenata
  'POST /register': { summary: 'Registracija (stara putanja, bez `/api/users`)', tags: ['Nalozi'] },
  'POST /login': { summary: 'Prijava (stara putanja, bez `/api/users`)', tags: ['Nalozi'] },
  'GET /profile': { summary: 'Profil (stara putanja, bez `/api/users`)', tags: ['Nalozi'], zasticeno: true },

  // ---------------- Interno: korisnici ----------------
  'GET /api/users/all': { summary: 'Svi korisnici', tags: ['Interno'], interno: true },
  'PATCH /api/users/{id}/status': { summary: 'Promena statusa naloga', tags: ['Interno'], interno: true },
  'PATCH /api/users/{id}/role': { summary: 'Promena uloge naloga', tags: ['Interno'], interno: true },
  'DELETE /api/users/{id}': { summary: 'Brisanje naloga', tags: ['Interno'], interno: true },
  'GET /api/users/internal/{id}': { summary: 'Podaci korisnika za slanje obavestenja', tags: ['Interno'], interno: true },
  'GET /api/users/internal/{id}/token-version': {
    summary: 'Trenutna verzija tokena korisnika',
    description:
      'Gateway je poredi sa claim-om `tv` iz tokena i odbija zahtev kada se ne poklapaju.',
    tags: ['Interno'],
    interno: true
  },

  // ---------------- Putovanja (§4.9) ----------------
  'GET /api/trips': { summary: 'Sacuvana putovanja prijavljenog korisnika', tags: ['Putovanja'], zasticeno: true },
  'POST /api/trips': { summary: 'Cuvanje putovanja', tags: ['Putovanja'], zasticeno: true },
  'GET /api/trips/{id}': { summary: 'Jedno putovanje', tags: ['Putovanja'], zasticeno: true },
  'PUT /api/trips/{id}': { summary: 'Izmena naslova i opisa putovanja', tags: ['Putovanja'], zasticeno: true },
  'DELETE /api/trips/{id}': { summary: 'Brisanje putovanja', tags: ['Putovanja'], zasticeno: true },
  'PATCH /api/trips/{id}/cancel': { summary: 'Otkazivanje putovanja', tags: ['Putovanja'], zasticeno: true },
  'POST /api/trips/plan': { summary: 'Planiranje (stara ruta; novi tok ide na `/v1/plan`)', tags: ['Putovanja'] },
  'GET /api/trips/all': { summary: 'Sva putovanja u sistemu', tags: ['Interno'], interno: true },

  // ---------------- Rezervacija leta (§4.8) ----------------
  'POST /api/bookings/validate': { summary: 'Provera ponude pre rezervacije', tags: ['Rezervacija'], zasticeno: true },
  'POST /api/bookings': { summary: 'Rezervacija leta', tags: ['Rezervacija'], zasticeno: true },
  'GET /api/bookings': { summary: 'Rezervacije prijavljenog korisnika', tags: ['Rezervacija'], zasticeno: true },
  'GET /api/bookings/{id}': { summary: 'Jedna rezervacija', tags: ['Rezervacija'], zasticeno: true },
  'GET /api/bookings/{id}/confirmation': { summary: 'Potvrda rezervacije u PDF-u', tags: ['Rezervacija'], zasticeno: true },
  'PATCH /api/bookings/{id}/cancel': { summary: 'Otkazivanje rezervacije', tags: ['Rezervacija'], zasticeno: true },

  // ---------------- Obavestenja ----------------
  'POST /api/notifications/send': { summary: 'Slanje obavestenja', tags: ['Interno'], interno: true },
  'GET /api/notifications': { summary: 'Obavestenja prijavljenog korisnika', tags: ['Obavestenja'], zasticeno: true },
  'GET /api/notifications/stats': { summary: 'Brojke o obavestenjima korisnika', tags: ['Obavestenja'], zasticeno: true },
  'GET /api/notifications/{id}': { summary: 'Jedno obavestenje', tags: ['Obavestenja'], zasticeno: true },
  'POST /api/notifications/{id}/retry': { summary: 'Ponovni pokusaj slanja', tags: ['Obavestenja'], zasticeno: true },
  'PATCH /api/notifications/{id}/cancel': { summary: 'Otkazivanje zakazanog obavestenja', tags: ['Obavestenja'], zasticeno: true },
  'GET /api/admin/notifications': { summary: 'Sva obavestenja u sistemu', tags: ['Administracija'], zasticeno: true },
  'GET /api/admin/notifications/stats': { summary: 'Brojke o svim obavestenjima', tags: ['Administracija'], zasticeno: true },

  // ---------------- Administracija (§3.3) ----------------
  'GET /api/admin/users': { summary: 'Svi korisnici', tags: ['Administracija'], zasticeno: true },
  'PATCH /api/admin/users/{userId}/status': {
    summary: 'Odluka o nalogu (odobravanje, odbijanje, blokiranje)',
    description:
      'Telo prima i opcion `reason` (do 500 znakova), koji ide u e-poruku korisniku ' +
      'i u revizioni zapis. Dozvoljeni su samo definisani prelazi statusa; ostalo je `409`.',
    tags: ['Administracija'],
    zasticeno: true
  },
  'PATCH /api/admin/users/{userId}/role': { summary: 'Promena uloge korisnika', tags: ['Administracija'], zasticeno: true },
  'DELETE /api/admin/users/{userId}': { summary: 'Brisanje naloga', tags: ['Administracija'], zasticeno: true },
  'GET /api/admin/stats': { summary: 'Statistika sistema', tags: ['Administracija'], zasticeno: true },
  'GET /api/admin/logs': { summary: 'Revizioni zapisi', tags: ['Administracija'], zasticeno: true },
  'GET /api/admin/logs/statistics': { summary: 'Brojke o revizionim zapisima', tags: ['Administracija'], zasticeno: true },
  'POST /api/admin/internal/audit': { summary: 'Upis revizionog zapisa iz drugog servisa', tags: ['Interno'], interno: true },

  'GET /api/admin/categories': { summary: 'Kategorije interesovanja', tags: ['Administracija'], zasticeno: true },
  'POST /api/admin/categories': { summary: 'Nova kategorija interesovanja', tags: ['Administracija'], zasticeno: true },
  'GET /api/admin/categories/{kljuc}': { summary: 'Jedna kategorija, sa brojem putovanja koja je koriste', tags: ['Administracija'], zasticeno: true },
  'PATCH /api/admin/categories/{kljuc}': { summary: 'Izmena kategorije (kljuc se ne menja)', tags: ['Administracija'], zasticeno: true },
  'DELETE /api/admin/categories/{kljuc}': { summary: 'Gasenje kategorije (meko brisanje)', tags: ['Administracija'], zasticeno: true },

  'GET /api/admin/attractions': { summary: 'Atrakcije administratora za grad', tags: ['Administracija'], zasticeno: true },
  'POST /api/admin/attractions': {
    summary: 'Nova atrakcija administratora',
    description: 'Koordinate moraju biti u krugu od 50 km od centra izabranog grada.',
    tags: ['Administracija'],
    zasticeno: true
  },
  'GET /api/admin/attractions/{id}': { summary: 'Jedna atrakcija', tags: ['Administracija'], zasticeno: true },
  'PATCH /api/admin/attractions/{id}': { summary: 'Izmena atrakcije', tags: ['Administracija'], zasticeno: true },
  'DELETE /api/admin/attractions/{id}': { summary: 'Gasenje atrakcije (meko brisanje)', tags: ['Administracija'], zasticeno: true },

  'GET /api/admin/destinations': { summary: 'Istaknute destinacije', tags: ['Administracija'], zasticeno: true },
  'POST /api/admin/destinations': { summary: 'Nova istaknuta destinacija', tags: ['Administracija'], zasticeno: true },
  'PATCH /api/admin/destinations/order': { summary: 'Novi redosled destinacija', tags: ['Administracija'], zasticeno: true },
  'PATCH /api/admin/destinations/{id}': { summary: 'Izmena destinacije', tags: ['Administracija'], zasticeno: true },
  'DELETE /api/admin/destinations/{id}': { summary: 'Uklanjanje destinacije', tags: ['Administracija'], zasticeno: true },

  // ---------------- Jedinstveni /v1 API ----------------
  'GET /v1/preferences/schema': { summary: 'Dozvoljene vrednosti preferencija i nazivi kategorija', tags: ['Planiranje'] },
  'GET /v1/flights': { summary: 'Rangirane ponude letova (korak 2)', tags: ['Planiranje'] },
  'GET /v1/accommodations': { summary: 'Rangirane ponude smestaja (korak 3)', tags: ['Planiranje'] },
  'GET /v1/attractions': { summary: 'Atrakcije za odrediste, sa ocenom', tags: ['Planiranje'] },
  'POST /v1/plan': {
    summary: 'Pravljenje plana putovanja',
    description:
      'Pet faza algoritma (§6). Zaglavlje `X-Save-Trip: true` cuva putovanje ' +
      '(zahteva prijavu), a `X-Trip-ID` azurira postojece.',
    tags: ['Planiranje']
  },
  'GET /v1/plan/{sessionId}': { summary: 'Ranije napravljen plan (vazi 24 h)', tags: ['Planiranje'] },
  'POST /v1/plan/{sessionId}/save': { summary: 'Cuvanje tacno onog plana koji je korisnik video', tags: ['Planiranje'], zasticeno: true },
  'GET /v1/trips/{id}': { summary: 'Sacuvano putovanje sa verzijom za izmenu', tags: ['Izmena plana'], zasticeno: true },
  'POST /v1/trips/{id}/days/preview': { summary: 'Nova vremena posle izmene, bez cuvanja', tags: ['Izmena plana'], zasticeno: true },
  'PUT /v1/trips/{id}/days': { summary: 'Cuvanje izmenjenog plana, uz proveru verzije', tags: ['Izmena plana'], zasticeno: true },
  'POST /v1/trips/{id}/days/{day}/optimize': { summary: 'Optimizacija redosleda obilaska za jedan dan', tags: ['Izmena plana'], zasticeno: true },
  'POST /v1/trips/{id}/regenerate': { summary: 'Ponovno pravljenje plana za isto putovanje', tags: ['Izmena plana'], zasticeno: true },
  'POST /v1/trips/{id}/flight/refresh': { summary: 'Osvezavanje istekle ponude leta', tags: ['Izmena plana'], zasticeno: true },
  'PUT /v1/trips/{id}/flight': { summary: 'Zamena izabranog leta', tags: ['Izmena plana'], zasticeno: true },
  'GET /v1/cities': { summary: 'Pretraga gradova dok korisnik kuca', tags: ['Gradovi'] },
  'GET /v1/cities/by-iata/{kod}': { summary: 'Grad kome pripada IATA kod', tags: ['Gradovi'] },
  'GET /v1/cities/{id}': { summary: 'Jedan grad sa aerodromima', tags: ['Gradovi'] },
  'GET /v1/destinations/featured': { summary: 'Istaknute destinacije za pocetnu stranu', tags: ['Destinacije'] },
  'GET /v1/destinations/popular': { summary: 'Popularne destinacije poslednjih 30 dana', tags: ['Destinacije'] },
  'GET /v1/health': { summary: 'Stanje svih servisa', tags: ['Servis'] },
  'GET /v1/stats': { summary: 'Statistika planiranja', tags: ['Administracija'], zasticeno: true },

  // ---------------- Interne rute Trip Service-a ----------------
  'PATCH /internal/trips/{id}/status': { summary: 'Promena statusa putovanja', tags: ['Interno'], interno: true },
  'POST /internal/search-stats': { summary: 'Belezenje pretrage ili sacuvanog plana po gradu', tags: ['Interno'], interno: true },
  'GET /internal/categories': { summary: 'Kategorije interesovanja za Planner', tags: ['Interno'], interno: true },
  'GET /internal/categories/{kljuc}': { summary: 'Jedna kategorija', tags: ['Interno'], interno: true },
  'POST /internal/categories': { summary: 'Nova kategorija', tags: ['Interno'], interno: true },
  'PATCH /internal/categories/{kljuc}': { summary: 'Izmena kategorije', tags: ['Interno'], interno: true },
  'DELETE /internal/categories/{kljuc}': { summary: 'Gasenje kategorije', tags: ['Interno'], interno: true },
  'GET /internal/attractions': { summary: 'Atrakcije administratora za grad', tags: ['Interno'], interno: true },
  'GET /internal/attractions/planner': { summary: 'Atrakcije u obliku koji Planner ocekuje', tags: ['Interno'], interno: true },
  'GET /internal/attractions/{id}': { summary: 'Jedna atrakcija', tags: ['Interno'], interno: true },
  'POST /internal/attractions': { summary: 'Nova atrakcija', tags: ['Interno'], interno: true },
  'PATCH /internal/attractions/{id}': { summary: 'Izmena atrakcije', tags: ['Interno'], interno: true },
  'DELETE /internal/attractions/{id}': { summary: 'Gasenje atrakcije', tags: ['Interno'], interno: true },
  'GET /internal/destinations': { summary: 'Istaknute destinacije', tags: ['Interno'], interno: true },
  'GET /internal/destinations/popular': { summary: 'Popularne destinacije', tags: ['Interno'], interno: true },
  'POST /internal/destinations': { summary: 'Nova destinacija', tags: ['Interno'], interno: true },
  'PATCH /internal/destinations/order': { summary: 'Novi redosled destinacija', tags: ['Interno'], interno: true },
  'PATCH /internal/destinations/{id}': { summary: 'Izmena destinacije', tags: ['Interno'], interno: true },
  'DELETE /internal/destinations/{id}': { summary: 'Brisanje destinacije', tags: ['Interno'], interno: true },

  // ---------------- Gradovi u Trip Service-u ----------------
  'GET /api/cities': { summary: 'Pretraga gradova nad sopstvenom bazom', tags: ['Gradovi'] },
  'GET /api/cities/by-iata/{kod}': { summary: 'Grad kome pripada IATA kod', tags: ['Gradovi'] },
  'GET /api/cities/{id}': { summary: 'Jedan grad sa aerodromima', tags: ['Gradovi'] },

  // ---------------- Integration Service (spoljni izvori) ----------------
  'GET /flights': { summary: 'Ponude letova od spoljnog izvora', tags: ['Izvori'] },
  'GET /accommodations': { summary: 'Ponude smestaja od spoljnog izvora', tags: ['Izvori'] },
  'GET /attractions': { summary: 'Atrakcije od spoljnog izvora', tags: ['Izvori'] },
  'GET /attractions/details': { summary: 'Opis i slika za izabrane atrakcije', tags: ['Izvori'] },
  'GET /exchange': { summary: 'Kursna lista', tags: ['Izvori'] },
  'GET /geocode': { summary: 'Koordinate mesta po nazivu', tags: ['Izvori'] },
  'GET /cache/stats': { summary: 'Stanje kesa spoljnih poziva', tags: ['Izvori'] },
  'DELETE /cache': { summary: 'Praznjenje kesa', tags: ['Izvori'] },

  // Integration Service ima iste rute i pod `/api/integration` prefiksom,
  // jer ga stariji pozivi jos tako zovu
  'GET /api/integration/flights': { summary: 'Ponude letova od spoljnog izvora', tags: ['Izvori'] },
  'GET /api/integration/accommodations': { summary: 'Ponude smestaja od spoljnog izvora', tags: ['Izvori'] },
  'GET /api/integration/attractions': { summary: 'Atrakcije od spoljnog izvora', tags: ['Izvori'] },
  'POST /api/integration/attractions/details': { summary: 'Opis i slika za izabrane atrakcije', tags: ['Izvori'] },
  'POST /attractions/details': { summary: 'Opis i slika za izabrane atrakcije', tags: ['Izvori'] },
  'GET /api/integration/exchange-rates': { summary: 'Kursna lista', tags: ['Izvori'] },
  'GET /exchange-rates': { summary: 'Kursna lista', tags: ['Izvori'] },
  'GET /api/integration/geocode': { summary: 'Koordinate mesta po nazivu', tags: ['Izvori'] },
  'POST /api/integration/cache/clear': { summary: 'Praznjenje kesa spoljnih poziva', tags: ['Izvori'] },
  'POST /cache/clear': { summary: 'Praznjenje kesa spoljnih poziva', tags: ['Izvori'] },

  'GET /internal/flights/offers/{offerId}': {
    summary: 'Sveza provera ponude leta pred rezervaciju',
    tags: ['Interno'],
    interno: true
  },
  'GET /internal/flights/selected/{offerId}': {
    summary: 'Ponuda leta izabrana u koraku 2 (iz kesa pretrage ili od prevoznika)',
    tags: ['Interno'],
    interno: true
  },
  'GET /api/integration/internal/flights/selected/{offerId}': {
    summary: 'Ponuda leta izabrana u koraku 2 (iz kesa pretrage ili od prevoznika)',
    tags: ['Interno'],
    interno: true
  },
  'POST /internal/flights/orders': { summary: 'Rezervacija leta kod prevoznika', tags: ['Interno'], interno: true },
  'POST /internal/flights/orders/{orderId}/cancel': { summary: 'Otkazivanje rezervacije kod prevoznika', tags: ['Interno'], interno: true },
  'GET /api/integration/internal/flights/offers/{offerId}': {
    summary: 'Sveza provera ponude leta pred rezervaciju',
    tags: ['Interno'],
    interno: true
  },
  'POST /api/integration/internal/flights/orders': { summary: 'Rezervacija leta kod prevoznika', tags: ['Interno'], interno: true },
  'POST /api/integration/internal/flights/orders/{orderId}/cancel': {
    summary: 'Otkazivanje rezervacije kod prevoznika',
    tags: ['Interno'],
    interno: true
  },

  // ---------------- Planner Service (algoritam) ----------------
  'GET /api/planner/preferences/schema': { summary: 'Dozvoljene vrednosti preferencija', tags: ['Algoritam'] },
  'POST /api/planner/flights': { summary: 'Faza 1 - rangiranje letova', tags: ['Algoritam'] },
  'POST /api/planner/accommodations': { summary: 'Faza 2 - rangiranje smestaja', tags: ['Algoritam'] },
  'POST /api/planner/attractions': { summary: 'Faza 3 - ocena atrakcija', tags: ['Algoritam'] },
  'POST /api/planner/attractions/details': { summary: 'Opis i slika za izabrane atrakcije', tags: ['Algoritam'] },
  'POST /api/planner/plan': { summary: 'Svih pet faza - ceo plan', tags: ['Algoritam'] },
  'POST /api/planner/replan': { summary: 'Ponovno pravljenje plana za isti let i smestaj', tags: ['Algoritam'] },
  'POST /api/planner/trip-days': { summary: 'Prozori dana za zadat let', tags: ['Algoritam'] },
  'POST /api/planner/day/schedule': { summary: 'Satnica jednog dana', tags: ['Algoritam'] },
  'POST /api/planner/day/optimize': { summary: 'Optimizacija redosleda u danu (2-opt)', tags: ['Algoritam'] },
  'POST /api/planner/attraction-details': { summary: 'Opis i slika za izabrane atrakcije', tags: ['Algoritam'] },
  'POST /api/planner/schedule-day': { summary: 'Satnica jednog dana (starija putanja)', tags: ['Algoritam'] },
  'POST /api/planner/optimize-day': { summary: 'Optimizacija redosleda u danu (starija putanja)', tags: ['Algoritam'] },

  // Planner isti spisak izlaze i bez prefiksa `/api/planner`
  'GET /preferences/schema': { summary: 'Dozvoljene vrednosti preferencija', tags: ['Algoritam'] },
  'POST /flights': { summary: 'Faza 1 - rangiranje letova', tags: ['Algoritam'] },
  'POST /accommodations': { summary: 'Faza 2 - rangiranje smestaja', tags: ['Algoritam'] },
  'POST /attractions': { summary: 'Faza 3 - ocena atrakcija', tags: ['Algoritam'] },
  'POST /attraction-details': { summary: 'Opis i slika za izabrane atrakcije', tags: ['Algoritam'] },
  'POST /plan': { summary: 'Svih pet faza - ceo plan', tags: ['Algoritam'] },
  'POST /replan': { summary: 'Ponovno pravljenje plana za isti let i smestaj', tags: ['Algoritam'] },
  'POST /trip-days': { summary: 'Prozori dana za zadat let', tags: ['Algoritam'] },
  'POST /schedule-day': { summary: 'Satnica jednog dana', tags: ['Algoritam'] },
  'POST /optimize-day': { summary: 'Optimizacija redosleda u danu (2-opt)', tags: ['Algoritam'] }
};

module.exports = { OPISI };
