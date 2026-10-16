# DATABASE_SCHEMA.md — MongoDB šeme i indeksi

Dokument je izveden iz Mongoose modela (`voyra/backend_Node/<servis>/src/models/*.js`)
i proveren nad stvarnim indeksima lokalne MongoDB instance (`getIndexes`, samo čitanje).
Gde se dokument i kod razilaze, merodavan je kod.

Oznake u tabelama polja:

- **obavezno** — `required: true` u šemi;
- **podrazumevano** — vrednost koju Mongoose upisuje ako polje nije dato;
- `_id` je `ObjectId` osim gde je drugačije navedeno;
- `createdAt` / `updatedAt` vodi Mongoose kada šema ima `timestamps: true`.

Oznake indeksa: **U** jedinstven, **S** `sparse`, **P** parcijalan
(`partialFilterExpression`), **TTL** (`expireAfterSeconds`), **složeni** (više ključeva).

---

## 1. PREGLED

Arhitektura je *database-per-service*: svaki servis koji čuva podatke ima
sopstvenu bazu i piše samo u nju. Naziv baze dolazi iz `MONGODB_URI` u
`<servis>/.env.example`. Planner Service i API Gateway nemaju bazu.

| Baza | Servis | Kolekcije (model) |
|---|---|---|
| `users_db` | user-service | `users` (User), `login_attempts` (LoginAttempt) |
| `trips_db` | trip-service | `trips` (Trip), `destinations` (Destination), `attractions` (Attraction), `interest_categories` (InterestCategory), `search_stats` (SearchStat), `cities` (City), `airports` (Airport) |
| `booking_db` | booking-service | `bookings` (Booking) |
| `notifications_db` | notification-service | `notifications` (Notification), `notification_logs` (NotificationLog), `notification_templates` (NotificationTemplate) |
| `admin_db` | admin-service | `audit_logs` (AuditLog), `system_stats` (SystemStats) |
| `integration_db` | integration-service | `flights_cache`, `accommodations_cache`, `attractions_cache`, `exchange_rates_cache`, `geocode_cache`, `attraction_details_cache` (CacheModels.js) |
| `orchestrator_db` | orchestrator-service | `plan_sessions` (PlanSession) |

Napomene uz pregled:

- `.env.example` fajlovi admin-, booking-, orchestrator- i user-service-a
  navode i URI-je tuđih baza (`MONGODB_USERS_DB`, `MONGODB_TRIPS_DB` …).
  Njih koriste isključivo probne skripte u `scripts/` (priprema i čišćenje
  test podataka); kod u `src/` ih ne koristi — orchestrator iz
  `MONGODB_ORCHESTRATOR_DB` čita samo sopstvenu bazu.
- U lokalnoj `booking_db` postoji i kolekcija **`payments`** (indeksi
  `bookingId`, `userId`, `status`) za koju **nema modela** — ostatak iz
  vremena ranije, kada je plaćanje izbačeno. Kod je ne čita i ne piše.
- Veze između baza su „meke": čuvaju se kao string identifikatori
  (`userId`, `tripId`, `bookingId`, `gradId`), bez referencijalnog
  integriteta na nivou baze; proverava ih servis koji podatak poseduje.

---

## 2. users_db (user-service)

### 2.1 `users`

Model `User` (`user-service/src/models/User.js`). Šema nema `timestamps`,
nego ručno vođene `createdAt`/`updatedAt` (`pre('save')` i eksplicitno u
`findByIdAndUpdate` pozivima administratora).

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `ime` | String | obavezno, trim, min 2 | Ime |
| `prezime` | String | obavezno, trim, min 2 | Prezime |
| `email` | String | obavezno, **jedinstveno**, lowercase, trim, regex `.+@.+\..+` | Adresa elektronske pošte |
| `korisnickoIme` | String | obavezno, **jedinstveno**, 3–20 znakova, `[a-zA-Z0-9_-]` | Ime za prijavu |
| `lozinka` | String | obavezno, min 8, `select: false` | bcrypt heš (`BCRYPT_ROUNDS`, podrazumevano 10); hešira se u `pre('save')` samo kada je promenjena; nikada ne izlazi iz servisa (`toJSON`) |
| `uloga` | String enum `korisnik` \| `admin` | `korisnik` | Uloga |
| `status` | String enum `na_cekanju` \| `odobren` \| `odbijen` \| `blokiran` | `na_cekanju` | Stanje naloga (odobravanje registracije, spec §3.3) |
| `tokenVersion` | Number | 0 | Verzija tokena: uvećava se (`ponistiTokene`, `$inc`) pri promeni lozinke, blokiranju, odbijanju i promeni uloge, čime svi raniji JWT-ovi (claim `tv`) postaju nevažeći |
| `phone.number` | String | — (opciono), trim | Broj telefona |
| `phone.isVerified` | Boolean | false | Da li je broj potvrđen |
| `phone.verifiedAt` | Date | — | Vreme potvrde |
| `phone.verificationCode` | String | `select: false` | Kod za potvrdu (interno) |
| `phone.verificationCodeExpiresAt` | Date | — | Rok koda — proverava se u aplikaciji |
| `phone.smsOptIn` | Boolean | true | Pristanak na SMS |
| `phone.attempts` | Number | 0 | Pogrešni pokušaji potvrde (interno) |
| `phone.lockedUntil` | Date | — | Zaključavanje potvrde (interno) |
| `createdAt` | Date | `Date.now` | Vreme registracije |
| `updatedAt` | Date | `Date.now` | Poslednja izmena |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ email: 1 }` | U | Jedan nalog po adresi; registracija proverava `findOne({ $or: [{ email }, { korisnickoIme }] })`, a indeks je garancija i kad dva zahteva stignu istovremeno. |
| `{ korisnickoIme: 1 }` | U | Prijava radi `findOne({ korisnickoIme })`; ime mora biti jedinstveno. |
| `{ 'phone.number': 1 }` | U, S | Broj, ako postoji, pripada samo jednom nalogu (`findOne({ 'phone.number' })` pri dodavanju broja). `sparse` dozvoljava proizvoljno mnogo naloga bez broja (komentar u modelu). |

Namerno **nema** TTL indeksa na `phone.verificationCodeExpiresAt`: TTL
briše ceo dokument, pa bi nalog nestao desetak minuta posle traženja koda
(komentar u modelu). Nema ni indeksa na `status`/`uloga`: lista korisnika
za administratora (`find(upit).sort({ createdAt: -1 })`) radi nad malom
kolekcijom.

### 2.2 `login_attempts`

Model `LoginAttempt` — neuspešni pokušaji prijave. Broji se
po paru (korisničko ime, IP): samo po imenu bi napadač mogao da zaključa
tuđi nalog, samo po IP-u bi se zaključali svi iza istog NAT-a. Stanje je u
bazi da restart servisa ne bi napadaču dao nove pokušaje.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `kljuc` | String | obavezno, **jedinstveno** | `korisnickoIme\|ip`, mala slova |
| `korisnickoIme` | String | obavezno | Korisničko ime iz pokušaja |
| `ip` | String | obavezno | IP adresa |
| `pokusaji` | Number | 0 | Broj promašaja u prozoru (prag `LOGIN_MAX_ATTEMPTS`, podrazumevano 5) |
| `prviPokusaj` | Date | `Date.now` | Početak prozora — od njega teče TTL |
| `poslednjiPokusaj` | Date | `Date.now` | Poslednji promašaj |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ kljuc: 1 }` | U | Jedan brojač po paru; `PokusajiPrijave` radi `findOne({ kljuc })` i `updateOne(..., { upsert })` — jedinstvenost sprečava dva brojača pri istovremenim pokušajima. |
| `{ prviPokusaj: 1 }` | TTL `LOGIN_WINDOW_MINUTES × 60` (podrazumevano 900 s) | Zapis nestaje sam kada prozor istekne, pa se brojač „resetuje" bez dodatnog posla. Istek se računa od **prvog** pokušaja: pet promašaja zaključava nalog tačno 15 minuta, a ne dok napadač kuca. |

---

## 3. trips_db (trip-service)

### 3.1 `trips`

Model `Trip` (kolekcija podrazumevanog imena `trips`), `timestamps: true`.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `userId` | String | obavezno | Vlasnik (`_id` iz `users_db.users`) |
| `title` | String | obavezno, trim | Naziv putovanja |
| `description` | String | trim | Opis |
| `from` | String | obavezno | IATA kod polazišta (zadržan zbog ranije sačuvanih putovanja) |
| `to` | String | obavezno | IATA kod odredišta |
| `date` | Date | obavezno | Datum polaska |
| `checkIn` | Date | obavezno | Početak boravka |
| `checkOut` | Date | obavezno | Kraj boravka (koristi ga posao za status ZAVRSENO) |
| `passengers` | Number | 1, min 1 | Broj putnika |
| `guests` | Number | 1, min 1 | Broj gostiju u smeštaju |
| `budget` | Number | obavezno, min 0 | Budžet |
| `preferences` | Object | — | `transportPriority`, `accommodationTypes[]`, `minAccommodationRating`, `interests[]`, `pace`, `dayStart`, `dayEnd` — čuvaju se da bi se plan mogao ponovo generisati sa istim izborom (spec §4.2) |
| `fromCity` | Mixed | null | Pun opis grada polazišta, uključujući aerodrom i udaljenost |
| `toCity` | Mixed | null | Pun opis grada odredišta |
| `itinerary` | Mixed | — | Rezultat Planner Service-a **u celosti** (izabrani let i smeštaj, dani sa aktivnostima, troškovi, upozorenja…). `Mixed` namerno: tipizirana podšema je ranije tiho odbacivala `selectedFlight` itd.; svaka izmena zahteva `markModified('itinerary')` |
| `status` | String enum `NACRT` \| `REZERVISANO` \| `OTKAZANO` \| `ZAVRSENO` | `NACRT` | Stanje (spec §4.9). Dozvoljeni prelazi (`PRELAZI`): NACRT → REZERVISANO/OTKAZANO; REZERVISANO → OTKAZANO/ZAVRSENO; OTKAZANO i ZAVRSENO su konačni |
| `bookingInfo` | Object | — | `bookingReference` (PNR), `bookingId` (iz booking-service-a), `accommodationBookingUrl`, `bookingDate`, `cancelledAt` |
| `createdAt`, `updatedAt` | Date | automatski | `timestamps` |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ userId: 1 }` | jednostavan | Iz `index: true`; provera vlasništva `findOne({ _id, userId })`. (Pokriven je i prefiksom složenog indeksa ispod — v. §9.) |
| `{ userId: 1, createdAt: -1 }` | složeni | Najčešći upit: „moja putovanja, najnovija prva" — `TripService.getUserTrips`: `find({ userId, … }).sort({ createdAt: -1 }).limit(50)`. |
| `{ userId: 1, status: 1 }` | složeni | Filtriranje putovanja korisnika po statusu (`getUserTrips` sa `filter.status`). |
| `{ status: 1 }` | jednostavan | Pozadinski posao `ZavrsenaPutovanja.oznaciZavrsena`: `updateMany({ status: 'REZERVISANO', checkOut: { $lt: sada } })`; administratorska lista `/all?status=`. |

### 3.2 `destinations`

Model `Destination` — istaknute destinacije na početnoj strani (spec §9, §4.1).
Grad se ne prepisuje, čuva se samo `gradId` (podaci o gradu žive u `cities`).

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `gradId` | String | obavezno, **jedinstveno** | `_id` grada iz `cities` — jedan grad, jedna destinacija |
| `naslov` | String | `''`, trim, max 80 | Naslov kartice; prazno = naziv grada |
| `opis` | String | `''`, trim, max 400 | Opis |
| `slika` | `{ url, sourceUrl, credit }` | null | Slika sa izvorom i autorom |
| `redosled` | Number | 100 | Redosled prikaza (menja ga administrator, `bulkWrite`) |
| `istaknuta` | Boolean | true | Sklanjanje sa početne bez brisanja |
| `createdAt`, `updatedAt` | Date | automatski | `timestamps` |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ gradId: 1 }` | U | Jedan grad — jedna destinacija; `DestinacijeService` pre upisa proverava `exists({ gradId })`, a indeks to garantuje. |
| `{ redosled: 1 }` | jednostavan | `findOne().sort({ redosled: -1 })` — sledeći redni broj pri dodavanju. |
| `{ istaknuta: 1 }` | jednostavan | Iz `index: true`; pokriven i složenim indeksom (v. §9). |
| `{ istaknuta: 1, redosled: 1 }` | složeni | Početna strana: `find({ istaknuta: true }).sort({ redosled: 1, createdAt: 1 })`. |

### 3.3 `attractions`

Model `Attraction` — atrakcije koje unosi administrator (spec §9, §4.5).
Eksterne atrakcije se ovde **ne čuvaju**; one žive u kešu Integration
Service-a i u Fazi 3 se spajaju sa ovima (`source: 'admin'`).

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `izvor` | String enum `admin` | `admin` | Uvek `admin` |
| `naziv` | String | obavezno, trim, max 140 | Naziv |
| `opis` | String | `''`, trim, max 1000 | Opis |
| `gradId` | String | obavezno | `_id` grada iz `cities` (geonameId) |
| `gradNaziv` | String | null | Naziv grada (za prikaz) |
| `lat` | Number | obavezno, −90…90 | Geografska širina |
| `lon` | Number | obavezno, −180…180 | Geografska dužina |
| `kategorije` | [String] | obavezno, bar jedna | Ključevi iz `interest_categories` (proverava se `find({ _id: { $in } })`) |
| `trajanjeMin` | Number | obavezno, 15–600 | Trajanje posete u minutima |
| `radnoVreme` | `{ open, close }` (HH:MM ili 24:00) | null | `null` = nepoznato, važi procena po kategoriji |
| `cenaUlaznice` | Number | null, min 0 | `null` = nepoznato, 0 = besplatno |
| `slika` | `{ url, sourceUrl, credit }` | null | Slika |
| `aktivna` | Boolean | true | Meko brisanje — sačuvani planovi je i dalje prikazuju |
| `createdAt`, `updatedAt` | Date | automatski | `timestamps` |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ naziv: 1 }` | jednostavan | Iz `index: true`; lista je sortirana po nazivu (`sort({ naziv: 1 })`). |
| `{ gradId: 1 }` | jednostavan | Iz `index: true`; pokriven i složenim indeksom (v. §9). |
| `{ aktivna: 1 }` | jednostavan | Iz `index: true`. |
| `{ gradId: 1, aktivna: 1 }` | složeni | Planner traži aktivne atrakcije grada: `AtrakcijeService.zaGrad` — `find({ gradId, aktivna: true }).sort({ naziv: 1 })`. |

### 3.4 `interest_categories`

Model `InterestCategory` — kategorije interesovanja (spec §9, §3.3). Do
 bile su konstante u planner-service-u; konstante su ostale kao
rezerva kada Trip Service nije dostupan.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `_id` | **String** | obavezno, `^[a-z_]{3,30}$` | Ključ kategorije — **nepromenljiv**, jer ga nose sačuvana putovanja i preferencije |
| `naziv` | String | obavezno, trim, max 60 | Naziv |
| `opis` | String | `''`, trim, max 300 | Opis |
| `eksterneKategorije` | [String] | obavezno, bar jedna | OpenTripMap `kinds`; iz njih se računa i obrnuto mapiranje |
| `geoapifyKategorije` | [String] | `[]` | Geoapify kategorije; prazno = podrazumevane kategorije adaptera |
| `trajanjePoseteMin` | Number | obavezno, 15–600 | Procena trajanja posete |
| `radnoVreme.open` / `.close` | String (HH:MM ili 24:00) | obavezno | Procena radnog vremena; prelazak preko ponoći dozvoljen |
| `redosled` | Number | 100 | Redosled prikaza |
| `aktivna` | Boolean | true | Meko brisanje |
| `createdAt`, `updatedAt` | Date | automatski | `timestamps` |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ aktivna: 1 }` | jednostavan | Iz `index: true`; pokriven i složenim (v. §9). |
| `{ aktivna: 1, redosled: 1 }` | složeni | `KategorijeService.lista`: `find({ aktivna: true }).sort({ redosled: 1, _id: 1 })` — ono što vide Planner i frontend. |

Jedinstvenost ključa daje sam `_id`.

### 3.5 `search_stats`

Model `SearchStat` — statistika pretraga po gradu (spec §9, §4.1). Jedan
zapis po gradu i danu.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `gradId` | String | obavezno | `_id` grada iz `cities` |
| `datum` | String | obavezno | `YYYY-MM-DD` po UTC-u |
| `brojPretraga` | Number | 0 | Broj pretraga tog dana |
| `brojSacuvanih` | Number | 0 | Broj sačuvanih putovanja tog dana |
| `trazioci` | [String] | `[]` | Otisci (userId ili heš sesije) već brojanih pretraga; najviše 5.000 po zapisu |
| `cuvaoci` | [String] | `[]` | Isto, za čuvanja |
| `zabelezeno` | Date | `Date.now` | Vreme poslednjeg upisa — nosi TTL (jer je `datum` string) |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ gradId: 1 }` | jednostavan | Iz `index: true`; prefiks jedinstvenog složenog (v. §9). |
| `{ gradId: 1, datum: 1 }` | U, složeni | Jedan zapis po gradu i danu; `zabelezi` radi `findOne({ gradId, datum })` pa `updateOne(..., { upsert: true })` — bez jedinstvenosti bi dva istovremena upserta napravila duplikat. |
| `{ datum: -1 }` | jednostavan | Popularne destinacije: `aggregate([{ $match: { datum: { $gte: od } } }, …])` za poslednjih 30 dana. |
| `{ zabelezeno: 1 }` | TTL `SEARCH_STATS_TTL_DAYS` (podrazumevano 90 dana = 7 776 000 s) | Stari zapisi nestaju sami; popularnost gleda 30 dana, pa 90 ostavlja rezervu. |

### 3.6 `cities`

Model `City` — referentni podaci o gradovima Evrope (GeoNames
`cities15000`). `_id` je geonameId (String), pa je ponovni uvoz
(`scripts/uvoz-gradova.js`) idempotentan. `timestamps: true`.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `_id` | **String** | — | geonameId |
| `naziv` | String | obavezno | Lokalni naziv |
| `nazivSr` / `nazivEn` | String | null | Srpski / engleski naziv |
| `alternativniNazivi` | [String] | `[]` | Ostali nazivi (latinica) |
| `pretraga` | [String] | `[]` | Normalizovani oblici svih naziva (mala slova, bez dijakritike) |
| `pretragaGlavna` | [String] | `[]` | Normalizovani oblici samo glavnih naziva — za rangiranje („ljub" → Ljubljana pre Lublina) |
| `drzava` | String | obavezno | ISO kod države |
| `drzavaNaziv` | String | `''` | Naziv države |
| `lat`, `lon` | Number | obavezno | Koordinate |
| `stanovnika` | Number | 0 | Broj stanovnika |
| `aerodromi` | [{ `iata`, `naziv`, `udaljenostKm`, `tip` }] | `[]` | Do tri najbliža aerodroma sa redovnim linijama, do 150 km — računa se pri uvozu |
| `iataGrada` | String | null | Metropolitanski IATA kod (LON, PAR…) — Duffel pretraga po gradu pokriva sve aerodrome |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ pretraga: 1 }` | jednostavan (multikey) | Pretraga po prefiksu: `CityService` — `find({ pretraga: /^q/ })`; regex je usidren na početak upravo da bi MongoDB mogao da koristi ovaj indeks (komentar u kodu). |
| `{ pretragaGlavna: 1 }` | jednostavan (multikey) | Poklapanje po glavnom nazivu u rangiranju. |
| `{ drzava: 1 }` | jednostavan | Brojanje/filtriranje po državi (`scripts/proba-gradova.js`: `countDocuments({ drzava })`). |
| `{ stanovnika: -1 }` | jednostavan | Sortiranje kandidata po veličini: `.sort({ stanovnika: -1 })` u pretrazi i pri traženju grada po IATA kodu. |

Upit po IATA kodu (`$or: [{ iataGrada }, { 'aerodromi.iata' }]`) nema svoj indeks — v. §9.

### 3.7 `airports`

Model `Airport` — aerodromi Evrope sa redovnim linijama (OurAirports,
`large_airport`/`medium_airport`, `scheduled_service = yes`). `_id` je IATA
kod, pa je uvoz idempotentan. `timestamps: true`.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `_id` | **String** | — | IATA kod |
| `iata` | String | obavezno | IATA kod (ponovljen) |
| `naziv` | String | obavezno | Naziv aerodroma |
| `grad` | String | `''` | Grad (iz izvora) |
| `drzava` | String | obavezno | ISO kod države |
| `drzavaNaziv` | String | `''` | Naziv države |
| `lat`, `lon` | Number | obavezno | Koordinate |
| `tip` | String | obavezno | `large_airport` ili `medium_airport` |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ drzava: 1 }` | jednostavan | Filtriranje po državi (u modelu nema komentara; u `src/` se ne koristi — v. §9). |
| `{ tip: 1 }` | jednostavan | Filtriranje po veličini aerodroma (isto kao gore). |

Servis aerodrome čita samo po ključu (`Airport.findById(kod)`).

---

## 4. booking_db (booking-service)

### 4.1 `bookings`

Model `Booking`, `timestamps: true`. Statusi: `PENDING` (nacrt), `CONFIRMED`,
`FAILED`, `CANCELLED`, `EXPIRED`. Status plaćanja ne postoji — spec §4.8
traži tok „bez stvarne kupovine i naplate", Duffel u test režimu plaća sa
balansa.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `bookingId` | String | obavezno, **jedinstveno**, `BK` + 6 hex | Čitljiv identifikator za URL |
| `userId` | String | obavezno | Vlasnik |
| `tripId` | String | — | Putovanje iz `trips_db` |
| `aktivnaZaPutovanje` | String | null | Ključ protiv dvostruke rezervacije: drži `tripId` dok je status PENDING/CONFIRMED, inače `null`; postavlja ga `pre('save')` iz statusa |
| `flights[]` | podšema (bez `_id`) | — | `offerId` (obavezno), `orderId` (Duffel `ord_…`), `bookingReference` (PNR), `from`, `to`, `departure`, `arrival`, `airline`, `airlineIata`, `outbound`, `inbound`, `price`, `currency` (EUR), `status` (PENDING) |
| `passengers[]` | podšema (bez `_id`) | — | `passengerId` (Duffel `pas_…`), `title`, `givenName` (obavezno), `familyName` (obavezno), `bornOn`, `gender`, `email`, `phoneNumber` |
| `status` | String enum (gore) | `PENDING` | Stanje rezervacije |
| `totalPrice` | Number | obavezno | Ukupna cena |
| `currency` | String | `EUR` | Valuta |
| `expiresAt` | Date | sada + `DRAFT_TTL_MINUTES` (30 min) | Do kada nacrt važi |
| `confirmations` | Object | — | `flight_pdf_url`, `email_sent` (false), `email_address` |
| `failureReason` | String | — | Razlog neuspeha/otkazivanja |
| `cancelledAt` | Date | — | Vreme otkazivanja |
| `createdAt`, `updatedAt` | Date | automatski | `timestamps` |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ bookingId: 1 }` | U | Dohvatanje po čitljivom ID-ju: `findOne({ bookingId })`. |
| `{ userId: 1 }` | jednostavan | Iz `index: true`; prefiks složenog (v. §9). |
| `{ tripId: 1 }` | jednostavan | Provera postojeće rezervacije: `findOne({ tripId, status: { $in: ['PENDING','CONFIRMED'] } })`; lista rezervacija jednog putovanja. |
| `{ status: 1 }` | jednostavan | Iz `index: true`; filtriranje po statusu. |
| `{ userId: 1, createdAt: -1 }` | složeni | `getUserBookings`: `find({ userId, … }).sort({ createdAt: -1 }).limit(100)`. |
| `{ expiresAt: 1 }` | TTL 3600 s, P `{ status: 'PENDING' }` | Briše **samo** nepotvrđene nacrte, sat vremena posle isteka. Bez parcijalnog filtera nestale bi i potvrđene rezervacije; sat zadrške omogućava aplikaciji da na istekli nacrt odgovori `410 GONE` pre nego što ga TTL počisti. |
| `{ aktivnaZaPutovanje: 1 }` | U, P `{ aktivnaZaPutovanje: { $type: 'string' } }` | Najviše **jedna aktivna** rezervacija po putovanju (spec §4.8). Provera u kodu ne pomaže kad dva zahteva stignu istovremeno — baza je jedini nivo gde je to garantovano. Parcijalan, a ne `sparse`: `sparse` preskače samo dokumente **bez** polja, a otkazana rezervacija ga ima sa `null`, pa je druga otkazana padala na `E11000` i otkazivanje vraćalo `502 FLIGHT_CANCEL_FAILED` (greška iz E2E scenarija). |

---

## 5. notifications_db (notification-service)

### 5.1 `notifications`

Model `Notification`, `timestamps: true`. Kolekcija je istovremeno i red
za slanje (worker `NotificationQueue`).

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `type` | String enum | obavezno | `BOOKING_CONFIRMED`, `BOOKING_FAILED`, `BOOKING_CANCELLED`, `TRIP_SAVED`, `TRIP_DELETED`, `REGISTRATION_APPROVED`, `REGISTRATION_REJECTED`, `ACCOUNT_BLOCKED`, `ACCOUNT_UNBLOCKED`, `PASSWORD_CHANGED`, `ADMIN_ACTION` (PAYMENT_* uklonjeni) |
| `channel` | String enum `email` \| `sms` \| `push` | obavezno | Kanal |
| `recipient` | Object | — | `userId`, `email`, `phone` |
| `subject`, `body` | String | — | Sadržaj |
| `templateName` | String | — | Šablon iz `notification_templates` |
| `templateData` | Object | `{}` | Podaci za šablon |
| `attachment` | Object | — | `filename`, `content` (Buffer — ne ide u liste), `contentType` |
| `status` | String enum `PENDING` \| `SENT` \| `FAILED` \| `BOUNCED` \| `CANCELLED` | `PENDING` | Stanje slanja |
| `sentAt` | Date | — | Vreme slanja |
| `failureReason` | String | — | Razlog neuspeha |
| `retryCount` | Number | 0 | Broj ponovnih pokušaja |
| `maxRetries` | Number | `MAX_RETRIES` ili 3 | Gornja granica |
| `scheduledFor` | Date | — | `null` = odmah; budući datum = čeka |
| `lockedAt` | Date | — | Zaključavanje zapisa za jednog workera |
| `expiresAt` | Date | — | Apsolutni datum brisanja: SENT + `TTL_SENT_DAYS` (7), FAILED + `TTL_FAILED_DAYS` (30); PENDING ga nema |
| `metadata` | Object | — | `bookingId`, `tripId`, `adminId`, `source` |
| `dedupeKey` | String | — | Ključ protiv dve iste notifikacije za isti događaj |
| `createdAt`, `updatedAt` | Date | automatski | `timestamps` |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ type: 1 }` | jednostavan | Iz `index: true`; filter liste i statistika po tipu (`aggregate` `$group` po `type`). |
| `{ recipient.userId: 1 }` | jednostavan | Iz `index: true`; prefiks složenog (v. §9). |
| `{ status: 1 }` | jednostavan | Iz `index: true`; prefiks složenog (v. §9). |
| `{ expiresAt: 1 }` | TTL 0 | Briše dokument kada prođe `expiresAt`; jedan indeks pokriva oba roka (7 dana SENT, 30 dana FAILED). Zapisi bez `expiresAt` (PENDING) se ne brišu. |
| `{ status: 1, scheduledFor: 1 }` | složeni | Worker uzima sledeći zapis: `findOneAndUpdate({ status: 'PENDING', scheduledFor ≤ sada ili null, lockedAt null ili zastareo }, { $set: { lockedAt } }, { sort: { createdAt: 1 } })` — atomično, pa dva workera ne uzimaju isti zapis. |
| `{ recipient.userId: 1, createdAt: -1 }` | složeni | Istorija obaveštenja korisnika: `find({ 'recipient.userId', … }).sort({ createdAt: -1 })` sa stranicama. |
| `{ dedupeKey: 1 }` | U, P `{ dedupeKey: { $type: 'string' } }` | Jedinstveno samo kada ključ postoji — obične notifikacije ga nemaju. Kod pre upisa radi `findOne({ dedupeKey })`, a indeks garantuje jedinstvenost i pri istovremenim zahtevima. |

### 5.2 `notification_logs`

Model `NotificationLog` — dnevnik pokušaja slanja (bez `timestamps`).

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `notificationId` | String | obavezno | `_id` notifikacije |
| `action` | String enum `SENT` \| `FAILED` \| `RETRIED` \| `BOUNCED` \| `CANCELLED` | obavezno | Događaj |
| `timestamp` | Date | `Date.now` | Vreme |
| `details` | String | — | Detalji |
| `externalId` | String | — | ID kod provajdera (npr. SMTP/SMS) |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ notificationId: 1 }` | jednostavan | Detalj notifikacije: `find({ notificationId }).sort({ timestamp: 1 })`. |
| `{ timestamp: 1 }` | TTL `TTL_LOGS_DAYS` (podrazumevano 90 dana) | Logovi se čuvaju duže od samih notifikacija — zbog revizije (komentar u modelu). |

### 5.3 `notification_templates`

Model `NotificationTemplate`, `timestamps: true`. Šabloni se seeduju pri
pokretanju (`NotificationService`).

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `name` | String | obavezno, **jedinstveno** | Ime šablona |
| `type` | String enum `email` \| `sms` | obavezno | Kanal |
| `subject` | String | — | Naslov (prazno za SMS) |
| `bodyTemplate` | String | obavezno | Telo sa promenljivama |
| `variables` | [String] | — | Spisak promenljivih |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ name: 1 }` | U | Šablon se traži po imenu (`findOne({ name, type })`); seed proverava `findOne({ name })` pre upisa, pa ponovljeno pokretanje ne pravi duplikate. |

---

## 6. admin_db (admin-service)

### 6.1 `audit_logs`

Model `AuditLog`, **bez** `timestamps` — vreme je u polju `timestamp`.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `action` | String enum | obavezno | `LOGIN`, `LOGOUT`, `REGISTER`, `CREATE_TRIP`, `BOOK_TRIP`, `UPDATE_USER_STATUS`, `DELETE_USER`, `CHANGE_USER_ROLE`, `ADMIN_LOGIN`, `ADMIN_ACTION`, `PLAN_TRIP`, `CHANGE_PASSWORD`, `EDIT_PLAN`, `REGENERATE_PLAN`, `APPROVE_REGISTRATION`, `REJECT_REGISTRATION`, `BLOCK_USER`, `UNBLOCK_USER`, `CREATE/UPDATE/DELETE_DESTINATION`, `REORDER_DESTINATIONS`, `CREATE/UPDATE/DELETE_ATTRACTION`, `CREATE/UPDATE/DELETE_CATEGORY` |
| `userId` | String | — | Korisnik na koga se akcija odnosi |
| `adminId` | String | — | Administrator koji je izvršio akciju |
| `target` | String | — | Nad čime je akcija izvršena |
| `oldValue`, `newValue` | Mixed | — | Stanje pre i posle |
| `timestamp` | Date | `Date.now` | Vreme (nosi TTL) |
| `ipAddress`, `userAgent` | String | — | Poreklo zahteva |
| `status` | String enum `SUCCESS` \| `FAILURE` | `SUCCESS` | Ishod |
| `errorMessage` | String | — | Poruka greške |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ action: 1 }` | jednostavan | Iz `index: true`; prefiks složenog (v. §9). |
| `{ userId: 1 }` | jednostavan | Filter `getLogs({ userId })`. |
| `{ adminId: 1 }` | jednostavan | Iz `index: true`; prefiks složenog. |
| `{ action: 1, timestamp: -1 }` | složeni | „Logovi jedne akcije, najnoviji prvi": `find({ action, … }).sort({ timestamp: -1 })`. |
| `{ adminId: 1, timestamp: -1 }` | složeni | „Logovi jednog administratora, najnoviji prvi". |
| `{ timestamp: 1 }` | TTL `AUDIT_LOG_TTL` (podrazumevano 7 776 000 s = 90 dana) | Stari zapisi nestaju sami. TTL je na `timestamp`, jer šema nema `createdAt`. Polje namerno nema `index: true`: MongoDB ne pravi dva indeksa sa istim ključem, a različitim opcijama, pa bi obični indeks sprečio TTL (komentar u modelu). Koristi ga i statistika `aggregate([{ $match: { timestamp: { $gte: pre24h } } }, …])`. |

### 6.2 `system_stats`

Model `SystemStats`, `timestamps: true`. Snimak statistike koji
`AdminService.getSystemStats` upisuje (`create`) pri svakom računanju.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `timestamp` | Date | `Date.now` | Vreme snimka (nosi TTL) |
| `totalUsers`, `activeUsers`, `totalTrips`, `totalBookings` | Number | — | Brojevi; `activeUsers` = prijava u poslednja 24 h |
| `averageRating` | Number | — | Prosečna ocena |
| `apiHealth.user/.trip/.integration` | `{ status, lastCheck, responseTime }` | — | Stanje servisa |
| `responseTime` | Number | — | ms |
| `errorRate` | Number | — | % |
| `createdAt`, `updatedAt` | Date | automatski | `timestamps` |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ timestamp: 1 }` | TTL `SYSTEM_STATS_TTL` (podrazumevano 15 552 000 s = 180 dana) | Istorija statistike se ne čuva unedogled; `timestamp` bez `index: true` iz istog razloga kao u `audit_logs`. |

---

## 7. integration_db (integration-service)

### 7.1 Keš kolekcije

Svih šest kolekcija pravi ista fabrika `napraviKesSemu` u `CacheModels.js`;
razlikuju se samo po TTL-u i tipu polja `data`.

| Kolekcija | Model | `data` | TTL (env, podrazumevano) | Razlog trajanja |
|---|---|---|---|---|
| `flights_cache` | FlightsCache | [Mixed] | `CACHE_TTL_FLIGHTS`, 900 s (15 min) | Spec §11 |
| `accommodations_cache` | AccommodationsCache | [Mixed] | `CACHE_TTL_ACCOMMODATIONS`, 1800 s (30 min) | Spec §11 |
| `attractions_cache` | AttractionsCache | [Mixed] | `CACHE_TTL_ATTRACTIONS`, 604 800 s (7 dana) | Spec §11 |
| `exchange_rates_cache` | ExchangeRatesCache | Mixed | `CACHE_TTL_RATES`, 86 400 s (24 h) | ECB kurs se menja jednom dnevno |
| `geocode_cache` | GeocodeCache | Mixed | `CACHE_TTL_GEOCODE`, 2 592 000 s (30 dana) | Koordinate se ne menjaju; pravila Nominatim-a traže da se isti upit ne ponavlja |
| `attraction_details_cache` | AttractionDetailsCache | Mixed | `CACHE_TTL_ATTRACTION_DETAILS`, 2 592 000 s (30 dana) | Opis i slika atrakcije se gotovo ne menjaju, a traže jedan poziv po atrakciji |

Polja (zajednička):

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `queryKey` | String | obavezno, **jedinstveno** | Ključ upita (parametri zahteva ka provajderu) |
| `data` | [Mixed] ili Mixed | — | Normalizovan odgovor provajdera |
| `createdAt` | Date | `Date.now` | Vreme upisa — nosi TTL |

**Indeksi (u svakoj od šest kolekcija)**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ queryKey: 1 }` | U | `BaseAdapter` čita `findOne({ queryKey })` i piše `findOneAndUpdate({ queryKey }, …, upsert)` — jedan zapis po upitu, bez duplikata pri istovremenim promašajima keša. |
| `{ createdAt: 1 }` | TTL (tabela gore) | MongoDB sam briše zastarele odgovore; trajanje prati koliko brzo podatak zastareva u stvarnosti. |

**Usklađivanje TTL-a pri pokretanju** (`src/config/ttlIndeksi.js`):
MongoDB ne menja postojeći TTL indeks kada se `expireAfterSeconds`
promeni u kodu, pa `uskladiTtlIndekse` pri startu upoređuje stvarne
indekse sa tabelom `TTL` i po potrebi poziva `collMod`. Idempotentno je, a
neuspeh ne sprečava pokretanje. Spisak obuhvata `flights_cache`,
`accommodations_cache`, `attractions_cache`, `exchange_rates_cache` i
`geocode_cache` — **ne i `attraction_details_cache`** (v. §9).

---

## 8. orchestrator_db (orchestrator-service)

### 8.1 `plan_sessions`

Model `PlanSession` — jedna sesija generisanja plana u čarobnjaku (i za
gosta). Bez `timestamps`; `createdAt` je obično polje.

| Polje | Tip | Obavezno / podrazumevano | Opis |
|---|---|---|---|
| `sessionId` | String | obavezno, **jedinstveno** | Identifikator sesije |
| `userId` | String | null | `null` = gost |
| `requestId` | String | — | Korelacioni ID zahteva |
| `request` | Object | — | Parametri čarobnjaka |
| `response` | Object | — | Generisani plan |
| `status` | String enum `READY` \| `FAILED` | `READY` | Ishod |
| `errorCode` | String | — | Kod greške za FAILED |
| `route` | String | — | Ruta, npr. `BEG-ATH` |
| `sources` | Object | — | `flights`, `accommodations` — odakle su podaci (API, keš, mock) |
| `savedTripId` | String | null | Putovanje napravljeno iz sesije |
| `durationMs` | Number | — | Trajanje generisanja |
| `createdAt` | Date | `Date.now` | Vreme |
| `expiresAt` | Date | — | Apsolutni datum brisanja: READY + `PLAN_SESSION_TTL_HOURS` (24 h), FAILED + `FAILED_SESSION_TTL_DAYS` (7 dana) |

**Indeksi**

| Indeks | Vrsta | Razlog |
|---|---|---|
| `{ sessionId: 1 }` | U | Čuvanje i ponovno generisanje traže sesiju po ID-ju: `findOne({ sessionId })`, `findOne({ sessionId, status: 'READY' })`. |
| `{ status: 1 }` | jednostavan | Iz `index: true`; statistika `countDocuments({ createdAt ≥ od, status: 'FAILED' })`. |
| `{ route: 1 }` | jednostavan | Iz `index: true`; statistika „najčešće rute" (`$group` po `route`). |
| `{ expiresAt: 1 }` | TTL 0 | Jedan TTL nad apsolutnim datumom pokriva oba roka (24 h / 7 dana); kolekcija sadrži samo sesije, pa TTL ne može obrisati ništa drugo. |
| `{ createdAt: -1 }` | jednostavan | `StatsService`: svi upiti imaju `{ createdAt: { $gte: od } }` (periodi 24 h / 7 d / 30 d). |
| `{ userId: 1, createdAt: -1 }` | složeni | Sesije jednog korisnika, najnovije prve; brojanje gostujućih (`userId: null`) u periodu. |

---

## 9. NAPOMENE O INDEKSIMA

**TTL indeksi — pregled**

| Kolekcija | Polje | Trajanje | Vrsta roka |
|---|---|---|---|
| `users_db.login_attempts` | `prviPokusaj` | 15 min | relativno |
| `trips_db.search_stats` | `zabelezeno` | 90 dana | relativno |
| `booking_db.bookings` | `expiresAt` | +1 h, samo PENDING | apsolutno + zadrška, parcijalno |
| `notifications_db.notifications` | `expiresAt` | 0 (7 / 30 dana u polju) | apsolutno |
| `notifications_db.notification_logs` | `timestamp` | 90 dana | relativno |
| `admin_db.audit_logs` | `timestamp` | 90 dana | relativno |
| `admin_db.system_stats` | `timestamp` | 180 dana | relativno |
| `integration_db.*_cache` (6) | `createdAt` | 15 min – 30 dana | relativno |
| `orchestrator_db.plan_sessions` | `expiresAt` | 0 (24 h / 7 dana u polju) | apsolutno |

Obrazac „TTL 0 nad apsolutnim datumom" (notifications, plan_sessions)
koristi se kada isti dokument ima različit rok zavisno od ishoda.

**Parcijalni jedinstveni indeksi:** `bookings.aktivnaZaPutovanje` i
`notifications.dedupeKey` — oba sa `{ $type: 'string' }`, jer `sparse` ne
preskače polje postavljeno na `null`. Jedini `sparse` indeks je
`users.phone.number` (tamo polje zaista izostaje).

**Suvišni jednostavni indeksi.** Više kolekcija ima jednostavan indeks koji
je prefiks složenog na istim poljima, pa ga MongoDB ne mora koristiti:
`trips.userId`, `attractions.gradId`, `destinations.istaknuta`,
`interest_categories.aktivna`, `search_stats.gradId`, `bookings.userId`,
`notifications.recipient.userId`, `notifications.status`,
`audit_logs.action`, `audit_logs.adminId`. Nisu greška (samo trošak pri
upisu); nastali su iz `index: true` na polju uz kasnije dodat složeni indeks.

**Indeksi bez upita u `src/`:** `airports.drzava`, `airports.tip`
(servis čita aerodrom samo po `_id`), `cities.drzava` (koristi ga samo
probna skripta). Upit `cities` po IATA kodu (`iataGrada` /
`aerodromi.iata`) nema indeks — radi punim pregledom, što je pri
~desetinama hiljada gradova prihvatljivo, ali je kandidat za indeks.

**`attraction_details_cache` van održavanja.** Kolekcija nije u spisku
`ttlIndeksi.js` (promena `CACHE_TTL_ATTRACTION_DETAILS` se ne bi primenila
na postojeći indeks) niti u ruti `POST /cache/clear` (ne prazni se sa
ostalim kešom). Stvarni TTL je trenutno ispravan (2 592 000 s).

**Kolekcija bez modela:** `booking_db.payments` (v. §1) — može se obrisati
ručno; kod je ne koristi.

---

## 10. POREĐENJE SA SPECIFIKACIJOM (§9 „Model podataka")

Specifikacija §9 navodi sedam kolekcija; §7 navodi tri baze (`users_db`,
`trips_db`, `integration_db`). Kod ima sedam baza i 22 kolekcije sa modelom.

| Kolekcija iz spec | Stanje u kodu | Napomena / odstupanje |
|---|---|---|
| `users` — id, ime, prezime, email, korisnickoIme, lozinkaHash, uloga, status | `users_db.users` ✔ | Polje se zove `lozinka` (sadrži bcrypt heš, `select: false`). Dodato: `tokenVersion`, `phone.*` (SMS potvrda), `createdAt/updatedAt`. Enum vrednosti uloge i statusa se poklapaju. |
| `trips` — id, korisnikId, polaziste, odrediste, datumOd, datumDo, brojPutnika, budzet, preferencije, let, smestaj, plan, trosak, rezervacija, status | `trips_db.trips` ✔ (drugi nazivi) | `userId`, `from`/`to` + `fromCity`/`toCity`, `date`/`checkIn`/`checkOut`, `passengers` (+ `guests`), `budget`, `preferences`. Let, smeštaj, plan (dani → aktivnosti) i trošak nisu zasebna polja nego delovi `itinerary` (Mixed, kopija u trenutku izbora — kako spec i traži). „Rezervacija" je `bookingInfo`, a sama rezervacija živi u zasebnoj `booking_db.bookings` (spec §7 je stavlja u Trip Service). Statusi `NACRT/REZERVISANO/OTKAZANO/ZAVRSENO` odgovaraju §4.9. |
| `destinations` — id, naziv, drzava, opis, slika, istaknuta, redosled | `trips_db.destinations` ✔ (normalizovano) | Naziv i država se ne čuvaju — samo `gradId` (referenca na `cities`) i opcioni `naslov`; ostalo se poklapa. `gradId` je jedinstven. |
| `attractions` — id, izvor (admin/eksterni), naziv, grad, lat, lng, kategorija, trajanjeMin, radnoVreme, cenaUlaznice | `trips_db.attractions` ✔ (delimično) | `izvor` je samo `admin` — eksterne atrakcije se ne upisuju ovde nego u `integration_db.attractions_cache`. `grad` → `gradId` + `gradNaziv`; `lng` → `lon`; `kategorija` → `kategorije` (niz). Dodato: `opis`, `slika`, `aktivna` (meko brisanje). |
| `interest_categories` — id, naziv, eksterneKategorije | `trips_db.interest_categories` ✔ (prošireno) | `_id` je string-ključ. Dodato: `opis`, `geoapifyKategorije`, `trajanjePoseteMin`, `radnoVreme`, `redosled`, `aktivna`. |
| `search_stats` — odrediste, datum, brojPretraga, brojSacuvanih | `trips_db.search_stats` ✔ | `odrediste` → `gradId`; `datum` je string `YYYY-MM-DD`. Dodato: `trazioci`/`cuvaoci` (zaštita od naduvavanja) i `zabelezeno` (TTL 90 dana). Jedinstven par (grad, dan). |
| `api_cache` — kljuc, provajder, odgovor, istice (TTL) | `integration_db`: šest `*_cache` kolekcija | Umesto jedne kolekcije — po jedna za vrstu podatka, jer svaka ima svoj TTL. `kljuc` → `queryKey`, `odgovor` → `data`; `provajder` se ne čuva (vrsta je određena kolekcijom); umesto polja `istice` TTL je relativan na `createdAt`. Trajanja prate §11 (15 min / 30 min / 7 dana) plus kurs, geokodiranje i detalji atrakcija. |
| — (nije u spec) | `users_db.login_attempts` | Zaštita od pogađanja lozinke. |
| — | `trips_db.cities`, `trips_db.airports` | Referentni podaci (GeoNames, OurAirports) za izbor grada i aerodroma. |
| — | `booking_db.bookings` | Rezervacija leta preko Duffel-a (spec §4.8) izdvojena u Booking Service. |
| — | `notifications_db.notifications`, `notification_logs`, `notification_templates` | Obaveštenja (spec §4.10) izdvojena u Notification Service. |
| — | `admin_db.audit_logs`, `admin_db.system_stats` | Revizioni trag i statistika administratora (spec §3.3). |
| — | `orchestrator_db.plan_sessions` | Sesije čarobnjaka i statistika planiranja. |

Zaključak: svih sedam kolekcija iz §9 postoji, uz preimenovana polja
(engleski nazivi ili reference umesto kopija) i jedno strukturno
odstupanje — `api_cache` je podeljen na šest kolekcija. Tabela §7
specifikacije (tri baze, rezervacija u Trip Service-u) ne odgovara više
stvarnoj podeli na sedam servisa sa bazom.
