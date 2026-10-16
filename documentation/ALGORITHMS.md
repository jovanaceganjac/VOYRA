# Algoritam planiranja putovanja

Ovaj dokument opisuje algoritam onako kako je **stvarno implementiran** u
`backend_Node/planner-service`. Svaka formula, težina i konstanta ovde
odgovara kodu; izvor istine za konstante je
[`src/config/preferencije.js`](../voyra/backend_Node/planner-service/src/config/preferencije.js).

Prati specifikaciju §6. Planner nema stanje i ne poziva spoljne servise —
podatke dobija od Integration Service-a preko tankih klijenata.

---

## Pregled

| Faza | Problem | Pristup | Složenost |
|---|---|---|---|
| 1. Rangiranje letova | Višekriterijumski izbor | Min-max normalizacija + ponderisana suma | O(f log f) |
| 2. Rangiranje smeštaja | Višekriterijumski izbor | Filtriranje + ponderisana suma | O(s log s) |
| 3. Izbor atrakcija | Izbor podskupa uz vremensko ograničenje | Pohlepni izbor po oceni | O(a log a) |
| 4. Raspodela po danima | Klasterovanje sa kapacitetom | k-means++ + rebalansiranje | O(n·k·i + n²·k) |
| 5. Redosled obilaska | TSPTW (NP-težak) | Najbliži sused + 2-opt | O(m³) po iteraciji 2-opt-a |

Ulaz u faze 3–5 su **preferencije** (§4.2), koje korisnik unosi za svako
putovanje posebno:

```js
{
  transportPriority: 'najjeftinije' | 'najbrze' | 'balans',   // 'balans'
  accommodationTypes: ['hotel', 'apartman', 'hostel'],        // sva tri
  minAccommodationRating: null | 1..5,                        // null
  interests: ['kultura','priroda','gastronomija',
              'nocni_zivot','soping','muzeji'],               // ['kultura','muzeji']
  pace: 'opusten' | 'umeren' | 'intenzivan',                  // 'umeren'
  dayStart: 'HH:MM',                                          // '09:00'
  dayEnd: 'HH:MM'                                             // '20:00'
}
```

Redosled izvršavanja u `TravelPlanner.plan()` nije isti kao numeracija
faza: **atrakcije (faza 3) se biraju pre smeštaja (faza 2)**, jer §6.1
traži da se smeštaj preporuči u okviru *preostalog* budžeta, a preostali
budžet zavisi od procene ulaznica.

---

## Faza 1 — Rangiranje letova (§6.1)

[`FazaLetovi.js`](../voyra/backend_Node/planner-service/src/services/FazaLetovi.js)

### Formula

```
score = w_c · c + w_t · t + p · brojPresedanja
```

- `c` — cena ponude, normalizovana na [0, 1]
- `t` — ukupno trajanje (odlazak + povratak), normalizovano na [0, 1]
- `brojPresedanja` — zbir presedanja u oba smera

**Manji skor je bolji.** Pri jednakom skoru prednost ima jeftinija ponuda.
Tačno jedna ponuda nosi `recommended: true`.

### Min-max normalizacija

```
norm(x) = (x − min) / (max − min)
```

Normalizuje se **u okviru dobijenog skupa ponuda**, ne prema fiksnoj
konstanti. Time ocena uvek koristi ceo raspon: najjeftinija ponuda dobija
0, najskuplja 1, bez obzira na to da li se porede 50 i 80 EUR ili 500 i
900 EUR. Ranija verzija je delila fiksnim konstantama (300 EUR, 600 min),
pa je na jeftinim rutama ceo raspon ocena bio stisnut u prvih 20 %.

Kada su sve vrednosti iste (ili ima samo jedna ponuda), normalizovana
vrednost je **0** za sve. Ponuda bez podatka (vrednost nije broj) dobija
**1**, najgoru vrednost, da nepoznato ne bi bilo prednost. Time se izbegava deljenje nulom, a činilac koji
ne razlikuje ponude ne utiče na poredak.

### Težine

| Prioritet | w_c | w_t |
|---|---|---|
| Najjeftinije | 1,0 | 0,0 |
| Najbrže | 0,0 | 1,0 |
| Balans | 0,5 | 0,5 |

### Kazna po presedanju: `p = 0,1`

Cena i trajanje su na [0, 1], pa `p = 0,1` znači: **jedno presedanje vredi
kao desetina raspona između najjeftinije i najskuplje ponude.** Direktan
let tako pobeđuje let sa presedanjem koji je za manje od 10 % raspona
bolji, ali ne pobeđuje onaj koji je znatno jeftiniji — što odgovara tome
da presedanje jeste neprijatnost, ali ne presudna.

Vrednost je izabrana tako da bude uporediva sa razlikom koju putnik
oseti: na skupu ponuda BEG–ATH, presedanje „košta" oko 25 EUR razlike u
ceni, što je realan red veličine.

### Filteri (§4.3)

Primenjuju se **pre** normalizacije, da normalizacija koristi samo ponude
koje su zaista u igri:

- `maxStops` — najveći broj presedanja **po smeru** (putnik bira „direktan
  let", a ne „najviše jedno presedanje u oba smera zajedno")
- `departureFrom` / `departureTo` — vreme polaska **odlaska**, u HH:MM

### Budžet se ne koristi za odsecanje

Specifikacija §4.7 traži meku granicu. Ponude skuplje od budžeta ostaju u
listi sa `overBudget: true`. Ranije su postojale konstante `UDEO_LET = 0,3`
i `UDEO_SMESTAJ = 0,5`, koje su tvrdo odsecale ponude — uklonjene su.

---

## Faza 2 — Rangiranje smeštaja (§6.1)

[`FazaSmestaj.js`](../voyra/backend_Node/planner-service/src/services/FazaSmestaj.js)

### Filtriranje (§4.4)

- **tip** — `accommodationTypes` (hotel / apartman / hostel)
- **ocena** — `minAccommodationRating`; smeštaj **bez ocene prolazi**
  filter i nosi `ratingUnknown: true`. Izvor nema podatak, a to nije isto
  što i loša ocena.
- **cena po noći** — opcioni `maxPricePerNight`

### Formula

```
score = 0,5 · cena + 0,3 · udaljenost + 0,2 · (1 − ocena)
```

Svi činioci su min-max normalizovani u okviru skupa. Ocena je jedini
činilac gde je veće bolje, pa se okreće (`1 − ocena`), da i za nju važi
„manji skor je bolji".

**Obrazloženje težina** (zbir je 1):

- **cena 0,5** — smeštaj je obično najveća stavka posle leta i glavno
  ograničenje budžeta
- **udaljenost 0,3** — ulazi u svaki dan obilaska kroz vreme kretanja, pa
  nije samo pitanje udobnosti
- **ocena 0,2** — najmanja jer je izvor često nema; veća težina bi uvela
  slučajnost tamo gde podatka nema

Smeštaj bez ocene dobija normalizovanu vrednost **0,5** (sredina skale):
ne nagrađuje se, ali se ni ne kažnjava kao najgori.

### Preporuka

```
preostaliBudzet = budzet − cenaIzabranogLeta − procenaUlaznica
```

Preporučuje se **najbolje rangirana ponuda čija ukupna cena ne prelazi
preostali budžet**. Ako takve nema, preporučuje se **najjeftinija**, uz
upozorenje u `warnings`. Bez zadatog budžeta preporučuje se najbolje
rangirana.

---

## Faza 3 — Izbor atrakcija (§6.2)

[`FazaAtrakcije.js`](../voyra/backend_Node/planner-service/src/services/FazaAtrakcije.js),
[`Dani.js`](../voyra/backend_Node/planner-service/src/services/Dani.js)

### Ocena atrakcije

```
ocena = α · poklapanje + (1 − α) · popularnost,   α = 0,7
```

- **poklapanje** — *udeo* kategorija atrakcije koje su među izabranim
  interesovanjima. Udeo, a ne „ima/nema": atrakcija koja je i muzej i
  kultura, kada je izabran samo `muzeji`, dobija 0,5 — ne treba da bude
  izjednačena sa onom koja je isključivo muzej.
- **popularnost** — `rating` sveden na [0, 1] (`rating / 5`); bez ocene 0,5

**α = 0,7** jer je korisnik interesovanja izabrao svesno, pa nose većinu
ocene; popularnost služi da razdvoji atrakcije istog poklapanja.

### Raspoloživo vreme po danu

```
raspoloživo = (dayEnd − dayStart) − ručak
ručak = 60 min   ako dan ima bar 60 slobodnih minuta OD 12:30 nadalje
        0        inače
```

> **Zašto uslov.** Ranije se ručak oduzimao kad god je prozor duži od 60
> min, pa je poslednji dan (09:00–10:30, 90 min) ostajao sa 30 min i
> proglašavao se praznim — iako u njega staje jedna kratka poseta. Ručak
> se ne računa pre `RUCAK_NE_PRE` (12:30), pa dan koji se završava pre
> toga prolazi bez njega. Dan koji počinje **posle** 12:30 (npr.
> 13:45–20:00) ručak **dobija**: prozor i dalje obuhvata vreme obroka, a
> pretpostavka „korisnik se verovatno već ručao" nije nešto što plan sme
> da pretpostavi umesto njega. Isto pravilo koristi i satnica u
> `FazaRedosled.js`, da se raspoloživo vreme i stvarna satnica ne raziđu.

uz dva izuzetka:

- **prvi dan** počinje od `dolazak leta + 90 min` (transfer sa aerodroma i
  prijava u smeštaj)
- **poslednji dan** se završava `180 min pre poletanja` povratnog leta

#### Aerodrom van grada

Aerodrom nije uvek u gradu u koji se putuje: do Bleda se leti preko
Ljubljane (31 km), do Istanbula centar je 33 km od SAW. Taj put ulazi u
plan, jer bi inače prvi dan počinjao pre nego što putnik uopšte stigne.

```
transfer = (udaljenostKm / 70 km/h) · 60 min        zaokruženo na ceo minut
prvi dan     počinje od  dolazak + 90 min + transfer
poslednji dan završava   180 min pre poletanja − transfer
```

- **70 km/h** je prosek za autoput plus prilaz gradom; nije brzina
  autobusa ni taksija u špicu, nego red veličine koji ne obećava previše.
- Prag za „aerodrom je u gradu" je **30 km**: ispod toga se transfer ne
  računa posebno, jer ga pokriva onih 90 min koje prvi dan ionako gubi.
- Preko **150 km** aerodrom se ne nudi — plan se tada pravi bez leta.
- Kada se transfer računa, plan nosi upozorenje sa nazivom aerodroma,
  udaljenošću i procenjenim trajanjem.

#### Koji aerodrom

Grad sa sopstvenim IATA kodom (London `LON`, Pariz `PAR`, Milano `MIL`)
traži let preko **koda grada**, ne preko jednog aerodroma: Duffel
dokumentacija za `POST /air/offer_requests` kaže da `slices.origin` i
`slices.destination` primaju „the 3-letter IATA code for the **city** or
airport", pa jedan upit pokriva sve aerodrome tog grada (LHR, LGW, LCY…).
Ostali gradovi idu preko **najbližeg** aerodroma sa redovnim linijama.

Kada pretraga ide preko koda grada, do izbora ponude se **ne zna** gde se
sleće: Istanbulu je najbliži SAW (33 km), ali ponuda može da glasi na IST
(34 km). Zato se transfer i upozorenje računaju od aerodroma **iz izabrane
ponude** (zadnji segment odlaska), a najbliži aerodrom služi samo kao
procena pre izbora — inače bi plan pisao jedan aerodrom, a karta glasila
na drugi.

Dan sa manje od **60 min** raspoloživog vremena nema aktivnosti, a
obrazloženje stoji u polju `note`.

> **Dan povratka ulazi u plan.** `checkIn` 10. i `checkOut` 14. je 4 noći,
> ali **5 dana**: putnik sleti 10. i odlazi 14. Ranije se računalo po
> noćima, pa dan povratka nije ni postojao — i pravilo o skraćivanju
> poslednjeg dana nikada se nije primenilo.

### Ciljni broj aktivnosti

| Tempo | Aktivnosti dnevno |
|---|---|
| Opušten | 2 |
| Umeren | 4 |
| Intenzivan | 6 |

Specifikacija daje opsege (umeren 3–4, intenzivan 5–6); uzima se **gornja
granica**, jer se broj posle skraćuje prema raspoloživom vremenu — donja
granica bi dvaput smanjila isti plan.

**Skraćenje po danu.** §6.2 traži „skraćenje prvog i poslednjeg dana prema
vremenu leta". Cilj je zato srazmeran raspoloživom vremenu tog dana:

```
punDan      = dayEnd − dayStart − ručak                    (npr. 600 min)
cilj(dan)   = round(poTempu · raspoloživo(dan) / punDan)
              najmanje 1 kada dan ima ≥ 60 min, inače 0
```

Za sletanje u 12:15 (dan počinje u 13:45, 315 min) i intenzivan tempo to
daje `round(6 · 315 / 600) = 3` umesto 6. Ranije je svaki dan sa bar 60
minuta dobijao pun broj, pa se skraćenje nije ni dešavalo.

### Izvor ne filtrira po interesovanjima

Integration Service vraća **sve** atrakcije grada, a ne samo one iz
izabranih interesovanja. Formula gore to i pretpostavlja: atrakcija van
interesovanja ima `poklapanje = 0`, ali i dalje nosi `(1 − α) ·
popularnost`, pa može da uđe u plan kada onih u interesovanjima nema
dovoljno. Dok je izvor filtrirao, do Faze 3 nikada nije ni stizala.

### Izbor

Pohlepno po opadajućoj oceni, **u dva prolaza**:

1. atrakcije koje se poklapaju sa bar jednim interesovanjem,
2. ostale, samo kao dopuna do ciljnog broja.

Dva prolaza, a ne samo sortiranje po oceni, jer sa `α = 0,7` vrlo popularna
atrakcija van interesovanja (0,7 · 0 + 0,3 · 1,0 = 0,30) ume da prestigne
slabo ocenjenu atrakciju sa delimičnim poklapanjem: atrakcija sa tri
kategorije od kojih je jedna izabrana i ocenom 1 od 5 dobija
0,7 · 1/3 + 0,3 · 0,2 ≈ 0,29. Interesovanja su izričit izbor korisnika, pa se
poštuju strogo; popularnost odlučuje **unutar** svake grupe. Dopuna se u
odgovoru označava sa `outsideInterests: true`, pa je prikaz jasno izdvaja.

Izbor staje kada se dostigne ciljni broj za ceo put. Atrakcija čije bi
trajanje posete prešlo ukupno raspoloživo vreme se **preskače**, a izbor
se nastavlja sa sledećom (kraća poseta još može da stane). Vreme kretanja
se ovde ne računa, jer zavisi od rasporeda po danima.

Stari filter (`ocena ≥ 4.0`, `trajanje 2–4 h`, relaksacija) je uklonjen —
bio je tvrdo pravilo koje specifikacija ne traži, a u praksi je ostavljalo
3 od 10 atrakcija.

---

## Faza 4 — Raspodela po danima (§6.3)

[`FazaRaspodela.js`](../voyra/backend_Node/planner-service/src/services/FazaRaspodela.js),
[`KMeans.js`](../voyra/backend_Node/planner-service/src/utils/KMeans.js)

### 1. k-means++ sa Haversine rastojanjem

**`k` = broj dana koji je zaista potreban** — odstupanje od §6.3,
obrazloženo u nastavku:

```
potrebnoDana = najmanji broj dana (redom po kapacitetu) čiji zbir
               ciljnih brojeva ≥ broj izabranih atrakcija
k            = min(broj dana sa vremenom, potrebnoDana)
```

> **Zašto odstupanje od §6.3.** Specifikacija kaže `k = broj dana`, što
> podrazumeva da atrakcija ima dovoljno za sve dane. Kada ih nema, to
> pravilo ih ravnomerno razvuče: osam atrakcija na pet dana daje ≈ 1,6 po
> danu, pa korisnik koji je izabrao **intenzivan tempo (5–6)** dobije plan
> sa po jednom aktivnošću dnevno. Tempo je izričit izbor, pa se dani
> popunjavaju do vrha, a oni koji ostanu bez grupe prikazuju se kao
> **„Slobodan dan"** uz napomenu *„Nema više atrakcija koje odgovaraju
> izabranom tempu i interesovanjima"*. Na nivou plana ide upozorenje sa
> brojkama i predlogom (dodati interesovanja ili izabrati opušteniji
> tempo). Tako korisnik vidi i granicu podataka i šta može da uradi —
> umesto plana koji tiho poništava njegov izbor.

Dani koji dobijaju grupe biraju se po kapacitetu (najveći prvi), pa su
srednji dani puni, a skraćeni prvi i poslednji ostaju slobodni kad ih
nema dovoljno. Inicijalizacija je **k-means++**
(D² sempliranje): prvi centroid je nasumičan, a svaki sledeći se bira sa
verovatnoćom proporcionalnom **kvadratu** rastojanja do najbližeg već
izabranog centroida. Time se centroidi razvlače po prostoru, što obična
nasumična inicijalizacija ne garantuje.

Rastojanje je **Haversine**, ne euklidsko nad stepenima — dužina stepena
geografske dužine se menja sa širinom, pa bi euklidsko rastojanje
izobličilo grupe.

Novi centroid je **aritmetička sredina** geografskih širina i dužina tačaka
grupe (na površini grada, prečnika do nekoliko desetina kilometara, to je
dovoljno tačno); prazna grupa zadržava stari centroid.

Parametri: **5 restartova**, najviše **10 iteracija** po prolazu, prag
konvergencije **0,001 km** (najveći pomeraj centroida). Bira se prolaz sa najmanjom inercijom (zbir
rastojanja tačaka do centroida svoje grupe). Restartovi postoje jer je
k-means osetljiv na početne centroide i ume da završi u lošem lokalnom
minimumu.

Generator slučajnih brojeva se može proslediti (`new KMeans({ random })`),
pa su testovi deterministički.

### 2. Kapacitet

Kapacitet grupe = ciljni broj aktivnosti dana koji će je dobiti. Kako
grupe još nisu dodeljene danima, kapaciteti dana se sortiraju opadajuće a
grupe po veličini — najveća grupa dobija najveći kapacitet.

### 3. Rebalansiranje

```
dok postoji grupa preko kapaciteta:
    ako nijedna grupa nema slobodno mesto: stani
    za svaku atrakciju u prekoračenim grupama:
        za svaku grupu sa slobodnim mestom:
            povećanje = d(atrakcija, centroid_odredišta) − d(atrakcija, centroid_izvora)
    premesti atrakciju sa NAJMANJIM povećanjem
```

**Dokaz zaustavljanja.** Neka je `V = Σ max(0, |G_i| − kapacitet_i)` ukupno
prekoračenje. Svako premeštanje smanjuje `|G_izvor|` za 1, gde je
`|G_izvor| > kapacitet`, pa doprinos izvora u `V` pada za 1. Odredište po
definiciji ima slobodno mesto, pa njegov doprinos ostaje 0. Dakle `V`
strogo opada za 1 po koraku. `V` je nenegativan ceo broj i `V ≤ n`, pa se
petlja završava posle najviše `n` koraka. U kodu stoji i tvrda granica od
`n + 1` koraka.

Kada je atrakcija više nego ukupnog kapaciteta, nijedna grupa nema
slobodno mesto — petlja tada staje i vraća zatečeno stanje, umesto da se
vrti u prazno.

### 4. Dodela grupa danima

Dodela ide u dva koraka (`dodeliDanima`):

1. **pariranje po veličini** — najveća grupa ide danu sa najvećim ciljnim
   brojem, da grupa od šest atrakcija ne završi na danu koji prima tri;
2. **krajnji dani** — među danima **istog** ciljnog broja, prvi i poslednji
   dan (skraćeni letom) uzimaju grupe sa **najmanjim ukupnim trajanjem
   poseta** (§6.3 t.3), zamenom sa danom koji je tu grupu dobio u koraku 1.

Dan koji ne dobije grupu ostaje slobodan.

---

## Faza 5 — Redosled obilaska i satnica (§6.4)

[`FazaRedosled.js`](../voyra/backend_Node/planner-service/src/services/FazaRedosled.js),
[`RouteOptimizer.js`](../voyra/backend_Node/planner-service/src/utils/RouteOptimizer.js)

### 1. Početno rešenje: najbliži sused

Polazi se **od smeštaja** (koordinate izabranog smeštaja; ako ih nema, od
centroida dana). Smeštaj je stvarna polazna tačka jutra, pa put koji ga
ignoriše ume da počne na suprotnom kraju grada.

### 2. 2-opt sa fiksnom polaznom tačkom

Obrće se segment `[i..j]` dok god to **skraćuje putanju** i dok
**satnica ostaje ispravna** (nijedna atrakcija nije zatvorena u trenutku
dolaska). Smeštaj je fiksiran kao tačka 0 i ne pomera se. Putanja je
**otvorena** (dan se ne završava povratkom u smeštaj). Prihvata se prvo
nađeno poboljšanje, a prolazi se ponavljaju dok ima poboljšanja, najviše
**100 iteracija**.

Prag poboljšanja je **10 m** — ispod toga je numerički šum.

Provera radnog vremena unutar 2-opt-a je bitna: bez nje kraće rešenje ume
da gurne muzej na 19:00, kada je već zatvoren.

### 3. Vreme kretanja

| Rastojanje | Način | Brzina |
|---|---|---|
| ≤ 2 km | pešice | 5 km/h |
| > 2 km | gradski prevoz | 20 km/h |

Svaki prelaz nosi `travelMinutes`, `travelMode` (`pesice` / `prevoz`) i
`travelKm`.

### 4. Satnica

Za svaku aktivnost se računa `startTime` i `endTime`:

```
dolazak = prethodniKraj + vremeKretanja
ako je dolazak pre otvaranja: dolazak = otvaranje        (čekanje)
ako je dolazak ≥ 12:30 i ručak još nije bio: +60 min     (ručak)
odlazak = dolazak + trajanjePosete
ako odlazak > dayEnd: aktivnost ne staje u dan
```

**Čekanje na otvaranje** je nužno: bez njega nijedna atrakcija koja radi
kasno (noćni život, restorani) ne bi mogla da uđe u plan, jer bi je prvi
dolazak uvek zatekao zatvorenu.

Pauza za ručak (60 min) ubacuje se **pre prve posete na koju se stiže u
12:30 ili kasnije**: ručak počinje u vreme tog dolaska, a poseta 60 min
posle.

### 5. Radno vreme

Spoljni izvor ga često nema (Geoapify samo kada OSM objekat nosi
jednostavan `opening_hours`, OpenTripMap gotovo nikad), pa se procenjuje
po kategoriji i uvek označava sa `openingHoursEstimated: true`. Kada izvor
ima pravo radno vreme, ono ima prednost. Vrednosti ispod su ugrađene
konstante (`RADNO_VREME`, `TRAJANJE_POSETE`); sada ih administrator
uređuje u katalogu kategorija, a `seed:kategorije` ih upisuje iste.

| Kategorija | Radno vreme | Trajanje posete |
|---|---|---|
| Muzeji | 09:00–17:00 | 120 min |
| Kultura | 09:00–18:00 | 60 min |
| Priroda | 00:00–24:00 | 75 min |
| Gastronomija | 12:00–23:00 | 90 min |
| Noćni život | 20:00–02:00 | 120 min |
| Šoping | 10:00–21:00 | 60 min |

Radno vreme koje prelazi ponoć (20:00–02:00) se obrađuje tako što se kraj
pomera za 24 h, pa se poredi i pomereni interval.

### 6. Problematične atrakcije

Problem je atrakcija koja je **zatvorena u trenutku dolaska** ili za koju
**nema vremena do kraja dana**. Drugo sledi iz prvog: čekanje na otvaranje
pomera sve iza sebe, pa atrakcija koja radi kasno ume da izgura one posle
sebe. Oba slučaja se leče istim redosledom pokušaja (§6.4 t.4):

1. **druga pozicija u istom danu** — probaju se sve pozicije, prihvata se
   prva u kojoj ništa nije zatvoreno i ništa ne ispada
2. **drugi dan sa slobodnim kapacitetom** — radi `TravelPlanner`, jer
   jedino on vidi sve dane
3. **uklanjanje atrakcije sa najnižom ocenom**, uz zapis u
   `removedAttractions` sa razlogom

Petlja ima najviše onoliko prolaza koliko ima atrakcija — svaki prolaz ili
reši problem, ili izbaci tačno jednu atrakciju.

> **Izuzetak od koraka 3.** Kada problematična atrakcija u taj dan ne može
> da stane **ni sama** — bar koji radi 20:00–02:00, a dan se završava u
> 20:00 — izlazi ona, a ne najslabije ocenjena. Bez toga bi popravka redom
> izbacivala upravo one atrakcije koje bi stale, dok dan ne bi ostao
> prazan: plan za „samo noćni život" tako je gubio i aktivnosti koje su
> bile u redu.

## Ručna izmena plana (§4.6)

[`FazaRedosled.js`](../voyra/backend_Node/planner-service/src/services/FazaRedosled.js),
[`PlanEditService.js`](../voyra/backend_Node/orchestrator-service/src/services/PlanEditService.js)

Generisanje i ručna izmena koriste **iste funkcije** za satnicu i 2-opt.
Razlikuje ih jedno: **ko odlučuje**.

| | Generisanje (§6.4 t.4) | Ručna izmena (§4.6) |
|---|---|---|
| Atrakcija zatvorena u vreme dolaska | premesti se u dan ili ispada | ostaje, uz `violation: 'zatvoreno'` |
| Aktivnost prelazi kraj dana | ispada iz dana | ostaje, uz `violation: 'posle_kraja_dana'` |
| Dolazak pre otvaranja | **čeka se** otvaranje | ne čeka se — prikazuje se stvarni dolazak |
| Redosled | najbliži sused + 2-opt | onakav kakav je korisnik postavio |

Tehnički, to je jedan prekidač: `napraviSatnicu({ zadrziSve })`. Sa
`zadrziSve: true` funkcija samo **računa i obeležava**, a odluka o
izbacivanju ostaje van nje — kod generisanja je donosi `sastaviDan`, kod
ručne izmene korisnik.

Čekanje na otvaranje se u ručnoj izmeni namerno ne primenjuje: korisnik
koji je stavio noćni klub na jutro treba da vidi **da je zatvoren**, a ne
vreme koje nije tražio.

### „Optimizuj redosled" za jedan dan

Isti postupak kao Faza 5 (najbliži sused od smeštaja, pa 2-opt koji
poštuje radno vreme), ali nad **zatečenim** danom. Najbliži sused
zamenjuje postojeći redosled, a 2-opt odbija zamene koje bi nešto zatekle
zatvoreno — pa rezultat ume da bude **duži** od onoga što je korisnik već
imao. Dugme ne sme da pogorša dan, zato ruta vraća **kraće od dva
rešenja** (optimizovano ili zatečeno).

### „Generiši ponovo" (`replan`)

Pokreće **faze 3–5** nad već izabranim letom i smeštajem iz sačuvanog
putovanja. Letovi i smeštaj se **ne pretražuju ponovo**: Duffel ponuda u
međuvremenu istekne (15–20 min), a rezervisan let ne sme da se promeni
pod nogama korisniku (§4.8). Ko želi drugi let, pravi novo putovanje kroz
čarobnjaka.

---

### Izlaz po atrakciji: opis i slika

Za atrakcije koje su ušle u plan traži se i detalj (`POST
/attractions/details`, keš 30 dana): kratak opis i sličica sa **Wikimedia
Commons-a**, preko OpenTripMap `preview` ili Wikipedia REST `summary`.
Traži se **tek posle Faze 3**, jer je to jedan poziv po atrakciji — za
svih 60–200 kandidata bio bi to nesrazmeran teret za izvor. Neuspeh ne
obara plan: atrakcija ostaje bez slike, a prikaz stavlja znak po
kategoriji.

### Izlaz po danu

```js
{
  day, date, availableFrom, availableTo, note,
  accommodation, flight,
  attractions: [{ ...atrakcija, order, startTime, endTime,
                  travelMinutes, travelMode, travelKm,
                  openingHours, openingHoursEstimated, violation,
                  outsideInterests, image }],
  lunch: { startTime, endTime } | null,
  freeDay, totalDistance, estimatedBudget
}
```

---

## Budžet (§4.7)

Budžet je **meka granica**. `totalBudget` ostaje po stavkama i dobija:

```js
{ flights, accommodations, attractions, total, currency,
  overBudget: boolean, overBy: number }
```

Pri prekoračenju se dodaje upozorenje u `warnings`, ali se **ništa ne
odseca** — korisnik sam odlučuje.

Cena leta se **ne množi** brojem putnika ni sa dva: izvor (Duffel) vraća
cenu cele ponude, za oba smera i sve putnike. Smeštaj se množi brojem
noći, ulaznice brojem putnika.

---

## Složenost i merenje

Neka je `f` broj ponuda letova, `s` smeštaja, `a` atrakcija, `n` izabranih
atrakcija, `k` dana, `m` atrakcija po danu (najviše 6).

| Faza | Složenost |
|---|---|
| 1 | O(f log f) — normalizacija O(f), sortiranje O(f log f) |
| 2 | O(s log s) |
| 3 | O(a log a) — ocena O(a), sortiranje O(a log a) |
| 4 | O(n·k·i) po prolazu k-means-a (i ≤ 10, 5 restartova) + O(n²·k) za rebalansiranje |
| 5 | O(m³) po iteraciji 2-opt-a: O(m²) kandidata, a za svakog se dužina putanje i satnica računaju iznova, O(m). Klasični 2-opt sa računom razlike dve ivice je O(m²) po iteraciji; ovde se to ne koristi jer provera radnog vremena ionako traži celu satnicu. |

Kako je `m ≤ 6`, faza 5 je jeftina uprkos kubnoj granici — zato heuristika
i daje rešenja bliska optimalnim uz zanemarljivo vreme (spec §6, napomena).

### Merenje (spec §11: < 1 s)

`npm run bench` u `planner-service`: sintetički skup od **100 atrakcija**
razbacanih po gradu prečnika ~12 km, **14 dana**, tempo `intenzivan`,
**20 pokretanja** faza 3–5 sa determinističkim generatorom.

Ponovljeno 28. 9. 2026:

| | |
|---|---|
| Najkraće | 13,3 ms |
| **Prosek** | **16,1 ms** |
| Najduže | 23,1 ms |
| Aktivnosti u planu | 66 |

Ranije merenje (7,2 ms prosek, 48 aktivnosti) odnosi se na stariju verziju
algoritma; od tada se ciljni broj računa srazmerno raspoloživom vremenu, a
`k` prema broju potrebnih dana, pa plan ima više aktivnosti. Serija po broju
atrakcija (10–200) je u `TESTIRANJE.md`, odeljak 8.

**Zahtev je ispunjen sa više od reda veličine rezerve** (23,1 ms naspram 1 s).
Mereno je samo vreme algoritma, bez mreže i baze — zahtev iz §11 odnosi se
na algoritam; za ceo plan sa spoljnim pozivima specifikacija traži < 10 s,
odnosno < 2 s kada su podaci u kešu. To je izmereno posebno
(`npm run merenje:plan`, `TESTIRANJE.md` odeljak 8): najduže 9,07 s sa
praznim i 0,08 s sa toplim kešom.

---

## Popularnost atrakcije iz Geoapify-a

OpenTripMap ključ nije mogao da se dobije, pa je uzet drugi izvor koji
specifikacija §5 dozvoljava — **Geoapify Places**. On, međutim, **nema
ocenu posetilaca ni rang popularnosti**, a Faza 3 računa

```
ocena = ALFA · poklapanje + (1 − ALFA) · popularnost
```

pa popularnost mora odnekud da dođe. Ona se **ne izmišlja**: koristi se
jedini signal prepoznatljivosti koji odgovor zaista nosi — veza ka
Wikipediji ili Wikidati u OSM tagovima (`datasource.raw`):

```
ocena = 3,0                       osnovica („ne znamo")
      + 0,8   ako objekat ima tag `wikipedia`
      + 0,4   ako ima samo `wikidata`
      + 0,3   ako je UNESCO baština (`heritage`)
                                  najviše 4,5
```

- **Zašto Wikipedia više od Wikidate.** Članak na Wikipediji znači da je
  neko o mestu napisao tekst; Wikidata stavka često postoji i za objekat
  koji nema nijednu rečenicu opisa.
- **Zašto gornja granica 4,5, a ne 5,0.** Bez stvarnih ocena posetilaca
  najviša ocena bila bi obećanje koje podaci ne pokrivaju. Skala je ista
  kao kod OpenTripMap-a, gde se `rate` (1–3) preslikava u 3,5–4,5.

### Ograničenje: redosled po blizini

Geoapify vraća rezultate poređane po `bias=proximity`, dakle **najbliže
prvo**. U gustom centru to znači desetine spomen-ploča i statua pre nego
što se dođe do onoga zbog čega se u grad putuje. Zato adapter traži veći
skup (120 mesta = 6 od 3 000 dnevnih kredita) i **objekte sa vezom ka
Wikipediji stavlja ispred ostalih**. Ništa se ne izmišlja — menja se samo
redosled onoga što je izvor vratio.

Ograničenje ipak ostaje: u gradovima gde i sitni objekti imaju Wikidata
stavku (npr. „kamenje spoticanja" u Atini i Tromsøu) vrh liste nije uvek
ono što bi turista prvo izabrao. Sa pravim OpenTripMap ključem, koji ima
`rate` značajnosti, rezultat bi bio bolji.

### Radno vreme

`opening_hours` iz OSM-a ima **prednost** nad procenom po kategoriji, ali
samo kada je oblik jednostavan (`Mo-Su 09:00-17:00`, `08:30-15:00`,
`24/7`). Sezonska i višedelna pravila (`Nov-Mar 08:30-15:00`,
`Mo-Fr 09:00-17:00; Sa 10:00-14:00`, `on appointment`) se **odbijaju** i
ostaje procena sa `openingHoursEstimated: true` — bolje priznati „ne
znam" nego pogrešno pročitati pravilo i poslati korisnika pred zatvorena
vrata.

---

## Atrakcije administratora

Spoljni izvor ne zna sve: mala mesta OpenTripMap nema, a i tamo gde ima,
administrator može da doda ono što izvor propušta. Te atrakcije se u
Fazi 3 **spajaju** sa eksternim, a ne dodaju posebno.

### Pravilo duplikata

Dve atrakcije su isto mesto kada je ispunjen **bar jedan** uslov:

```
normalizuj(nazivA) == normalizuj(nazivB)      ili      rastojanje < 150 m
```

`normalizuj` skida dijakritiku, članove (`the`, `la`, `il`…) i sve što
nije slovo ili cifra, pa „Akropolj" i „akropolj" jesu isto mesto.

> **Zašto oba uslova.** Ni jedan sam ne bi bio dovoljan. Koordinate istog
> objekta se kod dva izvora razilaze — OpenTripMap često daje tačku na
> ulazu ili u središtu poligona, a administrator tačku sa mape — pa
> poređenje samo po rastojanju promaši. S druge strane, isto mesto ume da
> nosi dva imena („Partenon" i „Parthenon Temple"), pa poređenje samo po
> nazivu takođe promaši.
>
> **150 m** je otprilike jedan gradski blok: dovoljno da pokrije razliku
> između dve tačke istog objekta, a premalo da spoji dva susedna muzeja.

### Koji zapis ostaje

Kod poklapanja ostaje **zapis administratora**, jer ga je neko proverio,
dok spoljni izvor ume da ima pogrešnu kategoriju ili trajanje. Od
eksternog zapisa se preuzima samo ono što administrator **nije** uneo:
slika, opis, ocena posetilaca i radno vreme. Tako ručni unos nije
siromašniji od automatskog, a proverena vrednost se ne gubi.

Atrakcija zadržava `source: 'admin'` i u prikazu nosi oznaku „Preporuka
Voyre", pa korisnik zna odakle podatak dolazi.

---

## Popularne destinacije

Početna strana računa popularnost iz kolekcije `search_stats`, koja nosi
jedan zapis po **gradu i danu**:

```
score = brojPretraga + 3 · brojSacuvanih          (poslednjih 30 dana)
```

- **Težina 3.** Pretraga je znak radoznalosti, a sačuvano putovanje
  odluka: neko je prošao sva četiri koraka čarobnjaka i zadržao plan.
  Faktor 3 znači da jedno sačuvano putovanje vredi kao mala grupa
  pretraga, ali da i dalje ne može samo da odnese grad u vrh liste.
- **Prag od 3 pretrage.** Ispod toga grad ne ulazi u listu — inače bi
  jedan korisnik svojom jedinom pretragom napravio „popularnu"
  destinaciju.
- **Isti korisnik se istog dana za isti grad broji jednom.** Otisak
  (korisnikov `id`, ili `X-Session-Id` gosta) hešira se i pamti u zapisu
  tog dana, pa osvežavanje stranice ne naduvava broj. Bez toga bi deset
  pritisaka na F5 izgledalo kao deset zainteresovanih putnika.
- Zapisi stariji od **90 dana** se brišu TTL indeksom; prozor računa
  poslednjih 30.

---

## Demo ponude bez ključeva

Bez `DUFFEL_API_KEY` i `LITEAPI_KEY` ručno napisan mock pokriva samo rutu
BEG → ATH, pa je čarobnjak za svaki drugi grad bio prazan. Zato
Integration Service za nepokrivene rute pravi **demo ponude**
(`utils/demoGenerator.js`). One nisu procena tržišta nego popuna toka, pa
se i zovu tako: prevoznik je **„Demo Air"**, smeštaj **„Demo smeštaj —
{grad}"**, a `source` ostaje `mock`.

**Let** (udaljenost `d` u km, Haversine između koordinata gradova):

```
trajanje = 30 min + (d / 800 km/h) · 60 min
cena     = (39 EUR + d · 0,08 EUR/km) · (1 − 0,15 · presedanja) · (0,85…1,25) · (2 za povratno putovanje)
```

30 min je poletanje, penjanje, sletanje i rulanje; 800 km/h je brzina
krstarenja mlaznjaka. Kalibracija: BEG → ATH (~800 km) ispadne oko 100
EUR, BEG → LIS (~2.500 km) oko 250 EUR — red veličine ekonomske klase.
Presedanje (0 ili 1; prva ponuda je uvek direktna) produžava odlazak za
60–149 min, a povratak za 60 min, i snižava cenu oko 15 %, pa izbor
„jeftinije ili brže" iz faze 1 ima šta da uporedi.

**Smeštaj**: pet ponuda po delovima grada, cena po noći
`osnovica · (0,8…1,4)`, gde je osnovica 95 EUR (hotel), 70 (apartman), 32
(hostel), rasute do ~2,5 km od centra.

Sve nasumično dolazi iz **seed-a napravljenog od rute i datuma**, pa isti
zahtev uvek daje istu ponudu — plan se ne menja između dva otvaranja.

> **Atrakcije se ne izmišljaju.** Za njih nema demo režima: kada
> OpenTripMap ključ nije podešen i grad nije u ručnom mock skupu, dani
> ostaju prazni uz izričito upozorenje. Izmišljena atrakcija bi bila
> netačan podatak o stvarnom mestu; izmišljena cena leta je očigledno
> označena kao demonstracija.

---

## Testovi

`npm test` u `planner-service` — **113 testova** u 5 fajlova (
ranije 59) na ugrađenom `node:test`, bez mreže i baze:

- normalizacija (jedna ponuda, sve iste vrednosti, bez deljenja nulom)
- težine po prioritetu prevoza, uz ručno sračunat primer za `balans`
- filteri presedanja i vremena polaska
- filter tipa smeštaja; `rating: null` prolazi filter ocene
- preporuka u okviru preostalog budžeta i najjeftinija uz upozorenje
- tempo i skraćeni prvi/poslednji dan
- rebalansiranje: nijedna grupa preko kapaciteta; zaustavljanje i za
  patološke ulaze (sve atrakcije u istoj tački, više atrakcija nego
  kapaciteta)
- prvi i poslednji dan dobijaju najkraće grupe
- najbliži sused kreće od smeštaja; 2-opt nikad ne produžava putanju
- vreme kretanja po formuli, ubacivanje ručka, poštovanje `dayEnd`
- zatvorena atrakcija se premešta, a ako ne može, uklanja se najlošija

Testovi koji zavise od k-means-a koriste **seed** (linearni kongruentni
generator), pa su ponovljivi.

Dve greške u algoritmu otkrivene su upravo tim testovima:

1. **Smeštaj bez ocene padao je na filteru** minimalne ocene, jer je
   `Number(null) === 0`, a `Number.isFinite(0)` je tačno — pa se „nema
   podatka" ponašalo kao „ocena 0".
2. **Čekanje na otvaranje guralo je kasnije atrakcije van dana**, a
   popravka je reagovala samo na „zatvoreno", ne i na „nema vremena" — pa
   je noćni klub izbacivao muzej iz plana umesto da promeni redosled.
