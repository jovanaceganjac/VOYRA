const fs = require('fs');
const path = require('path');

// Podrazumevano: voyra/mock_data (4 nivoa iznad src/utils)
const MOCK_DIR = path.resolve(
  __dirname,
  '../../',
  process.env.MOCK_DATA_PATH || '../../mock_data'
);

const memorija = new Map();

/**
 * Ucitava mock fajl sa diska i drzi ga u memoriji (simulira poziv
 * ka spoljnom API-ju). Ako fajl nedostaje, baca gresku koju ruta
 * prevodi u 500 "Data source unavailable".
 */
const loadMockData = (fileName) => {
  if (memorija.has(fileName)) return memorija.get(fileName);

  const putanja = path.join(MOCK_DIR, fileName);

  try {
    const podaci = JSON.parse(fs.readFileSync(putanja, 'utf8'));
    memorija.set(fileName, podaci);
    return podaci;
  } catch (err) {
    const greska = new Error(`Data source unavailable: ${fileName}`);
    greska.code = 'DATA_SOURCE_UNAVAILABLE';
    greska.putanja = putanja;
    throw greska;
  }
};

module.exports = { loadMockData, MOCK_DIR };
