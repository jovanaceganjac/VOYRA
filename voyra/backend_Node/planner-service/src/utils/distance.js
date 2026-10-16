const R_ZEMLJE_KM = 6371;

const uRadijane = (stepeni) => (stepeni * Math.PI) / 180;

/**
 * Haversine formula - najkrace rastojanje po povrsini Zemlje (km)
 * izmedju dve geografske tacke.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = uRadijane(lat2 - lat1);
  const dLon = uRadijane(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(uRadijane(lat1)) * Math.cos(uRadijane(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R_ZEMLJE_KM * c;
}

// `Distances` je klasa koja ovu formulu koristi nad tackama {lat, lon};
// ovde ostaje samo sama formula, bez druge kopije racuna duzine putanje
// (nju ima `Distances.total`).
module.exports = { haversineDistance };
