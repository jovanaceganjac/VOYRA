/**
 * Pravljenje i gasenje Chrome drajvera.
 *
 * ChromeDriver pribavlja Selenium Manager (ugradjen u selenium-webdriver
 * 4.6+), pa se nista ne preuzima rucno i ne drzi u repozitorijumu.
 */

const fs = require('fs');
const path = require('path');
const { Builder, Browser } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const KONFIG = require('./konfiguracija');

const apsolutni = (relativni) => path.resolve(__dirname, '..', relativni);

/**
 * @param {object} [opcije]
 * @param {boolean} [opcije.mobilni] - prozor 360x740 (scenario 14)
 * @returns {Promise<import('selenium-webdriver').WebDriver>}
 */
const napraviDrajver = async ({ mobilni = false } = {}) => {
  const preuzimanja = apsolutni(KONFIG.preuzimanjaDir);
  fs.mkdirSync(preuzimanja, { recursive: true });

  const opcije = new chrome.Options();

  if (!KONFIG.vidljivo) opcije.addArguments('--headless=new');

  opcije.addArguments(
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // Bez ovoga Chrome u zatvorenom rezimu ponekad ne ucita fontove
    '--font-render-hinting=none',
    mobilni ? '--window-size=360,740' : '--window-size=1440,900'
  );

  /*
   * PDF potvrda (scenario 8) mora da zavrsi kao FAJL na disku, da se moze
   * proveriti. Chrome bi je inace otvorio u ugradjenom pregledacu.
   */
  opcije.setUserPreferences({
    'download.default_directory': preuzimanja,
    'download.prompt_for_download': false,
    'plugins.always_open_pdf_externally': true,
    'profile.default_content_setting_values.automatic_downloads': 1
  });

  const drajver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(opcije)
    .build();

  await drajver.manage().setTimeouts({ implicit: 0, pageLoad: 60000, script: 30000 });

  return drajver;
};

/**
 * Postavlja mobilnu sirinu prikaza (scenario 14).
 *
 * Koristi se CDP `Emulation.setDeviceMetricsOverride`, a ne menjanje
 * velicine prozora: u zatvorenom (headless) rezimu je `window.setRect`
 * usred dugog skupa davao „Timed out receiving message from renderer".
 * Emulacija menja samo prikaz, bez dodirivanja samog prozora.
 */
const mobilnaSirina = async (drajver, { width = 360, height = 740 } = {}) => {
  await drajver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true
  });
};

/** Vraca prikaz na podrazumevanu velicinu prozora. */
const ponistiEmulaciju = async (drajver) => {
  await drajver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
};

/** Gasi drajver; greska pri gasenju ne sme da obori skup testova. */
const ugasi = async (drajver) => {
  if (!drajver) return;

  try {
    await drajver.quit();
  } catch (e) {
    console.warn(`[E2E] Drajver nije ugasen cisto: ${e.message}`);
  }
};

module.exports = { napraviDrajver, ugasi, apsolutni, mobilnaSirina, ponistiEmulaciju };
