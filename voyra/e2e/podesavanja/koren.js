/**
 * Koreni hook mocha-e.
 *
 * Pre svega proverava da frontend i gateway odgovaraju, pa da skup ne padne
 * sa petnaest nejasnih poruka kada stek nije pokrenut.
 *
 * Snimke ekrana pri padu prave sami skupovi (`podesavanja/pad.js`), jer se
 * `afterEach` izvrsava od najdubljeg ka najplicem - do korenog hooka bi
 * drajver vec bio ugasen.
 */

const fs = require('fs');

const KONFIG = require('./konfiguracija');
const { apsolutni } = require('./drajver');

const odgovara = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.status < 500;
  } catch {
    return false;
  }
};

exports.mochaHooks = {
  async beforeAll() {
    const izvestaj = apsolutni(KONFIG.izvestajDir);
    fs.mkdirSync(izvestaj, { recursive: true });

    const nedostupni = [];

    if (!(await odgovara(KONFIG.frontend))) nedostupni.push(`frontend (${KONFIG.frontend})`);
    if (!(await odgovara(`${KONFIG.api}/v1/health`))) nedostupni.push(`gateway (${KONFIG.api})`);

    if (nedostupni.length > 0) {
      throw new Error(
        `E2E ne moze da pocne - nije dostupno: ${nedostupni.join(', ')}.\n` +
          'Pokreni stek (npm run dev u voyra/) ili postavi E2E_FRONTEND_URL i E2E_API_URL.'
      );
    }

    console.log(
      `\n[E2E] frontend ${KONFIG.frontend}, gateway ${KONFIG.api}, ` +
        `rezim ${KONFIG.vidljivo ? 'vidljiv' : 'zatvoren (headless)'}\n`
    );
  }
};
