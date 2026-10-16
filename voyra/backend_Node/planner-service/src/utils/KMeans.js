const Distances = require('./Distances');

const MAX_ITERACIJA = 10;
const BROJ_RESTARTOVA = 5;

/**
 * K-means++ klasterovanje atrakcija po geografskoj lokaciji.
 *
 * Radi nad tackama oblika {x: lon, y: lat, attraction}. Rastojanja se
 * racunaju Haversine formulom (ne euklidski nad stepenima) - na geografskim
 * koordinatama euklidsko rastojanje nije tacno jer se duzina stepena
 * geografske duzine menja sa sirinom.
 *
 * Svaki klaster postaje jedan dan putovanja: atrakcije istog dana su
 * prostorno bliske, pa se obilaze bez nepotrebnog prelazenja grada.
 */
class KMeans {
  /**
   * @param {object} opcije
   * @param {Function} [opcije.random] - generator u [0, 1); podrazumevano
   *        Math.random. Testovi prosledjuju generator sa seed-om, pa su
   *        rezultati ponovljivi iako je k-means nasumican.
   */
  constructor({ random } = {}) {
    this.distances = new Distances();
    this.random = typeof random === 'function' ? random : Math.random;
  }

  /** {x, y} -> {lat, lon} za racunanje rastojanja */
  _uTacku(p) {
    return { lat: p.y, lon: p.x };
  }

  _rastojanje(a, b) {
    return this.distances.between(this._uTacku(a), this._uTacku(b));
  }

  /**
   * K-means++ inicijalizacija:
   * prvi centroid je nasumican, a svaki sledeci se bira sa verovatnocom
   * proporcionalnom KVADRATU rastojanja do najblizeg vec izabranog
   * centroida (D^2 sempliranje). Time se centroidi razvlace po prostoru,
   * sto obican random ne garantuje.
   */
  kmeansPlusPlusInit(points, k) {
    const centroidi = [];

    const prvi = points[Math.floor(this.random() * points.length)];
    centroidi.push({ x: prvi.x, y: prvi.y });

    while (centroidi.length < k) {
      const kvadrati = points.map((t) => {
        const najblize = Math.min(...centroidi.map((c) => this._rastojanje(t, c)));
        return najblize * najblize;
      });

      const zbir = kvadrati.reduce((s, d) => s + d, 0);

      // Sve tacke se poklapaju - nema sta da se razvlaci
      if (zbir === 0) {
        const nasumicna = points[Math.floor(this.random() * points.length)];
        centroidi.push({ x: nasumicna.x, y: nasumicna.y });
        continue;
      }

      // Rulet selekcija po D^2 raspodeli
      let prag = this.random() * zbir;
      let izabrani = points[points.length - 1];

      for (let i = 0; i < points.length; i++) {
        prag -= kvadrati[i];
        if (prag <= 0) {
          izabrani = points[i];
          break;
        }
      }

      centroidi.push({ x: izabrani.x, y: izabrani.y });
    }

    return centroidi;
  }

  /** Svaku tacku dodeljuje najblizem centroidu. */
  assignCluster(points, centroids) {
    const klasteri = centroids.map(() => []);

    for (const tacka of points) {
      let najbliziIndeks = 0;
      let najmanje = Infinity;

      centroids.forEach((c, i) => {
        const d = this._rastojanje(tacka, c);
        if (d < najmanje) {
          najmanje = d;
          najbliziIndeks = i;
        }
      });

      klasteri[najbliziIndeks].push(tacka);
    }

    return klasteri;
  }

  /** Novi centroid = aritmeticka sredina koordinata. Prazan klaster zadrzava stari. */
  updateCentroids(clusters, stariCentroidi) {
    return clusters.map((klaster, i) => {
      if (klaster.length === 0) return stariCentroidi[i];

      return {
        x: klaster.reduce((s, t) => s + t.x, 0) / klaster.length,
        y: klaster.reduce((s, t) => s + t.y, 0) / klaster.length
      };
    });
  }

  /**
   * Zbir rastojanja svake tacke do centroida svog klastera.
   * Manja vrednost = kompaktniji klasteri.
   */
  inertia(clusters, centroids) {
    return clusters.reduce(
      (zbir, klaster, i) =>
        zbir + klaster.reduce((s, t) => s + this._rastojanje(t, centroids[i]), 0),
      0
    );
  }

  /** Jedan prolaz k-means algoritma od nasumicne inicijalizacije. */
  _jedanProlaz(points, k, maxIterations) {
    let centroidi = this.kmeansPlusPlusInit(points, k);
    let klasteri = this.assignCluster(points, centroidi);

    for (let i = 0; i < maxIterations; i++) {
      const novi = this.updateCentroids(klasteri, centroidi);

      // Konvergencija - centroidi se vise ne pomeraju
      const pomeraj = novi.reduce(
        (max, c, j) => Math.max(max, this._rastojanje(c, centroidi[j])),
        0
      );

      centroidi = novi;
      klasteri = this.assignCluster(points, centroidi);

      if (pomeraj < 0.001) break;
    }

    return { klasteri, centroidi, inertia: this.inertia(klasteri, centroidi) };
  }

  /**
   * Kompletan k-means: vise nasumicnih pokusaja, vraca se najkompaktniji.
   * (K-means je osetljiv na pocetne centroide, pa jedan pokusaj ume da
   * zavrsi u losem lokalnom minimumu.)
   */
  cluster(points, k, maxIterations = MAX_ITERACIJA) {
    if (!points || points.length === 0) return [];

    const brojKlastera = Math.max(1, Math.min(k, points.length));
    if (brojKlastera === 1) return [points];

    let najbolji = null;

    for (let i = 0; i < BROJ_RESTARTOVA; i++) {
      const pokusaj = this._jedanProlaz(points, brojKlastera, maxIterations);
      if (!najbolji || pokusaj.inertia < najbolji.inertia) {
        najbolji = pokusaj;
      }
    }

    return najbolji.klasteri.filter((kl) => kl.length > 0);
  }

  /**
   * Isto sto i `cluster`, ali vraca i centroide - rebalansiranje ih
   * trazi da bi znalo koliko premestanje povecava zbir rastojanja.
   * Prazni klasteri se NE izbacuju: jedan klaster odgovara jednom danu.
   */
  clusterSaCentroidima(points, k, maxIterations = MAX_ITERACIJA) {
    if (!points || points.length === 0) return { klasteri: [], centroidi: [] };

    const brojKlastera = Math.max(1, Math.min(k, points.length));

    if (brojKlastera === 1) {
      const centroid = this.updateCentroids([points], [{ x: points[0].x, y: points[0].y }]);
      return { klasteri: [points], centroidi: centroid };
    }

    let najbolji = null;

    for (let i = 0; i < BROJ_RESTARTOVA; i++) {
      const pokusaj = this._jedanProlaz(points, brojKlastera, maxIterations);
      if (!najbolji || pokusaj.inertia < najbolji.inertia) najbolji = pokusaj;
    }

    return { klasteri: najbolji.klasteri, centroidi: najbolji.centroidi };
  }

  /** Rastojanje tacke do centroida - koristi ga rebalansiranje. */
  doCentroida(tacka, centroid) {
    return this._rastojanje(tacka, centroid);
  }
}

module.exports = KMeans;
