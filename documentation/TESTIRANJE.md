# Testiranje sistema Voyra

---

## 1. Strategija

Testiranje je raspoređeno u tri nivoa. Svaki nivo proverava ono što niži
ne može.

| Nivo | Alat | Šta proverava | Zavisnosti |
|---|---|---|---|
| Jedinični | ugrađeni `node:test` + `node:assert/strict` (backend), Karma (frontend) | algoritmi i pravila izdvojeni iz I/O: optimizacija rute, validatori, prelazi statusa, transformacije odgovora spoljnih API-ja | bez mreže, bez baze, bez pokrenutih servisa |
| Integracioni (probe) | `proba:*` skripte po servisu, `proba:openapi`, `proba:env`, `proba:kljucevi` | tokovi preko više servisa nad pokrenutim stekom, ugovor API-ja (OpenAPI), podešavanja okruženja, pravi spoljni API-ji | pokrenut stek; `proba:kljucevi` i internet |
| End-to-end | `selenium-webdriver` + `mocha` (`voyra/e2e/`) | korisnički scenariji kroz pravi pretraživač, frontend i backend | pokrenut stek + frontend, Chrome |

Jedinični testovi u backendu ne koriste nijednu dodatnu zavisnost: u svih
devet servisa `npm test` je `node --test test/*.test.js`, a
`npm run test:pokrivenost` isto uz `--experimental-test-coverage`.
Ranije podešavanje `test: "jest"` je uklonjeno jer jest nije bio instaliran
nigde.

Pravila pisanja E2E testova (`voyra/e2e/README.md`):

- **Page Object** — jedna klasa po stranici u `e2e/stranice/`; testovi ne
  sadrže nijedan selektor.
- **Selektori su isključivo `data-testid`**, osim kada je tekst upravo ono
  što se proverava (poruka o grešci, naslov destinacije).
- **Nema `sleep`** — svako čekanje je uslov (`until.elementLocated`,
  `elementIsVisible`, `cekajUslov`).
- **Stanje se postavlja preko API-ja**, a kroz UI ide samo ono što scenario
  proverava.
- **Svaki test je nezavisan** — pravi i briše svoj nalog i putovanje.
- **Pad ostavlja dokaz** — snimak ekrana i HTML u `e2e/izvestaj/`.

---

## 2. Pokretanje

| Komanda | Gde | Šta radi |
|---|---|---|
| `npm run test:sve` | `voyra/` | svi testovi jednom komandom, nad test bazama (vidi ispod) |
| `npm run proba:kljucevi` | `voyra/` | provera pravih spoljnih API-ja sa ključevima iz `integration-service/.env`; odvojeno od `test:sve` jer zavisi od interneta i kvota |
| `npm run proba:openapi` | `voyra/` | provera OpenAPI opisa svih servisa |
| `npm run proba:env` | `voyra/` | provera podešavanja okruženja (u tabeli rezultata: „proba: podesavanja") |
| `npm test` / `npm run test:pokrivenost` | svaki servis u `backend_Node/` | jedinični testovi / isto uz merenje pokrivenosti |
| `npm test` | `voyra/e2e/` | Selenium E2E, zatvoren (headless) režim |
| `npm run test:vidljivo` | `voyra/e2e/` | E2E sa vidljivim prozorom pretraživača |
| `npm run test:izvestaj` | `voyra/e2e/` | E2E uz JSON izveštaj (`izvestaj/mocha.json`) |
| `npx mocha --config .mocharc.json --grep "8\."` | `voyra/e2e/` | jedan scenario |

### `test:sve` i baze

`scripts/test-sve.js` radi redom:

1. prekida ako su portovi 4000–4008 ili 4201 zauzeti (izlazni kod 2);
2. jedinični testovi svih devet servisa;
3. podiže servise nad `*_db_test` bazama, u **mock režimu** (svi spoljni
   ključevi prazni), sa `TOKEN_VERSION_CACHE_MS=0`, i čeka `/health`;
4. `import:gradovi`, `seed:kategorije`, `seed:destinacije`, `seed:demo`;
5. sve `proba:*` skripte, `proba:openapi` i `proba:env`;
6. frontend Karma (`--watch=false --browsers=ChromeHeadless`);
7. Selenium E2E nad `ng serve` na portu 4201;
8. gasi servise i **briše sve `*_test` baze**;
9. ispisuje tabelu rezultata i poređenje razvojnih baza.

**Razvojne baze se ne diraju.** Svaka adresa baze se postavlja izričito
sa sufiksom `_test`, a skripta broji zapise u svakoj razvojnoj bazi pre i
posle i ispisuje obe vrednosti. Izlazni kod je 0 samo ako sve prođe.

E2E se pokreće nad stekom u mock režimu jer scenariji 8 i 9 granične
slučajeve izazivaju oznakama ponude (`_pricechange`, `_expired`) koje
razume samo mock adapter.

---

## 3. Rezultati `npm run test:sve`

**1.294 provere, dva prolaza zaredom
bez ijednog pada, oba sa izlaznim kodom 0.**

| Skup | Provera | Prošlo | Palo | 1. prolaz | 2. prolaz |
|---|---:|---:|---:|---:|---:|
| jedinični: api-gateway | 18 | 18 | 0 | 1,5 s | 1,6 s |
| jedinični: user-service | 76 | 76 | 0 | 2,0 s | 2,1 s |
| jedinični: trip-service | 88 | 88 | 0 | 2,0 s | 2,1 s |
| jedinični: integration-service | 144 | 144 | 0 | 2,2 s | 2,5 s |
| jedinični: planner-service | 113 | 113 | 0 | 1,5 s | 1,6 s |
| jedinični: admin-service | 19 | 19 | 0 | 2,3 s | 2,5 s |
| jedinični: booking-service | 64 | 64 | 0 | 2,5 s | 3,0 s |
| jedinični: notification-service | 29 | 29 | 0 | 1,9 s | 2,4 s |
| jedinični: orchestrator-service | 45 | 45 | 0 | 1,3 s | 1,4 s |
| seed: uvoz gradova | — | — | 0 | 13,8 s | 18,5 s |
| seed: kategorije / destinacije / demo nalozi | — | — | 0 | 6,6 s | 7,6 s |
| proba: adapteri | 125 | 125 | 0 | 2,5 s | 2,8 s |
| proba: gradovi | 47 | 47 | 0 | 5,1 s | 5,6 s |
| proba: carobnjak | 47 | 47 | 0 | 3,1 s | 3,5 s |
| proba: izmena plana | 68 | 68 | 0 | 5,5 s | 6,7 s |
| proba: rezervacija | 47 | 47 | 0 | 2,8 s | 3,2 s |
| proba: admin | 52 | 52 | 0 | 2,9 s | 3,5 s |
| proba: bezbednost | 46 | 46 | 0 | 13,0 s | 13,6 s |
| proba: openapi | 63 | 63 | 0 | 11,6 s | 12,5 s |
| proba: podesavanja (`proba:env`) | — | — | 0 | 1,0 s | 1,1 s |
| frontend: Karma | 184 | 184 | 0 | 14,0 s | 17,2 s |
| e2e: Selenium | 19 | 19 | 0 | 93,9 s | 159,2 s |
| **UKUPNO** | **1.294** | **1.294** | **0** | **5,7 min** | **4,9 min** |

Zbirno po nivou (sabrano iz tabele iznad):

| Nivo | Provera |
|---|---:|
| jedinični backend (9 servisa) | 596 |
| probe (integracione) | 495 |
| frontend Karma | 184 |
| E2E Selenium | 19 |
| **Ukupno** | **1.294** |

---

## 4. Pokrivenost jediničnim testovima

Broj test fajlova je potvrđen pretragom
`backend_Node/*/test/*.test.js`.

| Servis | Test fajlova | Testova | Šta pokrivaju |
|---|---:|---:|---|
| integration-service | 4 | 144 | Duffel (ISO 8601 trajanje, cena ponude, povratni let), LiteAPI (ocena 0–10 → 0–5, tip smeštaja, `bookingUrl`), Geoapify (transformacija, popularnost, parser `opening_hours`, krediti), pravilo keša, demo podaci, rezervna tabela kurseva |
| planner-service | 5 | 113 | faze planiranja, Geoapify popularnost, 2-opt (otvorena putanja, fiksna polazna tačka), `Distances`, pravilo duplikata atrakcija |
| trip-service | 3 | 88 | prelazi statusa putovanja, normalizacija i pretraga gradova (dijakritika), Haversine, granica 50 km, skor popularnih destinacija |
| user-service | 4 | 76 | validator lozinke, validator telefona (E.164), prelazi statusa naloga, zaštita poslednjeg admina, `tokenVersion`, brojač pokušaja prijave |
| booking-service | 2 | 64 | izbor leta, validacija putnika (Duffel pravila), tolerancija cene, istekla ponuda |
| orchestrator-service | 2 | 45 | `validatePlanRequest`, otisak leta za osvežavanje ponude |
| notification-service | 1 | 29 | interpolacija šablona, HTML escape, skraćivanje SMS-a na 160 znakova, naslov bez preloma reda |
| admin-service | 1 | 19 | prosleđivanje tela greške, provera uloge (401 vs 403) |
| api-gateway | 1 | 18 | middleware opoziva tokena (poklapanje, keš, user-service nedostupan → 503, token bez `tv`) |
| **Ukupno** | **23** | **596** | |

Frontend ima **184** Karma testa.

### Pokrivenost linija u modulima sa algoritmom i pravilima

Cilj je bio **≥ 80 % linija** i dostignut je u svakom takvom modulu:

| Modul | Linije % | Grane % |
|---|---:|---:|
| `planner/utils/RouteOptimizer.js` | 100,00 | 100,00 |
| `planner/utils/Distances.js` | 100,00 | 100,00 |
| `planner/services/SpajanjeAtrakcija.js` | 100,00 | 86,49 |
| `planner/services/FazaLetovi.js`, `FazaRedosled.js` | 100,00 | 76–84 |
| `planner/services/FazaSmestaj.js` | 98,69 | 76,47 |
| `planner/services/FazaRaspodela.js` | 98,26 | 84,42 |
| `planner/services/FazaAtrakcije.js` | 98,24 | 73,68 |
| `planner/services/Dani.js` | 94,67 | 71,43 |
| `planner/utils/KMeans.js` | 88,89 | 86,84 |
| `planner/utils/preferencijeValidator.js` | 83,67 | 53,13 |
| `orchestrator/utils/validatePlanRequest.js` | 96,44 | 96,04 |
| `booking/utils/putniciValidator.js` | 100,00 | 100,00 |
| `user/config/lozinka.js`, `utils/jwt.js`, `utils/phoneValidator.js` | 100,00 | 100,00 |
| `user/config/statusi.js` | 98,43 | 90,00 |
| `trip/utils/normalizacija.js`, `models/Trip.js` | 100,00 | 100,00 |
| `gateway/middleware/opozivTokena.js` | 100,00 | 90,00 |
| `admin/middleware/auth.js` | 100,00 | 100,00 |
| `notification/services/TemplateEngine.js` | 100,00 | 87,50 |
| `integration/utils/ponude.js`, `bookingLink.js`, `demoGenerator.js`, `geoapifyKrediti.js` | 100,00 | 83–100 |
| `integration/utils/radnoVreme.js` | 97,50 | 89,47 |

### Gde 80 % nije dostignuto i zašto

Pokrivenost se meri po fajlu. U fajlovima gde transformacija stoji uz
mrežni poziv ili upit ka bazi, jedinični test pokriva transformaciju, a
ostatak pokriva odgovarajuća proba nad pokrenutim stekom.

| Modul | Linije % | Ostatak pokriva |
|---|---:|---|
| `DuffelFlightAdapter.js` | 43,31 | `proba:adapteri` (pretraga, kreiranje i otkazivanje narudžbine) |
| `LiteApiHotelAdapter.js` | 33,12 | `proba:adapteri` (dva lančana poziva ka LiteAPI-ju) |
| `GeoapifyPlacesAdapter.js` | 57,39 | mrežni `_uKrugu` i `fetch` |
| `PokusajiPrijave.js` (user) | 53,26 | `proba:bezbednost` (MongoDB TTL indeks) |
| `AtrakcijeService.js` (trip) | 36,95 | Mongoose upiti |
| `DestinacijeService.js` (trip) | 36,18 | agregacija popularnosti u MongoDB-u |
| `BookingService.js` | 25,84 | `proba:rezervacija` (tok prema tri servisa) |
| `FlightChangeService.js` (orchestrator) | 35,09 | pozivi Planner-u i Trip-u |

---

## 5. E2E scenariji

Izvor: `voyra/e2e/README.md`.
**15 scenarija / 19 testova, svi prolaze, dva prolaza zaredom.** Scenariji
6 i 12 su razbijeni na `a/b/c`, jer svaki deo proverava odvojeno pravilo,
pa pad tačno kaže koje je prekršeno.

| # | Šta proverava | Fajl |
|---|---|---|
| 1 | registracija → „čeka odobrenje" → prijava odbijena → admin odobrava → `REGISTRATION_APPROVED` → prijava radi | `01-nalog.spec.js` |
| 2 | 5 pogrešnih lozinki → poruka sa vremenom čekanja, dugme zaključano, tačna lozinka dobija 429 | `01-nalog.spec.js` |
| 3 | čarobnjak kao gost: grad samo tastaturom, tempo, promena prioriteta menja preporučeni let, filter „Hostel", Booking.com link, satnica, prvi dan posle sletanja, ručak | `02-carobnjak.spec.js` |
| 4 | gost čuva plan → prijava → putovanje ima isti `offerId` i cenu | `02-carobnjak.spec.js` |
| 5 | osvežavanje na koraku 3 zadržava parametre, izbor leta i preferencije | `02-carobnjak.spec.js` |
| 6 | premeštanje aktivnosti u drugi dan preživi čuvanje i osvežavanje | `03-izmena.spec.js` |
| 6b | „Optimizuj redosled" ne povećava kilometražu i ne menja sastav dana | `03-izmena.spec.js` |
| 6c | aktivnost koja ne staje u dan dobija oznaku, ali nije izbačena | `03-izmena.spec.js` |
| 7 | dve sesije → druga dobija poruku o konfliktu verzije | `03-izmena.spec.js` |
| 8 | promenjena cena zaključava „Dalje"; ćirilica i prazan pol se odbijaju, srpska latinica prolazi; PNR; PDF na disku (> 0 B, počinje sa `%PDF`); REZERVISANO | `04-rezervacija.spec.js` |
| 9 | istekla ponuda se osvežava i tok se nastavlja | `04-rezervacija.spec.js` |
| 10 | REZERVISANO → „Otkaži putovanje" → OTKAZANO (i u bazi) | `04-rezervacija.spec.js` |
| 11 | promena lozinke: sopstvena sesija ostaje, druga se odjavljuje | `05-admin-i-prikaz.spec.js` |
| 12 | nova istaknuta destinacija je na početnoj i vodi u čarobnjak | `05-admin-i-prikaz.spec.js` |
| 12b | atrakcija administratora u planu sa oznakom „Preporuka Voyre" | `05-admin-i-prikaz.spec.js` |
| 12c | blokiran korisnik se odjavljuje pri sledećem zahtevu | `05-admin-i-prikaz.spec.js` |
| 13 | `/admin` kao korisnik → `/`; `/moja-putovanja` kao gost → prijava sa `returnUrl` | `01-nalog.spec.js` |
| 14 | 360×740 bez horizontalnog skrola: početna, koraci 1–4, putovanje, admin pregled | `05-admin-i-prikaz.spec.js` |
| 15 | `/docs` na gateway-u se učitava i sadrži `/v1/plan` | `05-admin-i-prikaz.spec.js` |

Odstupanja od prvobitnog teksta scenarija (npr. u scenariju 6 demo skup za
Atinu nema noćni klub, pa je isto pravilo provereno nad aktivnostima
premeštenim u dan leta) opisana su u izveštaju, Deo 4.

---

## 6. Mock server naspram provere uživo

### Šta se proverava samo u mock režimu i zašto

`test:sve`, sve `proba:*` skripte (osim `proba:kljucevi`) i E2E rade u
**mock režimu** — spoljni ključevi su prazni, a integration-service vraća
determinističke demo podatke. Razlozi:

- **Ponovljivost.** Isti ulaz daje isti izlaz, pa dva prolaza zaredom
  moraju dati isti rezultat; pravi API-ji menjaju ponude, cene i
  dostupnost iz minuta u minut.
- **Granični slučajevi koje pravi API ne može da izazove na zahtev.**
  Promenjena cena i istekla ponuda (E2E scenariji 8 i 9, `proba:rezervacija`)
  izazivaju se nastavcima oznake ponude (`_pricechange`, `_expired`), koje
  razume samo mock adapter. Sa upisanim Duffel ključem te oznake ne postoje
  i provere padaju sa `410 OFFER_EXPIRED`.
- **Nezavisnost od interneta i kvota.** Testovi ne troše kvote i ne padaju
  zbog mreže.

Pored toga, mrežni delovi adaptera (`axios` pozivi ka Duffel-u, LiteAPI-ju,
Geoapify-ju) nisu pokriveni jediničnim testovima nego probom
`proba:adapteri` nad lažnim serverom (vidi tabelu u odeljku 4).

### Šta je provereno uživo — `npm run proba:kljucevi`

Skripta koristi iste adaptere kao
integration-service, ali zaobilazi keš, pa svaki korak zaista ide ka API-ju.
Ključ koji nije upisan daje „PRESKOČENO — ključ nije upisan"; ključevi se
nigde ne ispisuju. **Rezultat 28. 9. 2026: 10 OK, 0 PAD, 0 PRESKOČENO.**

| Izvor | Provereno uživo |
|---|---|
| Duffel (test režim) | pretraga BEG→ATH (5 ponuda) → ponovna provera ponude → narudžbina sa pravim `booking_reference` → otkazivanje potvrđeno od Duffel-a (povraćaj 59,21 EUR) |
| LiteAPI | Atina i Porto, +30 dana, 3 noći: po 5 hotela, tipovi, ocene i cene u opsegu |
| Geoapify + Wikipedia | Atina 111, Porto 116, Tromsø 116, Bled 94 atrakcije; interesovanja 5/6, 5/6, 6/6, 6/6 („Priroda" u krugu centra Atine i Porta nema); slika sa Wikipedije za sva četiri grada |

**Ograničenje.** „Osvežavanje ponude starije od 30 min" provereno je kao
ponovna provera iste ponude odmah (`GET /offers/:id`), bez čekanja 30
minuta; grananje po starosti ponude pokriveno je jediničnim testovima.

---

## 7. Greške koje su testovi pronašli

| Nivo | Greška | Ispravka |
|---|---|---|
| jedinični (Deo 3) | Parser `opening_hours` odbijao je „Mo-Su 09:00 - 17:00": tekst se razdvajao po prazninama pre nego što bi izraz za raspon dozvolio praznine oko crtice | praznine oko crtice se skidaju pre razdvajanja |
| jedinični (Deo 3) | `test: "jest"` u osam servisa, a jest nije instaliran nigde — `npm test` je padao | zamenjeno sa `node --test` |
| E2E (Deo 4, scenario 10) | Otkazivanje rezervisanog putovanja vraćalo je `502 FLIGHT_CANCEL_FAILED` (E11000 duplicate key): jedinstven indeks `aktivnaZaPutovanje` bio je `sparse`, a otkazana rezervacija ima polje postavljeno na `null`, pa je druga otkazana rezervacija u bazi padala | indeks je parcijalan (`partialFilterExpression: { $type: 'string' }`), a `Booking.syncIndexes()` pri povezivanju zamenjuje stari |
| E2E (Deo 4) | Nestabilnosti pri ponovnom iscrtavanju (`StaleElementReferenceError`), toast preko menija, skrivena najava za čitač ekrana | ponavljanje akcije, čekanje nestanka toast-a, čitanje iz DOM-a, novi `data-testid` atributi |
| `test:sve` (Deo 5) | „Test" stek je pisao u razvojne baze: kod je za adrese bez promenljive koristio ugrađenu razvojnu vrednost, pa su probe padale sa `401 TOKEN_REVOKED` | `test-sve.js` svaku adresu baze postavlja izričito; probni zapisi naknadno očišćeni iz razvojnih baza |
| `test:sve` (Deo 5) | `TOKEN_VERSION_CACHE_MS=0` nije gasio keš (`parseInt(...) \|\| 30_000` vraćao je 0 na 30 s), pa su E2E scenariji 11 i 12c padali | gateway prihvata 0; `proba:bezbednost` pala sa 99 s na 13 s |
| probe (Deo 3) | `proba:rezervacija` pada sa `410 OFFER_EXPIRED` kada je upisan pravi Duffel ključ (koristi izmišljene oznake ponuda) | nije regresija; zato test stek radi u mock režimu |

---

## 8. Merenje `POST /v1/plan` kraj-do-kraja (spec §11)

Izvor: `npm run merenje:plan` u `voyra/` (`scripts/merenje-plana.js`),
28. 9. 2026, razvojni stek sa pravim ključevima (Duffel test režim,
LiteAPI sandbox, Geoapify).

**Postupak.** Zahtev ide preko gateway-a (`http://localhost:4000/v1/plan`),
kao gost, bez čuvanja: polazak BEG, dolazak +30 dana, povratak +34 dana
(5 dana u gradu), 1 putnik, prioritet „balans", tempo „intenzivan",
interesovanja kultura i muzeji. Za svaku rutu po 3 merenja:

- **prazan keš** — pre merenja se prazne sve kolekcije `*_cache` u
  `integration_db` (uključujući `attraction_details_cache`, koju
  `POST /cache/clear` ne dira), pa letovi, smeštaj, atrakcije i detalji
  atrakcija zaista idu ka spoljnim API-jima;
- **topao keš** — isti zahtev odmah posle toga, bez pražnjenja.

Vreme je mereno na klijentu (od slanja do primljenog JSON-a). Mali keševi
u memoriji servisa (razrešeni gradovi u orchestrator-u, katalog kategorija
u planner-u, 60 s) nisu pražnjeni; oni ne pozivaju spoljne API-je.

| Ruta | Merenje | Prazan keš | Topao keš | Izvori (prazan → topao) |
|---|---:|---:|---:|---|
| BEG→ATH | 1 | 7,01 s | 0,08 s | duffel, liteapi, geoapify → cache |
| BEG→ATH | 2 | 7,80 s | 0,08 s | isto |
| BEG→ATH | 3 | 6,82 s | 0,08 s | isto |
| BEG→OPO | 1 | 9,07 s | 0,08 s | isto |
| BEG→OPO | 2 | 5,34 s | 0,08 s | isto |
| BEG→OPO | 3 | 4,75 s | 0,08 s | isto |
| **prosek** | | **ATH 7,21 s / OPO 6,39 s** | **0,08 s** | |

Svih 12 odgovora: HTTP 200, `status: READY`. Atrakcija po danu: Atina
0, 6, 5, 6, 0; Porto 0, 6, 6, 6, 0 (prvi i poslednji dan nemaju dovoljno
vremena posle sletanja, odnosno pre povratnog leta).

**Zahtev §11 je ispunjen:** najduže merenje sa praznim kešom je 9,07 s
(< 10 s), a sa toplim 0,08 s (< 2 s). Rezerva do 10 s je mala (najgore
merenje je 91 % granice) i zavisi od brzine spoljnih API-ja u trenutku
merenja, pa je to jedini nefunkcionalni zahtev čije ispunjenje nije
potpuno pod kontrolom sistema.

### Vreme samog algoritma (`npm run bench` u `planner-service`)

Ponovljeno 28. 9. 2026 (Node v22.21.0), 14 dana, tempo „intenzivan", 20
pokretanja faza 3–5 po veličini skupa.

| Atrakcija | Prosek | Najduže | Aktivnosti u planu |
|---:|---:|---:|---:|
| 10 | 1,2 ms | 2,5 ms | 9 |
| 25 | 3,7 ms | 5,9 ms | 19 |
| 50 | 8,2 ms | 16,1 ms | 39 |
| 75 | 13,5 ms | 19,1 ms | 59 |
| 100 | 16,1 ms | 23,1 ms | 66 |
| 150 | 16,7 ms | 25,9 ms | 70 |
| 200 | 16,1 ms | 23,9 ms | 73 |

Iznad ~100 atrakcija vreme se ne povećava: ciljni broj aktivnosti (14 ·
6 = 84) i raspoloživo vreme ograničavaju izbor u Fazi 3, pa faze 4 i 5
rade nad sličnim brojem izabranih atrakcija.
