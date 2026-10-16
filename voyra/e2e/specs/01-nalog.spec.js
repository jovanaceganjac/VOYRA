const assert = require('node:assert/strict');

const { napraviDrajver, ugasi } = require('../podesavanja/drajver');
const { snimiAkoJePao } = require('../podesavanja/pad');
const api = require('../podesavanja/api');
const KONFIG = require('../podesavanja/konfiguracija');
const { ocistiSkladiste } = require('../podesavanja/pomoc');

const { Prijava, Registracija, Zaglavlje } = require('../stranice/Nalog');
const Admin = require('../stranice/Admin');

/**
 * SCENARIJI 1, 2 i 13 - nalog i pristup.
 *
 * Svaki `it` je nezavisan: pravi svoj nalog i svoje stanje, pa se može
 * pokrenuti sam (`mocha --grep`).
 */
describe('Nalog i pristup', function () {
  let drajver;

  beforeEach(async () => {
    drajver = await napraviDrajver();
    await ocistiSkladiste(drajver);
  });

  afterEach(async function () {
    await snimiAkoJePao(this.currentTest, drajver);
    await ugasi(drajver);
  });

  // ---------------------------------------------------------------
  it('1. registracija čeka odobrenje, admin odobrava, prijava tada radi', async function () {
    const registracija = new Registracija(drajver);
    const prijava = new Prijava(drajver);
    const admin = new Admin(drajver);
    const zaglavlje = new Zaglavlje(drajver);

    // Jedinstveno korisničko ime, da se test može ponavljati
    const oznaka = `e2e1_${Date.now().toString(36)}`;
    const nalog = {
      ime: 'Proba',
      prezime: 'Registracija',
      email: `${oznaka}@voyra.local`,
      korisnickoIme: oznaka.slice(0, 20),
      lozinka: 'VoyraProba1!'
    };

    // --- registracija kroz UI ---
    await registracija.otvori();
    await registracija.popuni(nalog);
    await registracija.posalji();

    const poruka = await registracija.cekajUspeh();
    assert.match(poruka, /odobr/i, `Poruka ne govori o odobrenju: „${poruka}"`);

    // --- prijava je odbijena dok nalog čeka ---
    await prijava.otvori();
    await prijava.popuniIPosalji(nalog.korisnickoIme, nalog.lozinka);

    const greska = await prijava.cekajGresku();
    assert.ok(greska.length > 0, 'Prijava naloga na čekanju nije prijavila grešku');
    assert.equal(await prijava.izSkladista('voyra_token'), null, 'Nalog na čekanju je dobio token');

    // --- administrator odobrava u /admin/zahtevi ---
    const { token, user } = await api.prijava(
      KONFIG.nalozi.admin.korisnickoIme,
      KONFIG.nalozi.admin.lozinka
    );

    await drajver.executeScript(
      `window.localStorage.setItem('voyra_token', arguments[0]);
       window.localStorage.setItem('voyra_korisnik', arguments[1]);`,
      token,
      JSON.stringify(user)
    );

    await admin.otvoriZahteve();

    const naCekanju = await admin.zahtevi();
    assert.ok(
      naCekanju.includes(nalog.korisnickoIme),
      `Nov nalog nije na listi zahteva (na listi: ${naCekanju.join(', ') || 'nema nikoga'})`
    );

    await admin.odobri(nalog.korisnickoIme);
    await zaglavlje.odjava();

    // --- prijava sada radi ---
    await prijava.prijaviSe(nalog.korisnickoIme, nalog.lozinka);
    assert.ok(await zaglavlje.jePrijavljen(), 'Odobren nalog nije prijavljen');

    // --- obaveštenje o odluci postoji (provera preko API-ja) ---
    const { token: korisnikTok } = await api.prijava(nalog.korisnickoIme, nalog.lozinka);
    const obavestenje = await api.cekajObavestenje(korisnikTok, 'REGISTRATION_APPROVED');

    assert.equal(obavestenje.channel, 'email', 'Odluka nije poslata e-poštom');
  });

  // ---------------------------------------------------------------
  it('2. pet pogrešnih lozinki zaključava prijavu, uz vreme čekanja', async function () {
    const prijava = new Prijava(drajver);

    // Nalog se pravi za ovaj test, da zaključavanje ne dodirne demo nalog
    const nalog = await api.odobrenNalog('e2e2');

    await prijava.otvori();

    let poslednjaPoruka = '';

    for (let i = 1; i <= 5; i++) {
      await prijava.popuniIPosalji(nalog.korisnickoIme, 'PogresnaLozinka1!');
      poslednjaPoruka = await prijava.cekajGresku();
    }

    // Peti promašaj zaključava par (korisničko ime, IP) na 15 minuta
    await prijava.cekajUslov(async () => {
      const p = await prijava.tekstAkoPostoji('prijava-greska');
      return Boolean(p) && /minut/i.test(p);
    }, `Posle pet promašaja poruka ne govori o čekanju: „${poslednjaPoruka}"`);

    const poruka = await prijava.tekst('prijava-greska');
    assert.match(poruka, /minut/i);

    /*
     * Dugme je zaključano dok odbrojavanje traje, pa novi pokušaj nije ni
     * moguć. Element se traži u svakom prolazu: natpis nosi odbrojavanje u
     * sekundama, pa Angular dugme iscrtava iznova.
     */
    await prijava.cekajUslov(async () => {
      const dugmad = await prijava.sve('prijava-dugme');
      return dugmad.length > 0 && !(await dugmad[0].isEnabled());
    }, 'Dugme za prijavu je ostalo omogućeno posle zaključavanja');

    // I tačna lozinka sada dobija 429, ne token (provera preko API-ja)
    const odgovor = await api.post('/api/users/login', {
      korisnickoIme: nalog.korisnickoIme,
      lozinka: nalog.lozinka
    });

    assert.equal(odgovor.status, 429, `Tačna lozinka je dala ${odgovor.status} umesto 429`);
    assert.equal(await prijava.izSkladista('voyra_token'), null, 'Zaključan nalog je dobio token');
  });

  // ---------------------------------------------------------------
  it('13. zaštita ruta: /admin za korisnika vodi na /, /moja-putovanja za gosta na prijavu', async function () {
    const prijava = new Prijava(drajver);

    // --- gost na zaštićenu rutu ---
    await prijava.idiNa('/moja-putovanja');
    await prijava.cekajPutanju(/^\/prijava/);

    const putanja = await prijava.putanja();
    assert.match(
      putanja,
      /returnUrl/,
      `Preusmerenje ne nosi returnUrl (adresa: ${putanja})`
    );
    assert.match(decodeURIComponent(putanja), /moja-putovanja/);

    // --- običan korisnik na /admin ---
    const { token, user } = await api.prijava(
      KONFIG.nalozi.korisnik.korisnickoIme,
      KONFIG.nalozi.korisnik.lozinka
    );

    await drajver.executeScript(
      `window.localStorage.setItem('voyra_token', arguments[0]);
       window.localStorage.setItem('voyra_korisnik', arguments[1]);`,
      token,
      JSON.stringify(user)
    );

    await prijava.idiNa('/admin');
    await prijava.cekajPutanju(/^\/$/);
  });
});
