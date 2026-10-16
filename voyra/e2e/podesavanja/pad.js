/**
 * SNIMAK EKRANA I HTML-a KADA TEST PADNE.
 *
 * Zove se iz `afterEach` svakog skupa, PRE gašenja drajvera. Koreni hook
 * mocha-e za to nije dobar: `afterEach` se izvršava od najdubljeg ka
 * najplićem, pa bi drajver do korenog hooka već bio ugašen.
 *
 * Bez ovoga je pad u zatvorenom (headless) režimu praktično neistraživ.
 */

const fs = require('fs');
const path = require('path');

const KONFIG = require('./konfiguracija');
const { apsolutni } = require('./drajver');

const bezimena = (tekst) =>
  String(tekst)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

/**
 * @param {object} test - `this.currentTest` iz mocha hooka
 * @param {Array} drajveri - jedan ili više drajvera (scenariji sa dve sesije)
 */
const snimiAkoJePao = async (test, drajveri) => {
  if (test?.state !== 'failed') return;

  const dir = apsolutni(KONFIG.izvestajDir);
  fs.mkdirSync(dir, { recursive: true });

  const osnova = bezimena(test.fullTitle());
  const lista = (Array.isArray(drajveri) ? drajveri : [drajveri]).filter(Boolean);

  for (const [i, drajver] of lista.entries()) {
    const sufiks = lista.length > 1 ? `-sesija${i + 1}` : '';

    try {
      const slika = await drajver.takeScreenshot();
      fs.writeFileSync(path.join(dir, `${osnova}${sufiks}.png`), slika, 'base64');

      const html = await drajver.getPageSource();
      fs.writeFileSync(path.join(dir, `${osnova}${sufiks}.html`), html, 'utf8');

      console.log(`      [snimak] ${KONFIG.izvestajDir}/${osnova}${sufiks}.png`);
    } catch (e) {
      console.warn(`      [snimak nije napravljen] ${e.message}`);
    }
  }
};

module.exports = { snimiAkoJePao };
