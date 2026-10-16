const { haversineDistance } = require('./distance');

/**
 * Geografska rastojanja nad tackama oblika {lat, lon}.
 * Klasa (a ne skup funkcija) da bi se mogla ubaciti u RouteOptimizer
 * i TravelPlanner kao zavisnost.
 */
class Distances {
  /** Rastojanje izmedju dve tacke u kilometrima. */
  between(a, b) {
    if (!a || !b) return 0;
    return haversineDistance(a.lat, a.lon, b.lat, b.lon);
  }

  /** Duzina otvorene putanje kroz niz tacaka, redom kojim su date. */
  total(tacke) {
    if (!tacke || tacke.length < 2) return 0;

    let zbir = 0;
    for (let i = 0; i < tacke.length - 1; i++) {
      zbir += this.between(tacke[i], tacke[i + 1]);
    }
    return zbir;
  }
}

module.exports = Distances;
