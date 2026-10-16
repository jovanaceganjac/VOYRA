**SPECIFIKACIJA DIPLOMSKOG RADA**

**Projektovanje i implementacija mikroservisne veb aplikacije za
planiranje putovanja primenom algoritama klasterovanja i heurističke
optimizacije redosleda obilaska**

*Sistem: Voyra*

**Student:** Jovana Čeganjac 2022/0423

**Mentor:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Fakultet:** Elektrotehnički fakultet Univerziteta u Beogradu

**Smer:** Softversko inženjerstvo

**Akademska godina:** 2025/2026

1\. UVOD I OPIS PROBLEMA

Planiranje putovanja podrazumeva niz međusobno zavisnih odluka: izbor
prevoza, smeštaja i mesta koja će se posetiti, kao i njihovo
raspoređivanje u raspoloživo vreme uz poštovanje budžeta. Korisnik te
odluke danas najčešće donosi kroz više nezavisnih servisa, ručno
usklađujući datume, cene i lokacije, bez uvida u ukupan trošak
putovanja.

Posebno je složeno formiranje dnevnog rasporeda aktivnosti: atrakcije
treba odabrati prema interesovanjima, rasporediti po danima tako da budu
prostorno bliske i odrediti redosled obilaska koji poštuje radno vreme.
Određivanje redosleda predstavlja varijantu problema trgovačkog putnika
sa vremenskim prozorima (TSPTW), koji je NP-težak, pa se u praksi rešava
heurističkim metodama.

Ovaj rad opisuje projektovanje i implementaciju sistema Voyra — veb
aplikacije koja na jednom mestu objedinjuje pretragu letova i smeštaja,
preporuku atrakcija i automatsko generisanje dnevnog plana putovanja.
Arhitektura je zasnovana na mikroservisnom pristupu, a podaci o
letovima, smeštaju i atrakcijama preuzimaju se sa eksternih API servisa.

2\. CILJEVI PROJEKTA

- Implementirati veb aplikaciju koja objedinjuje pretragu letova,
  pretragu smeštaja, preporuku atrakcija i generisanje plana putovanja.

- Projektovati mikroservisnu arhitekturu sa pet servisa i jasno
  definisanim REST API ugovorima.

- Integrisati eksterne servise kroz sloj adaptera, uz keširanje i mock
  režim rada.

- Implementirati rangiranje letova po kriterijumu: najjeftinija, najbrža
  ili balansirana opcija.

- Implementirati algoritam generisanja dnevnog plana: k-means
  klasterovanje sa ograničenjem kapaciteta i određivanje redosleda
  obilaska heuristikom najbližeg suseda uz 2-opt poboljšanje.

- Podržati budžet kao meku granicu, uz procenu ukupnog troška i
  upozorenje o prekoračenju.

- Omogućiti kompletan tok rezervacije i otkazivanja leta kroz API u test
  režimu.

- Podržati tri tipa smeštaja: hotele, apartmane i hostele.

- Implementirati korisnički sistem sa registracijom koju odobrava
  administrator i obaveštavanjem putem elektronske pošte.

3\. KORISNICI SISTEMA

Sistem podržava tri tipa korisnika sa različitim nivoima pristupa.

3.1 Gost (neregistrovani korisnik)

- Pregleda početnu stranicu i popularne destinacije.

- Pretražuje letove, smeštaj i atrakcije.

- Može generisati plan putovanja.

- Ne može sačuvati plan niti rezervisati let.

3.2 Registrovani korisnik

- Sve što može gost.

- Registruje se unosom imena, prezimena, adrese elektronske pošte,
  korisničkog imena i lozinke; nalog je aktivan tek nakon odobrenja
  administratora.

- Prijavljuje se korisničkim imenom i lozinkom.

- Čuva planove putovanja i ručno ih menja.

- Rezerviše let kroz aplikaciju i otkazuje putovanje.

- Pregleda svoja putovanja i menja lične podatke.

3.3 Administrator

- Odobrava ili odbija zahteve za registraciju; korisnik u oba slučaja
  dobija obaveštenje elektronskom poštom.

- Upravlja korisnicima (pregled, blokiranje, deblokiranje).

- Upravlja istaknutim destinacijama, atrakcijama koje nisu preuzete sa
  eksternih servisa i kategorijama interesovanja.

- Pregleda statistiku sistema putem zaštićenog admin panela.

4\. FUNKCIONALNI ZAHTEVI

4.1 Početna stranica

- Forma za brzu pretragu: polazište, odredište, datumi i broj putnika.

- Istaknute destinacije koje bira i poređa administrator.

- Popularne destinacije, računate automatski po broju pretraga i
  sačuvanih putovanja u poslednjih 30 dana.

4.2 Kreiranje putovanja

Kreiranje putovanja organizovano je kao čarobnjak u četiri koraka:
parametri → izbor leta → izbor smeštaja → plan. Preferencije se unose za
svako putovanje posebno.

| **Parametar**             | **Opis**                                                      |
|---------------------------|---------------------------------------------------------------|
| Polazište i odredište     | Grad ili aerodrom, uz automatsko dopunjavanje                 |
| Datumi polaska i povratka | Period putovanja, najviše 14 dana                             |
| Broj putnika              | Najmanje 1, bez gornje granice                                |
| Budžet                    | Ukupan iznos za celo putovanje u EUR                          |
| Prioritet prevoza         | Najjeftinije / Najbrže / Balans                               |
| Tip i ocena smeštaja      | Hotel, apartman, hostel; minimalna ocena (opciono)            |
| Interesovanja             | Kultura, priroda, gastronomija, noćni život, šoping, muzeji   |
| Tempo                     | Opušten (2 aktivnosti dnevno), umeren (3–4), intenzivan (5–6) |
| Početak i kraj dana       | Podrazumevano 09:00–20:00                                     |

4.3 Izbor leta

- Pretraga povratnih letova; prikaz avio-kompanije, vremena, trajanja,
  broja presedanja i cene.

- Rangiranje prema prioritetu prevoza (odeljak 6.1); preporučena ponuda
  je istaknuta.

- Filtriranje po broju presedanja i vremenu polaska.

- Vremena dolaska i povratka određuju raspoloživo vreme prvog i
  poslednjeg dana.

4.4 Izbor smeštaja

- Pretraga hotela, apartmana i hostela; prikaz naziva, tipa, ocene,
  udaljenosti od centra i cene.

- Filtriranje po tipu, oceni i ceni; preporučena ponuda je istaknuta.

- Dugme „Rezerviši na Booking.com“ otvara pretragu sa popunjenim gradom,
  datumima i brojem gostiju; aplikacija ne vrši rezervaciju smeštaja.

4.5 Preporuka atrakcija

- Atrakcije iz eksternog servisa i baze administratora, rangirane po
  poklapanju sa interesovanjima i popularnosti.

- Prikaz: naziv, kategorija, opis, lokacija, trajanje posete, radno
  vreme i cena ulaznice.

4.6 Generisanje i izmena plana

Na osnovu leta, smeštaja i preferencija sistem generiše dnevni raspored
aktivnosti (poglavlje 6). Plan se prikazuje po danima, sa vremenima
početka i kraja svake aktivnosti. Registrovani korisnik plan može da
izmeni:

- Uklanjanje, dodavanje i premeštanje aktivnosti u okviru dana i između
  dana.

- Nakon izmene sistem ponovo računa vremena; aktivnosti koje krše radno
  vreme se vizuelno obeležavaju.

- Dugmad „Optimizuj redosled“ (za izabrani dan) i „Generiši ponovo“ (za
  ceo plan).

4.7 Budžet

- Budžet je meka granica: sistem ne odbacuje opcije koje ga prekoračuju.

- Prikaz procene troška po stavkama (let, smeštaj, ulaznice) i ukupno;
  pri prekoračenju se prikazuje upozorenje.

4.8 Rezervacija leta

Rezervacija se vrši kroz eksterni API u test režimu — tok je potpun, ali
bez stvarne kupovine i naplate. Dostupno registrovanom korisniku nad
sačuvanim putovanjem.

1.  Korisnik bira „Rezerviši let“ na sačuvanom putovanju.

2.  Sistem ponovo proverava ponudu; ako se cena promenila, korisnik
    potvrđuje novu cenu.

3.  Korisnik unosi podatke o putnicima.

4.  Sistem kreira rezervaciju i čuva njen kod; status putovanja prelazi
    u REZERVISANO.

Ukoliko avio-kompanija odbije rezervaciju zbog broja putnika (većina
ograničava rezervaciju na 9 putnika), sistem prikazuje poruku da let
treba rezervisati u više delova.

4.9 Upravljanje putovanjima

- Stranica „Moja putovanja“ sa listom putovanja i filtriranjem po
  statusu.

- Statusi: NACRT (sačuvano), REZERVISANO (let rezervisan), OTKAZANO,
  ZAVRŠENO (automatski nakon datuma povratka).

- Otkazivanje putovanja otkazuje i rezervaciju leta; smeštaj korisnik
  otkazuje sam na eksternom sajtu.

4.10 Korisnički sistem

- Registracija; nalog je u statusu NA ČEKANJU do odluke administratora
  (ODOBREN / ODBIJEN), o čemu korisnik dobija elektronsku poštu.

- Administrator može blokirati nalog (BLOKIRAN).

- Prijava korisničkim imenom i lozinkom (JWT autentifikacija).

- Profil: izmena ličnih podataka i promena lozinke.

4.11 Opcione funkcionalnosti

Realizuju se ukoliko vreme dozvoli: prikaz plana na mapi, izvoz plana u
PDF, ocenjivanje atrakcija, putovanje kroz više gradova i pretraga
autobuskog i železničkog prevoza.

5\. EKSTERNI SERVISI

Servisi Skyscanner i Booking odobravaju pristup API-ju samo
komercijalnim partnerima, a Amadeus je u julu 2026. ugasio besplatni
portal za programere. Zato su izabrani servisi dostupni bez
komercijalnog ugovora.

| **Namena**           | **Servis**               | **Način korišćenja**                                    |
|----------------------|--------------------------|---------------------------------------------------------|
| Letovi               | Duffel                   | Pretraga, rezervacija i otkazivanje u test režimu       |
| Smeštaj              | Duffel Stays ili LiteAPI | Pretraga u sandbox režimu; izbor nakon provere pristupa |
| Rezervacija smeštaja | Booking.com (link)       | Preusmeravanje sa popunjenim parametrima                |
| Atrakcije            | OpenTripMap ili Geoapify | Pretraga po lokaciji i kategoriji                       |
| Geokodiranje         | Nominatim (OSM)          | Naziv grada → koordinate                                |
| Kursna lista         | Frankfurter (ECB)        | Konverzija cena u EUR                                   |

**Napomena o dizajnu:** svi eksterni pozivi prolaze kroz Integration
Service. Za svaku vrstu podataka definisan je interni interfejs, a
konkretan servis se uključuje kao adapter, pa zamena provajdera ne utiče
na ostatak sistema. Odgovori se keširaju, a mock režim sa unapred
pripremljenim podacima omogućava rad kada eksterni servis nije dostupan.

6\. ALGORITAM PLANIRANJA PUTOVANJA

Algoritam je implementiran u Planner Service-u i sastoji se od pet faza.
Planner ne poziva eksterne servise — sve podatke dobija od Trip
Service-a, što ga čini nezavisnim i pogodnim za testiranje.

| **Faza**            | **Problem**                             | **Pristup**                    | **Složenost**      |
|---------------------|-----------------------------------------|--------------------------------|--------------------|
| Rangiranje letova   | Višekriterijumski izbor                 | Ponderisana suma               | O(f log f)         |
| Rangiranje smeštaja | Višekriterijumski izbor                 | Filtriranje + ponderisana suma | O(s log s)         |
| Izbor atrakcija     | Izbor podskupa uz vremensko ograničenje | Pohlepni izbor po oceni        | O(a log a)         |
| Raspodela po danima | Klasterovanje sa kapacitetom            | k-means + rebalansiranje       | O(n·k·i)           |
| Redosled obilaska   | TSPTW (NP-težak)                        | Najbliži sused + 2-opt         | O(m²) po iteraciji |

6.1 Rangiranje letova i smeštaja

Cena c i trajanje t svake ponude leta normalizuju se na interval \[0,
1\], a ocena se računa kao score = w_c · c + w_t · t + p ·
broj_presedanja. Težine zavise od prioriteta: Najjeftinije (1, 0),
Najbrže (0, 1), Balans (0,5; 0,5). Smeštaj se filtrira po tipu i oceni,
a zatim rangira po ceni, udaljenosti od centra i oceni. Preporučuje se
najbolja ponuda koja ne prelazi preostali budžet; ako takva ne postoji,
najjeftinija uz upozorenje.

6.2 Izbor atrakcija

Ocena atrakcije kombinuje poklapanje sa interesovanjima i popularnost.
Ciljni broj aktivnosti određuje se iz tempa, uz skraćenje prvog i
poslednjeg dana prema vremenu leta. Atrakcije se biraju pohlepno po
opadajućoj oceni dok se ne dostigne ciljni broj ili raspoloživo vreme.

6.3 Raspodela po danima

1.  Izabrane atrakcije se grupišu k-means algoritmom (k = broj dana,
    inicijalizacija k-means++), uz Haversine rastojanje.

2.  Rebalansiranje: iz grupe čiji je kapacitet prekoračen premešta se
    atrakcija sa najmanjim povećanjem rastojanja u grupu sa slobodnim
    kapacitetom.

3.  Prvom i poslednjem danu dodeljuju se grupe sa najmanjim ukupnim
    trajanjem poseta.

6.4 Redosled obilaska

1.  Početno rešenje heuristikom najbližeg suseda, polazeći od smeštaja.

2.  2-opt poboljšanje: obrću se segmenti putanje dok god to skraćuje
    putanju i ne narušava radno vreme.

3.  Vreme kretanja se procenjuje iz rastojanja (pešice 5 km/h do 2 km,
    gradskim prevozom 20 km/h preko toga); dodaju se trajanje posete i
    pauza za ručak.

4.  Atrakcija zatvorena u trenutku dolaska premešta se na drugu poziciju
    ili dan, a ako to nije moguće, uklanja se atrakcija sa najnižom
    ocenom.

**Napomena o dizajnu:** broj atrakcija u jednom danu je mali (najviše
6), pa heuristika daje rešenja bliska optimalnim uz zanemarljivo vreme
izvršavanja. Isti postupak koristi se za opciju „Optimizuj redosled“.

7\. ARHITEKTURA SISTEMA

Voyra koristi mikroservisnu arhitekturu. Angular aplikacija komunicira
isključivo sa API Gateway-em; servisi međusobno komuniciraju putem REST
poziva, a svaki servis koji čuva podatke ima sopstvenu MongoDB bazu
(database-per-service).

| **Servis**          | **Tehnologija**      | **Port** | **Odgovornost**                                                             |
|---------------------|----------------------|----------|-----------------------------------------------------------------------------|
| Angular Frontend    | Angular + TypeScript | 4200     | Korisnički interfejs                                                        |
| API Gateway         | Node.js + Express    | 4000     | Jedina ulazna tačka; validacija JWT tokena; rutiranje                       |
| User Service        | Node.js + Express    | 4001     | Registracija, prijava, odobravanje naloga, slanje elektronske pošte         |
| Trip Service        | Node.js + Express    | 4002     | Putovanja, rezervacije, destinacije, atrakcije administratora; orkestracija |
| Integration Service | Node.js + Express    | 4003     | Adapteri ka eksternim servisima, keš, mock režim                            |
| Planner Service     | Node.js + Express    | 4004     | Rangiranje ponuda i generisanje plana; bez stanja                           |
| MongoDB             | MongoDB              | 27017    | Baze users_db, trips_db, integration_db                                     |

7.1 Tok generisanja plana

1.  Angular šalje POST /trips/plan na API Gateway (port 4000).

2.  Gateway validira JWT token, ako postoji, i prosleđuje zahtev Trip
    Service-u.

3.  Trip Service od Integration Service-a preuzima atrakcije i spaja ih
    sa atrakcijama administratora.

4.  Planner Service generiše plan i procenu troška.

5.  Trip Service vraća plan; za gosta se plan ne čuva.

7.2 Tok rezervacije leta

1.  Angular šalje POST /trips/{id}/booking sa podacima o putnicima.

2.  Gateway validira JWT; Trip Service proverava vlasništvo i status
    putovanja.

3.  Integration Service ponovo proverava ponudu i kreira rezervaciju kod
    servisa Duffel.

4.  Trip Service čuva kod rezervacije i menja status u REZERVISANO.

8\. TEHNOLOGIJE I OBRAZLOŽENJE IZBORA

| **Tehnologija**      | **Uloga**         | **Razlog izbora**                                                                              |
|----------------------|-------------------|------------------------------------------------------------------------------------------------|
| Angular + TypeScript | Frontend          | Komponentna arhitektura pogodna za čarobnjak i interaktivni prikaz plana; tipska bezbednost    |
| Node.js + Express    | Backend servisi   | Isti jezik na klijentu i serveru; asinhroni model pogodan za čekanje odgovora eksternih API-ja |
| MongoDB + Mongoose   | Baza podataka     | Dokument model odgovara putovanju sa ugnježdenim planom; TTL indeksi za keš                    |
| JWT + bcrypt         | Bezbednost        | Autentifikacija bez stanja na serveru; sigurno heširanje lozinki                               |
| Nodemailer           | Elektronska pošta | Obaveštenja o odobrenju i odbijanju registracije                                               |
| REST + OpenAPI       | Komunikacija      | Jednostavan protokol; dokumentacija svakog servisa na /docs                                    |

9\. MODEL PODATAKA (MONGODB)

Izabrani let i smeštaj čuvaju se u putovanju kao kopija u trenutku
izbora, jer se cene kod eksternih servisa menjaju.

| **Kolekcija**       | **Ključna polja**                                                                                                                                                |
|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| users               | id, ime, prezime, email, korisnickoIme, lozinkaHash, uloga (korisnik/admin), status (na_cekanju/odobren/odbijen/blokiran)                                        |
| trips               | id, korisnikId, polaziste, odrediste, datumOd, datumDo, brojPutnika, budzet, preferencije, let, smestaj, plan \[dani → aktivnosti\], trosak, rezervacija, status |
| destinations        | id, naziv, drzava, opis, slika, istaknuta (bool), redosled                                                                                                       |
| attractions         | id, izvor (admin/eksterni), naziv, grad, lat, lng, kategorija, trajanjeMin, radnoVreme, cenaUlaznice                                                             |
| interest_categories | id, naziv, eksterneKategorije                                                                                                                                    |
| search_stats        | odrediste, datum, brojPretraga, brojSacuvanih                                                                                                                    |
| api_cache           | kljuc, provajder, odgovor, istice (TTL indeks)                                                                                                                   |

10\. KORISNIČKI INTERFEJS

| **Stranica**        | **Sadržaj i funkcionalnost**                                                       |
|---------------------|------------------------------------------------------------------------------------|
| Početna             | Brza pretraga, istaknute i popularne destinacije                                   |
| Kreiranje putovanja | Čarobnjak: parametri, izbor leta, izbor smeštaja, plan sa budžetom                 |
| Atrakcije           | Pregled i filtriranje atrakcija za destinaciju                                     |
| Moja putovanja      | Lista putovanja sa statusima; detalji, izmena plana, rezervacija i otkazivanje     |
| Auth stranice       | Registracija i prijava                                                             |
| Profil              | Lični podaci i promena lozinke                                                     |
| Admin panel         | Zahtevi za registraciju, korisnici, destinacije, atrakcije, kategorije, statistika |

11\. NEFUNKCIONALNI ZAHTEVI

| **Zahtev**                                    | **Vrednost**                                                       |
|-----------------------------------------------|--------------------------------------------------------------------|
| Vreme izvršavanja algoritma planiranja        | \< 1 s za putovanje do 14 dana i do 100 atrakcija                  |
| Vreme generisanja plana sa eksternim pozivima | \< 10 s; \< 2 s kada su podaci u kešu                              |
| Trajanje keša                                 | Letovi 15 min, smeštaj 30 min, atrakcije 7 dana                    |
| Nedostupnost eksternih servisa                | Prelazak na keš ili mock podatke uz poruku korisniku               |
| Bezbednost lozinki                            | bcrypt; najmanje 8 karaktera, veliko slovo, broj i specijalni znak |
| Autentifikacija                               | JWT tokeni ističu nakon 24 sata                                    |
| Tajni podaci                                  | API ključevi i JWT ključ u promenljivima okruženja                 |
| Format API odgovora                           | JSON; OpenAPI dokumentacija na /docs                               |
| Pokretanje sistema                            | Lokalno; jedna komanda po servisu (npm start)                      |
