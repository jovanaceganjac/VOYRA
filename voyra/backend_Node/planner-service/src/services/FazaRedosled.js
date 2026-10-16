const Distances = require('../utils/Distances');
const RouteOptimizer = require('../utils/RouteOptimizer');
const { uMinute, uVreme, uRadnomVremenu } = require('../utils/vreme');
const {
  PRAG_PESACENJA_KM,
  BRZINA_PESACENJA_KMH,
  BRZINA_PREVOZA_KMH,
  RUCAK_MINUTA,
  RUCAK_NE_PRE
} = require('../config/preferencije');

/**
 * FAZA 5: redosled obilaska i satnica (spec §6.4).
 *
 *   1. najblizi sused polazeci OD SMESTAJA
 *   2. 2-opt koji prihvata zamenu samo ako skracuje putanju I ne narusava
 *      radno vreme
 *   3. vreme kretanja iz rastojanja (pesice do 2 km, inace gradski prevoz)
 *   4. satnica sa pauzom za rucak; dan se ne produzava preko dayEnd
 *   5. atrakcija zatvorena u trenutku dolaska se premesta, a ako ne moze,
 *      uklanja se najlosije ocenjena
 */

const distances = new Distances();
const optimizer = new RouteOptimizer(distances);

/**
 * Vreme kretanja (spec §6.4 t.3).
 * Do 2 km pesice 5 km/h, preko toga gradskim prevozom 20 km/h.
 */
const vremeKretanja = (km) => {
  const razdaljina = Number.isFinite(km) ? Math.max(0, km) : 0;

  const pesice = razdaljina <= PRAG_PESACENJA_KM;
  const brzina = pesice ? BRZINA_PESACENJA_KMH : BRZINA_PREVOZA_KMH;

  return {
    travelMinutes: Math.round((razdaljina / brzina) * 60),
    travelMode: pesice ? 'pesice' : 'prevoz',
    travelKm: Math.round(razdaljina * 100) / 100
  };
};

/** Heuristika najblizeg suseda, polazeci od zadate tacke (spec §6.4 t.1). */
const najbliziSused = (start, atrakcije) => {
  if (!atrakcije || atrakcije.length <= 1) return [...(atrakcije || [])];

  const preostale = [...atrakcije];
  const putanja = [];
  let trenutna = start;

  while (preostale.length > 0) {
    let najbliziIdx = 0;
    let najmanje = Infinity;

    preostale.forEach((a, i) => {
      const d = distances.between(trenutna, a);
      if (d < najmanje) {
        najmanje = d;
        najbliziIdx = i;
      }
    });

    const [sledeca] = preostale.splice(najbliziIdx, 1);
    putanja.push(sledeca);
    trenutna = sledeca;
  }

  return putanja;
};

/**
 * Satnica za zadati redosled.
 *
 * Ne menja redosled - samo racuna vremena i prijavljuje sta ne valja:
 *   `zatvorene`  - atrakcije na koje se stize van radnog vremena
 *   `nestale`    - atrakcije za koje nema vremena do kraja dana
 *
 * @returns {{ stavke, lunch, totalDistance, zatvorene, nestale, krajMin }}
 */
const napraviSatnicu = ({ redosled, start, dan, zadrziSve = false }) => {
  const pocetak = uMinute(dan.availableFrom) ?? 9 * 60;
  const kraj = uMinute(dan.availableTo) ?? 20 * 60;
  const rucakNePre = uMinute(RUCAK_NE_PRE) ?? 12 * 60 + 30;

  let sat = pocetak;
  let mesto = start;
  let ukupnoKm = 0;
  let rucak = null;

  const stavke = [];
  const zatvorene = [];
  const nestale = [];

  for (const a of redosled) {
    const km = mesto ? distances.between(mesto, a) : 0;
    const kretanje = vremeKretanja(km);

    let dolazak = sat + kretanje.travelMinutes;

    /*
     * Pri GENERISANJU se ceka otvaranje: bez toga nijedna atrakcija koja
     * radi kasno (nocni zivot, restorani) ne bi mogla da udje u plan,
     * jer bi je prvi dolazak uvek zatekao zatvorenu.
     *
     * Pri RUCNOJ IZMENI se NE ceka. Korisnik je stavio nocni klub na
     * jutro; da satnica tiho pomeri dolazak na 20:00, videla bi se
     * vremena koja niko nije trazio. Umesto toga dolazak ostaje kakav
     * jeste, a poseta se obelezi kao `zatvoreno` (spec §4.6).
     */
    const otvara = uMinute(a.openingHours?.open);
    if (!zadrziSve && otvara !== null && dolazak < otvara) dolazak = otvara;

    // Rucak prvi put kada satnica predje 12:30 (spec §6.4 t.3)
    if (!rucak && dolazak >= rucakNePre) {
      rucak = { startTime: uVreme(dolazak), endTime: uVreme(dolazak + RUCAK_MINUTA) };
      dolazak += RUCAK_MINUTA;
    }

    const odlazak = dolazak + (a.duration || 0);

    // Dan se ne produzava preko dayEnd
    const posleKraja = odlazak > kraj;

    /*
     * `zadrziSve` razdvaja RACUNANJE satnice od ODLUKE sta ispada.
     *
     * Pri generisanju plana (§6.4 t.4) atrakcija koja ne staje se
     * premesta ili uklanja, pa ovde ispada iz satnice. Pri RUCNOJ IZMENI
     * (§4.6) korisnik je sam odlucio sta zeli, pa se ista atrakcija
     * zadrzava i samo obelezi - odluku donosi korisnik, ne algoritam.
     */
    if (posleKraja && !zadrziSve) {
      nestale.push(a);
      continue;
    }

    const otvoreno = uRadnomVremenu(dolazak, odlazak, a.openingHours);
    if (!otvoreno) zatvorene.push(a);
    if (posleKraja) nestale.push(a);

    ukupnoKm += km;

    stavke.push({
      ...a,
      order: stavke.length + 1,
      startTime: uVreme(dolazak),
      endTime: uVreme(odlazak),
      travelMinutes: kretanje.travelMinutes,
      travelMode: kretanje.travelMode,
      travelKm: kretanje.travelKm,
      // Zatvoreno ima prednost: to je razlog zbog kog poseta i ne valja
      violation: !otvoreno ? 'zatvoreno' : posleKraja ? 'posle_kraja_dana' : null
    });

    sat = odlazak;
    mesto = a;
  }

  return {
    stavke,
    lunch: rucak,
    totalDistance: Math.round(ukupnoKm * 100) / 100,
    zatvorene,
    nestale,
    krajMin: sat
  };
};

/** Da li satnica zadatog redosleda nijednu atrakciju ne zatice zatvorenu. */
const bezNarusenja = (redosled, start, dan) =>
  napraviSatnicu({ redosled, start, dan }).zatvorene.length === 0;

/**
 * Redosled obilaska za jedan dan: najblizi sused pa 2-opt.
 *
 * Izdvojeno kao samostalna funkcija, jer isti postupak koristi i buduca
 * ruta „Optimizuj redosled" za jedan dan (spec §6.4, napomena).
 *
 * @param {object} p - { atrakcije, start, dan }
 */
const urediDan = ({ atrakcije, start, dan }) => {
  if (!atrakcije || atrakcije.length === 0) {
    return { redosled: [], satnica: napraviSatnicu({ redosled: [], start, dan }) };
  }

  const pocetni = najbliziSused(start, atrakcije);

  // 2-opt prihvata zamenu samo ako skracuje putanju I ne narusava radno
  // vreme (spec §6.4 t.2). Bez provere bi krace resenje umelo da gurne
  // muzej na 19:00, kada je vec zatvoren.
  const optimizovan = optimizer.optimizeOdPocetka(pocetni, start, (kandidat) =>
    bezNarusenja(kandidat, start, dan)
  );

  return { redosled: optimizovan, satnica: napraviSatnicu({ redosled: optimizovan, start, dan }) };
};

/** Satnica je ispravna kada nista nije zatvoreno i nista nije ispalo. */
const bezProblema = (satnica) => satnica.zatvorene.length === 0 && satnica.nestale.length === 0;

/**
 * Da li atrakcija u ovaj dan ne moze da stane NI SAMA.
 *
 * Bar sa nocnim zivotom (20:00-02:00) ne staje u dan koji se zavrsava u
 * 20:00, ma gde ga stavili i ma sta izbacili oko njega. Bez ove provere
 * popravka bi redom izbacivala najslabije ocenjene atrakcije - a to su
 * upravo one koje bi stale - dok dan ne bi ostao prazan. Tako je plan za
 * "samo nocni zivot" gubio i aktivnosti koje su bile u redu.
 */
const nikakoNeStajeUDan = (atrakcija, dan) => {
  const od = uMinute(dan.availableFrom);
  const do_ = uMinute(dan.availableTo);

  if (od === null || do_ === null) return false;

  const trajanje = atrakcija.duration || 0;

  // Ni ceo dan nije dovoljan za samu posetu
  if (trajanje > do_ - od) return true;

  const radno = atrakcija.openingHours;
  if (!radno?.open || !radno?.close) return false;

  const otvara = uMinute(radno.open);
  const zatvara = radno.close === '24:00' ? 1440 : uMinute(radno.close);

  if (otvara === null || zatvara === null) return false;

  // Radno vreme preko ponoci (20:00-02:00): u okviru dana vazi deo do ponoci
  const kraj = zatvara > otvara ? zatvara : 1440;

  const pocetakPosete = Math.max(od, otvara);

  return pocetakPosete + trajanje > Math.min(do_, kraj);
};

/**
 * Sastavlja jedan dan, uz resavanje problematicnih atrakcija (spec §6.4 t.4).
 *
 * Problem je atrakcija koja je zatvorena u trenutku dolaska ILI za koju
 * nema vremena do kraja dana. Drugo sledi iz prvog: cekanje na otvaranje
 * pomera sve iza sebe, pa atrakcija koja radi kasno ume da izgura one
 * posle sebe iz dana. Zato se oba slucaja leče istim redosledom pokusaja:
 *
 *   1. druga pozicija u istom danu
 *   2. premestanje u drugi dan (radi pozivalac, preko `removedAttractions`)
 *   3. uklanjanje atrakcije sa najnizom ocenom - osim kada problematicna
 *      atrakcija u ovaj dan ne moze da stane ni sama, pa izlazi ona
 */
const sastaviDan = ({ atrakcije, start, dan }) => {
  const uklonjene = [];
  let tekuce = [...(atrakcije || [])];

  const rezultat = (satnica, redosled) => ({
    attractions: satnica.stavke,
    lunch: satnica.lunch,
    totalDistance: satnica.totalDistance,
    removedAttractions: uklonjene,
    redosled
  });

  // Najvise onoliko prolaza koliko ima atrakcija - svaki prolaz ili
  // resi problem, ili izbaci jednu atrakciju
  for (let prolaz = 0; prolaz <= (atrakcije?.length || 0); prolaz++) {
    const { redosled, satnica } = urediDan({ atrakcije: tekuce, start, dan });

    if (bezProblema(satnica)) return rezultat(satnica, redosled);

    const problematicna = satnica.zatvorene[0] || satnica.nestale[0];

    // 1) druga pozicija u istom danu
    const bez = tekuce.filter((a) => a.id !== problematicna.id);
    let popravljeno = null;

    for (let poz = 0; poz <= bez.length; poz++) {
      const kandidat = [...bez.slice(0, poz), problematicna, ...bez.slice(poz)];

      if (bezProblema(napraviSatnicu({ redosled: kandidat, start, dan }))) {
        popravljeno = kandidat;
        break;
      }
    }

    if (popravljeno) {
      return rezultat(napraviSatnicu({ redosled: popravljeno, start, dan }), popravljeno);
    }

    // 2) i 3) - ne moze u ovom danu, pa izlazi najlosije ocenjena.
    // Kada problematicna atrakcija ne staje ni sama, izlazi ona: nema
    // smisla praznit dan zbog nje.
    const najlosija = nikakoNeStajeUDan(problematicna, dan)
      ? problematicna
      : [...tekuce].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

    tekuce = tekuce.filter((a) => a.id !== najlosija.id);

    uklonjene.push({
      ...najlosija,
      reason:
        najlosija.id === problematicna.id
          ? satnica.zatvorene.includes(problematicna)
            ? 'zatvoreno u vreme dolaska'
            : 'nema dovoljno vremena u danu'
          : 'uklonjena da bi se oslobodilo vreme za drugu atrakciju'
    });
  }

  const konacna = napraviSatnicu({ redosled: tekuce, start, dan });

  return rezultat(konacna, tekuce);
};

module.exports = {
  sastaviDan,
  urediDan,
  napraviSatnicu,
  najbliziSused,
  vremeKretanja,
  bezNarusenja,
  nikakoNeStajeUDan
};
