/**
 * 2-opt optimizacija redosleda obilaska atrakcija.
 *
 * Heuristika: dokle god postoji par ivica cija zamena skracuje putanju,
 * obrni segment izmedju njih. Nalazi lokalni minimum (ne garantovano
 * globalni), ali je za 10-20 atrakcija praktican i brz.
 *
 * Radi nad OTVORENOM putanjom (krece se od prve atrakcije, ne vraca se
 * na pocetak) - tako se dan i obilazi, i tako se meri ukupna distanca.
 */
class RouteOptimizer {
  /**
   * @param {Distances} distances - instanca sa metodom between(a, b)
   */
  constructor(distances) {
    this.distances = distances;
  }

  /**
   * @param {Array} attractions - [{lat, lon, ...}, ...]
   * @returns {Array} iste atrakcije u optimizovanom redosledu
   */
  optimize(attractions, maxIterations = 100) {
    if (!attractions || attractions.length <= 2) return attractions || [];

    // Radimo nad indeksima, pa ih na kraju prevodimo nazad u atrakcije
    let tour = attractions.map((_, i) => i);
    let improved = true;
    let iteration = 0;

    while (improved && iteration < maxIterations) {
      improved = false;
      iteration++;

      for (let i = 0; i < tour.length - 2; i++) {
        for (let j = i + 2; j < tour.length; j++) {
          const delta = this._calculateDelta(attractions, tour, i, j);

          // Prag od 10 m - ignorisi poboljsanja koja su numericki sum
          if (delta < -0.01) {
            tour = this._reverseTour(tour, i + 1, j);
            improved = true;
          }
        }
      }
    }

    this.poslednjiBrojIteracija = iteration;

    return tour.map((idx) => attractions[idx]);
  }

  /**
   * Promena duzine putanje ako se obrne segment [i+1 .. j].
   *
   * Obrtanjem se menjaju samo dve ivice: (i, i+1) i (j, j+1).
   * Ako je j poslednji cvor, ivica (j, j+1) ne postoji - kod zatvorene
   * ture bi se tu racunao povratak na pocetak, ali putanja dana je
   * otvorena, pa se menja samo prva ivica.
   */
  _calculateDelta(attractions, tour, i, j) {
    const a = attractions[tour[i]];
    const b = attractions[tour[i + 1]];
    const c = attractions[tour[j]];

    // j je poslednji cvor - repna ivica ne postoji
    if (j + 1 >= tour.length) {
      return this.distances.between(a, c) - this.distances.between(a, b);
    }

    const d = attractions[tour[j + 1]];

    const pre = this.distances.between(a, b) + this.distances.between(c, d);
    const posle = this.distances.between(a, c) + this.distances.between(b, d);

    return posle - pre;
  }

  /**
   * 2-opt nad putanjom sa FIKSNOM polaznom tackom (spec §6.4 t.2).
   *
   * Polazna tacka je smestaj i uvek ostaje prva, pa se obrcu samo
   * segmenti izmedju atrakcija. Zamena se prihvata ako skracuje putanju
   * I ako je `prihvatljivo(kandidat)` tacno - tako se poboljsanje koje
   * gura atrakciju van radnog vremena odbacuje.
   *
   * @param {Array} attractions - atrakcije bez polazne tacke
   * @param {object} start - {lat, lon} polazna tacka
   * @param {Function} [prihvatljivo] - dodatni uslov nad kandidatom
   */
  optimizeOdPocetka(attractions, start, prihvatljivo = null, maxIterations = 100) {
    if (!attractions || attractions.length <= 1) return attractions || [];

    // Polazna tacka ulazi u putanju kao tacka 0 i nikada se ne pomera
    let tekuci = [...attractions];
    let duzina = this._duzinaSaPocetkom(tekuci, start);

    let poboljsano = true;
    let iteracija = 0;

    while (poboljsano && iteracija < maxIterations) {
      poboljsano = false;
      iteracija++;

      for (let i = 0; i < tekuci.length - 1; i++) {
        for (let j = i + 1; j < tekuci.length; j++) {
          const kandidat = [
            ...tekuci.slice(0, i),
            ...tekuci.slice(i, j + 1).reverse(),
            ...tekuci.slice(j + 1)
          ];

          const novaDuzina = this._duzinaSaPocetkom(kandidat, start);

          // Prag od 10 m - ispod toga je numericki sum
          if (novaDuzina >= duzina - 0.01) continue;
          if (prihvatljivo && !prihvatljivo(kandidat)) continue;

          tekuci = kandidat;
          duzina = novaDuzina;
          poboljsano = true;
        }
      }
    }

    this.poslednjiBrojIteracija = iteracija;

    return tekuci;
  }

  /** Duzina putanje start -> a1 -> ... -> an. */
  _duzinaSaPocetkom(attractions, start) {
    if (!attractions || attractions.length === 0) return 0;

    let zbir = start ? this.distances.between(start, attractions[0]) : 0;

    for (let i = 0; i < attractions.length - 1; i++) {
      zbir += this.distances.between(attractions[i], attractions[i + 1]);
    }

    return zbir;
  }

  /** Obrce deo niza izmedju start i end (ukljucivo). */
  _reverseTour(tour, start, end) {
    const novi = [...tour];

    while (start < end) {
      [novi[start], novi[end]] = [novi[end], novi[start]];
      start++;
      end--;
    }

    return novi;
  }
}

module.exports = RouteOptimizer;
