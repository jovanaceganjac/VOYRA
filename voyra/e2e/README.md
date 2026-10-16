# Selenium end-to-end testovi

Petnaest scenarija koji prolaze kroz aplikaciju kao korisnik — pravim
pretraživačem, preko pravog frontenda i pravog backenda.

## Pokretanje

Potreban je pokrenut stek (devet servisa + frontend) i **Chrome** na
mašini. ChromeDriver pribavlja Selenium Manager, pa se ništa ne preuzima
ručno.

```bash
cd voyra/e2e
npm install

npm test              # zatvoren (headless) režim
npm run test:vidljivo # otvara prozor pretraživača
npm run test:izvestaj # isto, uz JSON izveštaj u izvestaj/mocha.json
```

Jedan scenario:

```bash
npx mocha --config .mocharc.json --grep "8\."
```

### Testovi traže mock režim

Scenariji 8 i 9 granične slučajeve iz §4.8 izazivaju nastavkom oznake
ponude (`_pricechange`, `_expired`), a to razume samo mock adapter. Uz
upisan `DUFFEL_API_KEY` te oznake ne postoje kod Duffel-a, pa ta dva
scenarija padaju sa `410`. Zato se E2E pokreće nad stekom u **mock
režimu** — takav ga podiže `npm run test:sve` iz `voyra/`.

Ručno, nad razvojnim stekom:

```bash
cd ../backend_Node/integration-service
DUFFEL_API_KEY= LITEAPI_API_KEY= GEOAPIFY_API_KEY= node src/index.js
```

## Podešavanja

Sve preko promenljivih okruženja (`podesavanja/konfiguracija.js`):

| Promenljiva | Podrazumevano | Šta znači |
|---|---|---|
| `E2E_FRONTEND_URL` | `http://localhost:4200` | adresa frontenda |
| `E2E_API_URL` | `http://localhost:4000` | adresa API Gateway-a |
| `E2E_VIDLJIVO` | — | `true` otvara prozor pretraživača |
| `E2E_CEKANJE_MS` | 20000 | koliko se najduže čeka na uslov |
| `E2E_CEKANJE_PLAN_MS` | 60000 | duže čekanje za planiranje i rezervaciju |
| `E2E_OPOZIV_MS` | 40000 | koliko se čeka da opoziv tokena deluje |
| `E2E_IZVESTAJ_DIR` | `izvestaj` | snimci ekrana i HTML pri padu |
| `E2E_PREUZIMANJA_DIR` | `izvestaj/preuzimanja` | gde Chrome spušta PDF potvrdu |

Testni stek iz Dela 5 postavlja `TOKEN_VERSION_CACHE_MS=0`, pa opoziv
tokena deluje odmah i scenariji 11 i 12c prolaze brzo. Nad razvojnim
stekom sa kešom od 30 s traju oko pola minuta svaki.

## Kako je napisano

- **Page Object**: jedna klasa po stranici u `stranice/`. Testovi ne znaju
  ni jedan selektor.
- **Selektori su samo `data-testid`.** Nijedan test ne traži element po CSS
  klasi ili tekstu — osim kada je tekst ono što se proverava (poruka o
  grešci, naslov destinacije).
- **Nema `sleep`.** Svako čekanje je uslov (`until.elementLocated`,
  `elementIsVisible`, sopstveni uslovi u `cekajUslov`). Na sporijoj mašini
  test duže čeka, ne pada.
- **Stanje se postavlja preko API-ja** (`podesavanja/api.js`), ne kroz UI.
  Klikanje kroz registraciju pre svakog scenarija bilo bi i sporo i krhko:
  pad u pripremi oborio bi test koji proverava nešto drugo. Kroz UI ide
  samo ono što scenario zaista proverava.
- **Svaki test je nezavisan** — pravi svoj nalog i svoje putovanje i briše
  ih na kraju. Može se pokrenuti sam.
- **Pad ostavlja dokaz**: `izvestaj/<naziv-testa>.png` i `.html`
  (`podesavanja/pad.js`). Folder nije u git-u.

## Scenariji

| # | Šta proverava | Fajl |
|---|---|---|
| 1 | registracija → „čeka odobrenje" → prijava odbijena → admin odobrava → obaveštenje `REGISTRATION_APPROVED` → prijava radi | `01-nalog.spec.js` |
| 2 | 5 pogrešnih lozinki → poruka sa vremenom čekanja, dugme zaključano, tačna lozinka dobija 429 | `01-nalog.spec.js` |
| 3 | čarobnjak kao gost: grad **samo tastaturom**, intenzivan tempo, promena prioriteta menja preporučeni let, filter „Hostel", Booking.com link, satnica, prvi dan posle sletanja, ručak | `02-carobnjak.spec.js` |
| 4 | gost čuva plan → prijava → putovanje ima **isti** `offerId` i cenu | `02-carobnjak.spec.js` |
| 5 | osvežavanje na koraku 3 zadržava parametre, izbor leta i preferencije | `02-carobnjak.spec.js` |
| 6 | premeštanje aktivnosti u drugi dan preživi čuvanje i osvežavanje | `03-izmena.spec.js` |
| 6b | „Optimizuj redosled" ne povećava kilometražu i ne menja sastav dana | `03-izmena.spec.js` |
| 6c | aktivnost koja ne staje u dan dobija oznaku, ali **nije izbačena** | `03-izmena.spec.js` |
| 7 | dve sesije, izmena u obe → druga dobija poruku o konfliktu verzije | `03-izmena.spec.js` |
| 8 | promenjena cena zaključava „Dalje"; ćirilično ime i prazan pol se odbijaju, srpska latinica prolazi; PNR; **PDF na disku** (> 0 bajtova, počinje sa `%PDF`); status REZERVISANO | `04-rezervacija.spec.js` |
| 9 | istekla ponuda se osvežava i tok se nastavlja | `04-rezervacija.spec.js` |
| 10 | REZERVISANO → „Otkaži putovanje" → OTKAZANO (i u bazi) | `04-rezervacija.spec.js` |
| 11 | promena lozinke: sopstvena sesija ostaje, **druga se odjavljuje** | `05-admin-i-prikaz.spec.js` |
| 12 | nova istaknuta destinacija je na početnoj i vodi u čarobnjak | `05-admin-i-prikaz.spec.js` |
| 12b | atrakcija administratora ulazi u plan sa oznakom „Preporuka Voyre" | `05-admin-i-prikaz.spec.js` |
| 12c | blokiran korisnik se odjavljuje pri sledećem zahtevu | `05-admin-i-prikaz.spec.js` |
| 13 | `/admin` kao korisnik → `/`; `/moja-putovanja` kao gost → prijava sa `returnUrl` | `01-nalog.spec.js` |
| 14 | 360×740: nema horizontalnog skrola ni na jednoj stranici | `05-admin-i-prikaz.spec.js` |
| 15 | `/docs` na gateway-u se učitava i sadrži `/v1/plan` | `05-admin-i-prikaz.spec.js` |

Scenariji 6 i 12 su razbijeni na `a/b/c` zato što svaki od njih proverava
odvojeno pravilo; tako pad tačno kaže koje pravilo je prekršeno.
