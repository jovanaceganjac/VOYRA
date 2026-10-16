# Voyra — Mikroservisna aplikacija za planiranje putovanja

Diplomski rad. Sistem generiše personalizovane planove putovanja (letovi,
smeštaj, atrakcije raspoređene po danima), omogućava rezervaciju i
obaveštava korisnike email-om i SMS-om. Interfejs je dvojezičan (srpski / engleski).

## Brzi start

Potreban je **Node.js 18+** i **MongoDB 6+** na `localhost:27017` (lokalna
instalacija ili `docker-compose up -d` iz ovog foldera).

Sve komande se pokreću iz foldera `voyra/`, po ovom redu:

```bash
npm run install-all                  # 1. zavisnosti svih servisa i frontenda

for d in backend_Node/*-service backend_Node/api-gateway; do \
  cp "$d/.env.example" "$d/.env"; done   # 2. podešavanja iz primera

npm run proba:env                    # 3. provera da primeri pokrivaju sve promenljive

cd backend_Node/trip-service
npm run import:gradovi               # 4. gradovi i aerodromi (traje ~1 min)
npm run seed:kategorije              # 5. šest kategorija interesovanja
npm run seed:destinacije             # 6. pet istaknutih destinacija
cd ../user-service && npm run seed:demo   # 7. demo nalozi
cd ../..

npm run dev                          # 8. svih 9 servisa + Angular na 4200
```

Aplikacija je zatim na **http://localhost:4200**.

Koraci 4–7 su potrebni samo pri prvom pokretanju; sve te skripte su
idempotentne, pa ponovno pokretanje ne pravi duplikate. Više o njima u
odeljku [Uvoz i seed](#uvoz-i-seed--redosled-je-bitan).

**Bez ijednog spoljnog ključa sve radi u demo režimu** — vrednosti iz
`.env.example` su takve da aplikacija odmah radi. `JWT_SECRET` i
`INTERNAL_API_KEY` u primerima su razvojni placeholderi, isti u svim
servisima; **moraju ostati isti** ako se menjaju, i menjaju se pre svakog
izlaganja aplikacije van lokalne mašine.

Ako želiš odvojene terminale:

```bash
npm run start-all       # samo backend (9 servisa)
npm run start-frontend  # samo Angular dev server
```

Frontend ne zna za portove pojedinačnih servisa — `proxy.conf.json`
prosleđuje `/api` i `/v1` na API Gateway (4000).

## Demo nalozi

Prva dva naloga pravi skripta, iz foldera `backend_Node/user-service`:

```bash
npm run seed:demo
```

Nalozi postoje samo za **lokalni rad i odbranu**; u pravom okruženju se
brišu (iz panela `/admin/korisnici`) i zamenjuju stvarnim korisnicima.

| Korisničko ime | Lozinka | Uloga | Čemu služi |
|---|---|---|---|
| `demo` | `VoyraDemo1!` | korisnik | prolaz kroz čarobnjak, čuvanje i izmena plana |
| `demo_admin` | `VoyraDemo1!` | administrator | admin panel |
| `voyra_admin` | `Admin1234!` | administrator | razvojni nalog |

> Lozinke stoje ovde jer su nalozi namenjeni **samo** lokalnom radu i ne
> daju pristup ničemu izvan ove mašine. Nijedna prava tajna (`*_API_KEY`,
> `JWT_SECRET`, `INTERNAL_API_KEY`) nije u repozitorijumu — one su u
> `.env` fajlovima, koje `.gitignore` izostavlja.

Novi nalog otvoren kroz `/registracija` je u statusu `na_cekanju` dok ga
administrator ne odobri u `/admin/zahtevi`; korisnik u oba slučaja dobija
e-poruku (u razvoju se ispisuje u log Notification Service-a).

### Poznato ponašanje: promena naloga odjavljuje sesije

Token nosi ulogu i verziju (`tv`). Kada se promeni **lozinka, uloga ili
status** naloga, sve ranije izdate sesije prestaju da važe i korisnik
vidi poruku „Sesija je istekla ili je nalog promenjen. Prijavite se
ponovo.".

To znači i da se korisnik **posle promene uloge mora prijaviti ponovo**
da bi dobio token sa novom ulogom — unapređenje u administratora ne
dejstvuje na već otvorenu sesiju.

Gateway proverava opoziv sa kešom od **30 sekundi**, pa promena deluje
najkasnije toliko posle. Jedini izuzetak je promena sopstvene lozinke:
tu korisnik odmah dobija nov token i ostaje prijavljen.

## Servisi i portovi

| Servis | Port | Baza | Uloga |
|---|---|---|---|
| **API Gateway** | 4000 | — | Ulazna tačka, JWT validacija, rutiranje |
| **User Service** | 4001 | `users_db` | Registracija, prijava, JWT, telefon za SMS obaveštenja (bez SMS potvrde) |
| **Trip Service** | 4002 | `trips_db` | Čuvanje i upravljanje putovanjima |
| **Integration Service** | 4003 | `integration_db` | Amadeus / Booking.com adapteri, keš sa TTL |
| **Planner Service** | 4004 | — (stateless) | 5-fazni algoritam: rangiranje → izbor → k-means++ → 2-opt |
| **Admin Service** | 4005 | `admin_db` | Upravljanje korisnicima, audit log, statistika |
| **Booking Service** | 4006 | `booking_db` | Rezervacija letova i smeštaja, plaćanje, PDF potvrde |
| **Notification Service** | 4007 | `notifications_db` | Email i SMS notifikacije, queue sa retry |
| **Orchestrator Service** | 4008 | `orchestrator_db` | Jedinstveni `/v1` API za frontend |
| Frontend (Angular) | 4200 | — | Korisnički interfejs |
| MongoDB | 27017 | — | Baza |

## Glavni tok

```
Frontend ──► API Gateway (4000) ──► Orchestrator (4008)
                                         │
              ┌──────────────────────────┼───────────────────────┐
              ▼                          ▼                       ▼
        Planner (4004)           Booking (4006)          Trip (4002)
              │                                                  │
              ▼                                                  ▼
      Integration (4003)                                Notification (4007)
      Amadeus / Booking.com / keš / mock                         │
                                         ▼
                                   Admin (4005) — audit
```

## Jedinstveni API (`/v1`)

Frontend poziva samo ove rute; orchestrator spaja ostale servise.

```bash
# Planiranje kao gost
curl -X POST http://localhost:4000/v1/plan \
  -H "Content-Type: application/json" \
  -d '{"from":"BEG","to":"ATH","checkIn":"2026-10-15","checkOut":"2026-10-20","passengers":2,"budget":1500}'

# Planiranje sa čuvanjem putovanja (zahteva JWT)
curl -X POST http://localhost:4000/v1/plan \
  -H "Authorization: Bearer $TOKEN" -H "X-Save-Trip: true" \
  -H "Content-Type: application/json" -d '{...}'

curl http://localhost:4000/v1/plan/PSN_...    # sačuvana sesija (24 h)
curl http://localhost:4000/v1/health          # stanje svih servisa
curl http://localhost:4000/v1/stats -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Postojeći API (`/api`)

Rute po servisima i dalje rade — orchestrator je dodatni sloj, ne zamena.

```
POST /api/users/register | /api/users/login        GET /api/users/profile | /api/users/me
POST /api/trips/plan | /api/trips                  GET /api/trips | /api/trips/:id
POST /api/bookings | /api/bookings/:id/pay | /confirm    PATCH /api/bookings/:id/cancel
GET  /api/notifications | /api/notifications/stats
GET  /api/admin/users | /api/admin/stats | /api/admin/logs    (JWT + uloga admin)
```

## Provera da sve radi

```bash
for p in 4000 4001 4002 4003 4004 4005 4006 4007 4008; do
  curl -s http://localhost:$p/health; echo
done
```

## Dokumentacija API-ja (`/docs`)

Svaki servis izlaže svoju OpenAPI 3.0 šemu:

| Servis | Swagger UI | Sirova šema |
|---|---|---|
| API Gateway (**javni API**) | `http://localhost:4000/docs` | `/docs/openapi.json` |
| User Service | `http://localhost:4001/docs` | `/docs/openapi.json` |
| Trip Service | `http://localhost:4002/docs` | `/docs/openapi.json` |
| Integration Service | `http://localhost:4003/docs` | `/docs/openapi.json` |
| Planner Service | `http://localhost:4004/docs` | `/docs/openapi.json` |
| Admin Service | `http://localhost:4005/docs` | `/docs/openapi.json` |
| Booking Service | `http://localhost:4006/docs` | `/docs/openapi.json` |
| Notification Service | `http://localhost:4007/docs` | `/docs/openapi.json` |
| Orchestrator Service | `http://localhost:4008/docs` | `/docs/openapi.json` |

Za pregled je dovoljan **gateway**: on dokumentuje ceo javni API koji
frontend koristi. Ostali su korisni kada se gleda pojedinačan servis, i
označavaju interne rute šemom `internalKey`.

`DOCS_ENABLED=false` u `.env`-u servisa gasi `/docs`. Podrazumevano je
uključeno, jer je u razvoju i na odbrani upravo to ono što treba videti;
u pravom okruženju se gasi, da se javno ne izlaže spisak ruta.

Šeme se ne pišu ručno:

```bash
npm run openapi          # regeneriše openapi.yaml iz Express rutera
npm run proba:openapi    # validnost šema + pokrivenost ruta u oba smera
```

## Stranice frontenda

| Putanja | Pristup | Šta radi |
|---|---|---|
| `/` | svi | Početna sa brzom pretragom |
| `/registracija`, `/prijava` | gosti | Nalog se otvara sa statusom `na_cekanju` — prijava radi tek kada ga admin odobri |
| `/planiranje` | svi | `POST /v1/plan`: rangirani letovi i smeštaj, plan po danima, trošak; prijavljeni mogu da sačuvaju |
| `/moja-putovanja` | prijavljeni | Lista sačuvanih putovanja, prikaz plana, preimenovanje, brisanje |
| `/profil` | prijavljeni | Lični podaci, broj telefona i SMS obaveštenja (broj se ne potvrđuje SMS kodom) |
| `/admin` | admin | Panel po odeljcima: pregled, zahtevi za registraciju, korisnici, istaknute destinacije, atrakcije, kategorije interesovanja i statistika sa revizionim zapisima |

## Destinacije

Odredište može da bude **bilo koji grad u Evropi**: baza nosi **20.229
gradova i 531 aerodrom iz 50 država**. Ranije su postojala dva ručno
pisana spiska od 148 gradova (`cityCodes.js` i `gradovi.ts`) koja su
morala da ostanu usaglašena — oba su obrisana.

### Izvori i licence

| Šta | Izvor | Licenca | Obaveza |
|---|---|---|---|
| Gradovi (naziv, država, koordinate, broj stanovnika) | [GeoNames](https://www.geonames.org/) `cities5000` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | **navođenje je obavezno** — stoji u podnožju aplikacije |
| Aerodromi (IATA kod, naziv, koordinate, tip) | [OurAirports](https://ourairports.com/data/) `airports.csv` | javni domen | navođenje nije obavezno, ali stoji uz GeoNames |

Srpski nazivi (148 gradova) preuzeti su iz ranijeg `gradovi.ts` — ne
izmišljaju se. Grad bez srpskog naziva prikazuje se lokalnim nazivom.
Uvoz ih dodeljuje preko opštine aerodroma, pa ih 143 nađe par; pet
gradova (npr. ostrva bez sopstvenog aerodroma) ostaje bez para.

### Uvoz i seed — redosled je bitan

Sve skripte se pokreću iz `backend_Node/trip-service` i sve su
**idempotentne**, pa drugo pokretanje ne pravi duplikate.

```bash
cd backend_Node/trip-service

npm run import:gradovi      # 1. gradovi i aerodromi (obavezno prvo)
npm run migrate:gradovi     # 2. samo ako ima putovanja sačuvanih pre uvoza
npm run seed:kategorije     # 3. šest kategorija interesovanja
npm run seed:destinacije    # 4. pet istaknutih destinacija

cd ../user-service
npm run seed:demo           # 5. demo nalozi `demo` i `demo_admin`
```

**Zašto tim redom:**

1. `import:gradovi` skida GeoNames i OurAirports, poveže aerodrome sa
   gradovima i upiše ih u `trips_db`. `_id` je `geonameId` odnosno IATA
   kod. Preuzeti fajlovi idu u `trip-service/data/` i nisu u
   repozitorijumu.
2. `migrate:gradovi` popunjava `fromCity`/`toCity` za putovanja sačuvana
   pre uvoza — traži gradove po IATA kodu, pa mora **posle** uvoza.
3. `seed:kategorije` čita vrednosti iz
   `planner-service/src/config/preferencije.js`, pa su po definiciji
   identične dosadašnjim konstantama, i na kraju to i proveri.
   Sa `-- --force` vraća kategorije na početne vrednosti.
4. `seed:destinacije` bira gradove po IATA kodu i traži slike sa
   Wikipedije, pa traži i uvezene gradove i vezu ka internetu. Popularne
   destinacije se **ne** seed-uju — one nastaju korišćenjem, pa bi
   unapred upisani brojevi bili izmišljena statistika.
5. `seed:demo` pravi naloge `demo` i `demo_admin` iz odeljka
   [Demo nalozi](#demo-nalozi), oba u statusu `odobren`, jer nalog
   `na_cekanju` ne može da se prijavi.

### Koliko je uvezeno

Deset država sa najviše aerodroma (ceo spisak ispisuje `npm run proba:gradovi`):

| Država | Gradova | Aerodroma |
|---|---:|---:|
| Turska | 880 | 51 |
| Francuska | 2.076 | 46 |
| Španija | 1.483 | 42 |
| Italija | 2.033 | 41 |
| Ujedinjeno Kraljevstvo | 1.915 | 40 |
| Norveška | 120 | 40 |
| Švedska | 281 | 34 |
| Nemačka | 3.080 | 29 |
| Grčka | 284 | 25 |
| Finska | 343 | 20 |
| **Ukupno (50 država)** | **20.229** | **531** |

Broje se samo aerodromi sa **redovnim linijama** (`scheduled_service=yes`
u OurAirports-u), pa mala sletišta ne ulaze. Šest država nema nijedan
takav aerodrom: **Ukrajina** (vazdušni prostor zatvoren za civilni
saobraćaj), **Lihtenštajn, San Marino, Andora, Monako i Vatikan** (nemaju
svoj aerodrom).

Njihovi gradovi su ipak u bazi i mogu da budu odredište kada je aerodrom
susedne države u dometu: Monako preko NCE (19 km), Vatikan preko CIA
(16 km), Andora preko LEU (21 km), Vaduz preko ACH (38 km), Lavov preko
RZE (146 km). Kijev nema nijedan aerodrom u krugu od 150 km, pa nosi
oznaku `bezLeta` — plan se za njega pravi bez leta.

### Obuhvat i kako se menja

Spisak država je u `trip-service/src/config/evropa.js`
(`EVROPA_DRZAVE`, ISO-2 → srpski naziv države). Dodavanje ili uklanjanje
države je izmena tog spiska i ponovno pokretanje uvoza.

Rusija i Belorusija su **izostavljene**: od 2022. nema redovnih letova iz
EU, pa bi ponude bile besmislene. Turska i Kipar su **uključeni** —
redovno se lete i uobičajeno se vode kao evropske destinacije.

### Grad i aerodrom nisu isto

- grad sa više aerodroma (London, Pariz, Milano…) traži let preko **koda
  grada** (`LON`, `PAR`, `MIL`), pa pretraga pokriva sve njegove aerodrome;
- grad bez sopstvenog aerodroma (Bled, Kotor…) leti do najbližeg u krugu
  od 150 km, a put od aerodroma do grada ulazi u prvi i poslednji dan;
- dalje od 150 km nema leta — plan se pravi bez njega.

## Spoljni API-ji i simulacija

Izbor servisa prati specifikaciju §5. Skyscanner i Booking.com daju
pristup API-ju samo komercijalnim partnerima, a **Amadeus je 17. 7. 2026.
ugasio besplatni portal za programere** — zato su izabrani servisi sa
otvorenim test režimom.

| Namena | Servis | Ključ | Keš |
|---|---|---|---|
| Letovi (pretraga, rezervacija, otkazivanje) | Duffel | `DUFFEL_API_KEY` | 15 min |
| Smeštaj (pretraga) | LiteAPI | `LITEAPI_API_KEY` | 30 min |
| Rezervacija smeštaja | Booking.com — **samo link** | nema | — |
| Atrakcije | Geoapify Places | `GEOAPIFY_API_KEY` | 7 dana |
| Atrakcije (rezerva) | OpenTripMap | `OPENTRIPMAP_API_KEY` | 7 dana |
| Kursna lista | Frankfurter (ECB) | nema | 24 h |
| Geokodiranje | Nominatim (OSM) | nema | 30 dana |

**Svi spoljni pozivi idu isključivo kroz Integration Service.** Nijedan
drugi servis nema ključ spoljnog API-ja — ni Booking Service, koji
rezervaciju kreira preko internih ruta Integration Service-a.

## Dvojezičnost (srpski / engleski)

Jezik se bira dugmetom **SR | EN** u zaglavlju (vidljivo i na telefonu) i
pamti se u pregledaču. Promena važi odmah za ceo interfejs, bez
osvežavanja stranice.

- Rečnici su u `frontend/src/app/core/i18n/recnici/<jezik>/*.ts`, po
  oblastima; srpski je izvorni i određuje ključeve, a tip `Recnik` tera
  kompajler da prijavi svaki ključ koji drugom jeziku nedostaje.
- Šabloni koriste pipe `t` (`{{ 'nav.pocetna' | t }}`), kod `prevedi()`.
- Poruke koje šalju servisi (na srpskom) prevode se u
  `recnici/server-en.ts`; nepoznata poruka ostaje u originalu.
- **Novi jezik:** kod u `JEZICI` (`core/i18n/jezik.ts`), rečnici u
  `recnici/<kod>/` i unos u `RECNICI` (`core/i18n/prevod.ts`).

Bez ključeva sistem radi u **simulaciji**: podaci dolaze iz `mock_data/`,
a e-pošta i SMS se ispisuju u konzolu. Polje `source` u odgovoru uvek
pokazuje odakle podatak potiče (`duffel`, `liteapi`, `geoapify`,
`opentripmap`, `frankfurter`, `nominatim`, `cache`, `mock`,
`mock-fallback`).

**Demo podaci pokrivaju samo rutu Beograd → Atina.** Za svaku drugu
destinaciju plan se generiše, ali bez ponuda — stranica to i kaže.

### Uključivanje pravih podataka

Ključevi se upisuju u `backend_Node/integration-service/.env` i nikada ne
napuštaju backend:

| Servis | Gde se dobija |
|---|---|
| Duffel | `duffel.com` — test mode, avio-kompanija `Duffel Airways (ZZ)` |
| LiteAPI | `liteapi.travel` — sandbox ključ počinje sa `sand_` |
| Geoapify | `myprojects.geoapify.com` — besplatni plan, 3.000 kredita dnevno (1 kredit na 20 mesta) |
| OpenTripMap | `opentripmap.io/product` — koristi se samo ako Geoapify ključ nije upisan |

**Duffel test token, korak po korak** (potreban za §4.8):

1. Napravi nalog na `duffel.com` i potvrdi email.
2. U kontrolnoj tabli ostani u **Test mode** (prekidač gore desno) — u
   test režimu se ništa ne kupuje i ne naplaćuje.
3. *Developers → Access tokens → Create token*, tip **Test**. Token
   počinje sa `duffel_test_`.
4. Upiši ga u `backend_Node/integration-service/.env`:

   ```
   DUFFEL_API_KEY=duffel_test_...
   ```

5. Restartuj Integration Service. Pretraga BEG→ATH tada vraća
   `source: "duffel"`, a rezervacije se vide u Duffel kontrolnoj tabli
   (Test mode).

Bez tokena sve radi na demo podacima — tok rezervacije je isti, samo je
kod rezervacije izmišljen.

**LiteAPI:** nalog na `liteapi.travel` → u kontrolnoj tabli sandbox ključ
(`sand_...`) → `LITEAPI_API_KEY=` u istom `.env`-u.

**Geoapify:** nalog na `myprojects.geoapify.com` → novi projekat → API
ključ (32 znaka, bez razmaka i navodnika) → `GEOAPIFY_API_KEY=`. Dok
ključ nije upisan, atrakcije dolaze iz OpenTripMap-a (ako je njegov
ključ upisan), pa iz demo podataka.

Sva tri ključa se proveravaju jednom komandom, `npm run proba:kljucevi`
(odeljak „Provera sa pravim ključevima").

Posle upisa ključeva restartuj Integration Service. Ako spoljni servis ne
odgovori, adapter se sam vraća na keš pa na demo podatke
(`source: "mock-fallback"`) — aplikacija ne puca.

### Rezervacija leta (spec §4.8)

```
provera ponude  ->  (potvrda nove cene)  ->  kreiranje  ->  REZERVISANO
```

Tok je potpun, ali **bez stvarne kupovine i naplate** — u test režimu se
plaća sa balansa kod avio-kompanije, pa simulacije plaćanja nema. Istekla
ponuda vraća `410`, promenjena cena `409` dok je korisnik ne potvrdi, a
više od 9 putnika `422` sa porukom da let treba rezervisati u više delova.

Otkazivanje putovanja (`PATCH /api/trips/:id/cancel`) prvo otkazuje
rezervaciju leta. Ako to ne uspe, status putovanja **ostaje** REZERVISANO
i vraća se greška — putovanje ne sme da piše OTKAZANO dok je let još
rezervisan. Smeštaj korisnik otkazuje sam na Booking.com-u.

### Statusi putovanja (spec §4.9)

`NACRT` → `REZERVISANO` → `ZAVRSENO`, uz `OTKAZANO` iz oba prva stanja.
Nedozvoljen prelaz vraća `409`. Putovanja sa prošlim datumom povratka
pozadinski posao svakog sata prebacuje u `ZAVRSENO`.

Prelazak sa starih vrednosti (`draft`/`saved`/`booked`):

```bash
cd backend_Node/trip-service && npm run migrate:statusi
```

### Provera bez ključeva

Adapteri se proveravaju nad lažnim serverom koji skripta sama podigne na
slobodnom portu i ugasi:

```bash
cd backend_Node/integration-service && npm run proba:adapteri
```

Ceo tok rezervacije, uz pokrenute servise (4002, 4003, 4006):

```bash
cd backend_Node/booking-service && npm run proba:rezervacija
```

Gradovi, pretraga, transfer i demo ponude (uz pokrenute servise i uvezenu
bazu gradova):

```bash
cd backend_Node/trip-service && npm run proba:gradovi
```

Administracija (odluka o registraciji, kategorije, atrakcije, destinacije):

```bash
cd backend_Node/admin-service && npm run proba:admin
```

Bezbednost (promena lozinke, opoziv tokena, ograničenje pokušaja) — traje
oko minut i po, jer čeka da istekne keš gateway-a:

```bash
cd backend_Node/user-service && npm run proba:bezbednost
```

Dokumentacija API-ja (validnost šema i pokrivenost ruta), iz korena
`voyra/`:

```bash
npm run proba:openapi
```

Podešavanja — da li `.env.example` svakog servisa pokriva svaku
promenljivu koju taj servis čita, i da u primerima nema prave tajne:

```bash
npm run proba:env
```

### Provera sa pravim ključevima

Pravi pozivi ka Duffel-u (pretraga BEG→ATH, rezervacija i otkazivanje u
test režimu), LiteAPI-ju (Atina, Porto) i Geoapify-ju (Atina, Porto,
Tromsø, Bled, sa slikama sa Wikipedije). Troši kvote, pa nije deo
`test:sve`; ključ koji nije upisan daje „PRESKOČENO":

```bash
npm run proba:kljucevi
```

## Sve `npm run` skripte

Iz korena `voyra/`:

| Skripta | Šta radi |
|---|---|
| `install-all` | instalira zavisnosti korena, svih 9 servisa i frontenda |
| `start-all` | pokreće svih 9 backend servisa |
| `start-frontend` | pokreće Angular dev server (4200) |
| `dev` | backend i frontend zajedno |
| `openapi` | regeneriše `openapi.yaml` iz Express rutera |
| `proba:openapi` | validnost šema i pokrivenost ruta u oba smera |
| `proba:env` | da li `.env.example` pokriva sve promenljive i nema pravih tajni |
| `proba:kljucevi` | pravi pozivi ka Duffel, LiteAPI i Geoapify (troši kvote) |
| `test:sve` | svi jedinični, integracioni i E2E testovi nad test bazama |

Po servisu (`cd backend_Node/<servis>`):

| Servis | Skripta | Šta radi |
|---|---|---|
| svih 9 | `test` / `test:pokrivenost` | jedinični testovi (`node --test`), odnosno sa pokrivenošću |
| integration-service | `proba:adapteri` | adapteri nad lažnim serverom koji skripta sama podiže |
| integration-service | `lazni-api` | lažni Duffel/LiteAPI/OpenTripMap/Wikipedia/Frankfurter/Nominatim za ručno gađanje |
| planner-service | `bench` | merenje vremena algoritma planiranja (spec §11: < 1 s) |
| trip-service | `import:gradovi` | uvoz gradova i aerodroma |
| trip-service | `migrate:gradovi` / `migrate:statusi` | migracija starih putovanja na gradove / nove statuse |
| trip-service | `seed:kategorije` / `seed:destinacije` | šest kategorija interesovanja / pet istaknutih destinacija |
| trip-service | `proba:gradovi` | gradovi, pretraga, transfer i demo ponude |
| user-service | `seed:demo` | demo nalozi `demo` i `demo_admin` |
| user-service | `proba:bezbednost` | promena lozinke, opoziv tokena, ograničenje pokušaja |
| admin-service | `proba:admin` | odluka o registraciji, kategorije, atrakcije, destinacije |
| booking-service | `proba:rezervacija` | ceo tok rezervacije |
| orchestrator-service | `proba:carobnjak` | koraci čarobnjaka i čuvanje prikazanog plana |
| orchestrator-service | `proba:izmena` | izmena plana, optimizacija dana, ponovno generisanje |

E2E (`cd e2e`): `test` (headless), `test:vidljivo` (sa prozorom),
`test:izvestaj` (uz JSON izveštaj). Frontend (`cd frontend`): `start`,
`build`, `watch`, `test`.

## Dokumentacija

- [ARCHITECTURE.md](../documentation/ARCHITECTURE.md) — arhitektura i komunikacija servisa
- [DATABASE_SCHEMA.md](../documentation/DATABASE_SCHEMA.md) — MongoDB kolekcije
- [TESTIRANJE.md](../documentation/TESTIRANJE.md) — strategija i rezultati testiranja
- [ALGORITHMS.md](../documentation/ALGORITHMS.md) — k-means++ i 2-opt
- [arhiva/](../documentation/arhiva/) — dokumenti iz početne faze (konvencije, plan u tri faze)
