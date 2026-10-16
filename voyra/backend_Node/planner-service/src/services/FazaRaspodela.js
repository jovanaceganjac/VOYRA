const KMeans = require('../utils/KMeans');

/**
 * FAZA 4: raspodela atrakcija po danima (spec §6.3).
 *
 *   1. k-means++ (Haversine) nad koordinatama
 *   2. kapacitet dana = ciljni broj aktivnosti iz Faze 3
 *   3. rebalansiranje prekoracenih grupa
 *   4. prvi i poslednji dan dobijaju grupe sa najmanjim trajanjem poseta
 *
 * ODSTUPANJE OD §6.3: spec postavlja `k = broj dana`, sto podrazumeva da
 * atrakcija ima dovoljno za sve dane. Kada ih nema, `k` je broj dana koji
 * je zaista potreban (vidi `potrebnoDana`), a preostali dani ostaju
 * slobodni. Obrazlozenje je u ALGORITHMS.md: ravnomerno razvlacenje osam
 * atrakcija na pet dana ponistava tempo koji je korisnik izabrao - tako
 * je i nastala prijavljena greska "jedna aktivnost dnevno".
 */

/** Zbir trajanja poseta u grupi. */
const trajanjeGrupe = (grupa) => grupa.reduce((zbir, a) => zbir + (a.duration || 0), 0);

/**
 * Najmanji broj dana u koji staje `brojAtrakcija`, racunato od dana sa
 * najvecim kapacitetom. Dani se popunjavaju do vrha, umesto da se mali
 * broj atrakcija razvuce po svima.
 */
const potrebnoDana = (dani, brojAtrakcija) => {
  const kapaciteti = dani.map((d) => d.targetCount).sort((a, b) => b - a);

  let zbir = 0;

  for (let i = 0; i < kapaciteti.length; i++) {
    zbir += kapaciteti[i];
    if (zbir >= brojAtrakcija) return i + 1;
  }

  return kapaciteti.length;
};

/**
 * REBALANSIRANJE (spec §6.3 t.2).
 *
 * Dok postoji grupa preko kapaciteta, iz nje se premesta atrakcija cije
 * premestanje u neku grupu sa slobodnim mestom NAJMANJE povecava zbir
 * rastojanja do centroida.
 *
 * Zavrsetak: svako premestanje smanjuje ukupno prekoracenje
 * `suma max(0, |G_i| - kapacitet_i)` tacno za 1, jer odrediste po
 * definiciji ima slobodno mesto pa svoje prekoracenje ne povecava.
 * Prekoracenje je nenegativan ceo broj, najvise `n`, pa se petlja
 * zavrsava posle najvise `n` koraka. Kada nijedna grupa nema slobodno
 * mesto (vise atrakcija nego ukupnog kapaciteta), petlja staje i vraca
 * zateceno stanje - bolje nego da se vrti u prazno.
 */
const rebalansiraj = (klasteri, centroidi, kapaciteti, kmeans) => {
  const grupe = klasteri.map((g) => [...g]);
  const maxKoraka = grupe.reduce((z, g) => z + g.length, 0) + 1;

  for (let korak = 0; korak < maxKoraka; korak++) {
    const prekoracene = grupe
      .map((g, i) => ({ i, visak: g.length - (kapaciteti[i] ?? 0) }))
      .filter((g) => g.visak > 0);

    if (prekoracene.length === 0) break;

    const slobodne = grupe
      .map((g, i) => ({ i, mesta: (kapaciteti[i] ?? 0) - g.length }))
      .filter((g) => g.mesta > 0);

    // Vise atrakcija nego ukupnog kapaciteta - nema gde da se premesti
    if (slobodne.length === 0) break;

    let najbolji = null;

    for (const { i } of prekoracene) {
      grupe[i].forEach((atrakcija, idx) => {
        const tacka = { x: atrakcija.lon, y: atrakcija.lat };
        const trenutno = kmeans.doCentroida(tacka, centroidi[i]);

        for (const { i: j } of slobodne) {
          const posle = kmeans.doCentroida(tacka, centroidi[j]);
          const povecanje = posle - trenutno;

          if (!najbolji || povecanje < najbolji.povecanje) {
            najbolji = { iz: i, idx, u: j, povecanje };
          }
        }
      });
    }

    if (!najbolji) break;

    const [premestena] = grupe[najbolji.iz].splice(najbolji.idx, 1);
    grupe[najbolji.u].push(premestena);
  }

  return grupe;
};

/**
 * DODELA GRUPA DANIMA (spec §6.3 t.3).
 *
 * Najpre se grupe pare sa danima po velicini: najveca grupa ide danu sa
 * najvecim kapacitetom, da grupa od sest atrakcija ne zavrsi na danu koji
 * prima tri. Zatim se, medju danima ISTOG kapaciteta, krajnjim danima
 * (prvi i poslednji) daju grupe sa najmanjim ukupnim trajanjem poseta -
 * pravilo iz §6.3 t.3. Dan koji ne dobije grupu ostaje slobodan.
 */
const dodeliDanima = (grupe, dani) => {
  const aktivni = dani.filter((d) => d.targetCount > 0);
  const raspored = new Map();

  if (aktivni.length === 0 || grupe.length === 0) return raspored;

  // 1. pariranje po velicini: najveca grupa -> najveci kapacitet
  const poKapacitetu = [...aktivni].sort(
    (a, b) => b.targetCount - a.targetCount || a.day - b.day
  );

  const poVelicini = grupe
    .map((g, i) => ({ i, velicina: g.length, trajanje: trajanjeGrupe(g) }))
    .sort((a, b) => b.velicina - a.velicina || a.trajanje - b.trajanje);

  const zaDan = new Map(); // day -> indeks grupe
  poVelicini.forEach((g, idx) => {
    const dan = poKapacitetu[idx];
    if (dan) zaDan.set(dan.day, g.i);
  });

  // 2. krajnji dani uzimaju najkracu grupu MEDJU DANIMA ISTOG kapaciteta
  const krajnji = aktivni.length > 1 ? [aktivni[0], aktivni[aktivni.length - 1]] : [aktivni[0]];

  // Dan kome je grupa vec dodeljena po ovom pravilu se vise ne dira,
  // inace bi poslednji dan uzeo grupu koju je prvi upravo dobio
  const fiksirani = new Set();

  for (const kraj of krajnji) {
    const moj = zaDan.get(kraj.day);
    if (moj === undefined) continue;

    const zamenici = aktivni.filter(
      (d) =>
        d.day !== kraj.day &&
        !fiksirani.has(d.day) &&
        d.targetCount === kraj.targetCount &&
        zaDan.has(d.day)
    );

    let najkraci = { dan: kraj, trajanje: trajanjeGrupe(grupe[moj]) };

    for (const d of zamenici) {
      const t = trajanjeGrupe(grupe[zaDan.get(d.day)]);
      if (t < najkraci.trajanje) najkraci = { dan: d, trajanje: t };
    }

    if (najkraci.dan.day !== kraj.day) {
      const drugi = zaDan.get(najkraci.dan.day);
      zaDan.set(najkraci.dan.day, moj);
      zaDan.set(kraj.day, drugi);
    }

    fiksirani.add(kraj.day);
  }

  for (const dan of aktivni) {
    const indeks = zaDan.get(dan.day);
    raspored.set(dan.day, indeks === undefined ? [] : grupe[indeks]);
  }

  return raspored;
};

/**
 * @param {Array} atrakcije - izabrane u Fazi 3
 * @param {Array} dani - iz `izracunajDane`
 * @param {object} opcije - { random } za ponovljive testove
 * @returns {{ raspored: Map<number, Array>, slobodniDani: Array<number> }}
 */
const rasporediPoDanima = (atrakcije, dani, { random } = {}) => {
  const saVremenom = dani.filter((d) => d.targetCount > 0);
  const prazan = new Map(dani.map((d) => [d.day, []]));

  if (!atrakcije || atrakcije.length === 0 || saVremenom.length === 0) {
    return { raspored: prazan, slobodniDani: saVremenom.map((d) => d.day) };
  }

  // Koliko dana je zaista potrebno; visak dana ostaje slobodan
  const k = Math.min(saVremenom.length, potrebnoDana(saVremenom, atrakcije.length));

  const aktivni = [...saVremenom]
    .sort((a, b) => b.targetCount - a.targetCount || a.day - b.day)
    .slice(0, k)
    .sort((a, b) => a.day - b.day);

  const kmeans = new KMeans({ random });
  const tacke = atrakcije.map((a) => ({ x: a.lon, y: a.lat, attraction: a }));

  const { klasteri, centroidi } = kmeans.clusterSaCentroidima(tacke, aktivni.length);

  // Kapacitet grupe = ciljni broj dana koji ce je dobiti. Grupe jos nisu
  // dodeljene danima, pa se uzimaju kapaciteti dana sortirani opadajuce,
  // a grupe po velicini - tako najveca grupa dobija najveci kapacitet.
  const kapacitetiDana = aktivni.map((d) => d.targetCount).sort((a, b) => b - a);
  const redosledGrupa = klasteri
    .map((g, i) => ({ i, velicina: g.length }))
    .sort((a, b) => b.velicina - a.velicina);

  const kapaciteti = new Array(klasteri.length).fill(0);
  redosledGrupa.forEach((g, idx) => {
    kapaciteti[g.i] = kapacitetiDana[idx] ?? 0;
  });

  const izbalansirane = rebalansiraj(klasteri, centroidi, kapaciteti, kmeans);
  const grupeAtrakcija = izbalansirane.map((g) => g.map((t) => t.attraction));

  const raspored = dodeliDanima(grupeAtrakcija, aktivni);

  // Dani bez grupe (nema vremena ili nema vise atrakcija) ostaju prazni
  for (const d of dani) {
    if (!raspored.has(d.day)) raspored.set(d.day, []);
  }

  const slobodniDani = saVremenom
    .filter((d) => (raspored.get(d.day) || []).length === 0)
    .map((d) => d.day);

  return { raspored, slobodniDani };
};

module.exports = { rasporediPoDanima, rebalansiraj, dodeliDanima, trajanjeGrupe, potrebnoDana };
