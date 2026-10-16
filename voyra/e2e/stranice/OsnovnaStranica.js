const { By, until, Key } = require('selenium-webdriver');

const KONFIG = require('../podesavanja/konfiguracija');

/**
 * OSNOVA ZA SVE PAGE OBJECT KLASE.
 *
 * Dve stvari koje ovde stoje, a ne u testovima:
 *
 *   - selektori idu isključivo preko `data-testid`, pa promena CSS klase
 *     ili teksta ne obara testove;
 *   - NEMA `sleep`. Svako čekanje je eksplicitan uslov (`until`), pa test
 *     ne zavisi od brzine mašine: na sporijoj mašini samo duže čeka, a ne
 *     pada, i na brzoj ne troši vreme.
 */
class OsnovnaStranica {
  constructor(drajver) {
    this.drajver = drajver;
  }

  // ---------------------------------------------------------------
  // Selektori
  // ---------------------------------------------------------------

  /** `data-testid="..."`, uz opcioni dodatni atribut. */
  static po(testid, dodatno = '') {
    return By.css(`[data-testid="${testid}"]${dodatno}`);
  }

  po(testid, dodatno = '') {
    return OsnovnaStranica.po(testid, dodatno);
  }

  // ---------------------------------------------------------------
  // Kretanje
  // ---------------------------------------------------------------

  /**
   * Otvara stranicu aplikacije.
   *
   * Navigacija se ponavlja jednom ako Chrome odgovori „Timed out receiving
   * message from renderer": u dugom skupu, i posebno kad je uključena CDP
   * emulacija prikaza (scenario 14), taj odgovor stiže i kad se stranica
   * zapravo učita. Drugi pokušaj prolazi, a test dalje ionako čeka na
   * konkretan element, pa ne može da nastavi nad nepotpunom stranicom.
   */
  async idiNa(putanja = '/') {
    const adresa = `${KONFIG.frontend}${putanja}`;

    try {
      await this.drajver.get(adresa);
    } catch (err) {
      if (err.name !== 'TimeoutError') throw err;

      console.warn(`      [E2E] ponavljam navigaciju na ${putanja} (${err.message})`);
      await this.drajver.get(adresa);
    }
  }

  async osvezi() {
    await this.drajver.navigate().refresh();
  }

  async putanja() {
    const url = await this.drajver.getCurrentUrl();
    return url.replace(KONFIG.frontend, '');
  }

  /** Čeka da se adresa poklopi sa obrascem - Angular ruter menja URL bez učitavanja. */
  async cekajPutanju(obrazac, ms = KONFIG.cekanjeMs) {
    await this.drajver.wait(
      async () => obrazac.test(await this.putanja()),
      ms,
      `Adresa se nije promenila na ${obrazac} (ostala je ${await this.putanja()})`
    );
  }

  // ---------------------------------------------------------------
  // Čekanje
  // ---------------------------------------------------------------

  /**
   * Čeka da element postoji I da je vidljiv; vraća ga.
   *
   * Ako element zastari između nalaženja i provere vidljivosti (Angular ga
   * je u međuvremenu iscrtao iznova), traži se ponovo.
   */
  async cekaj(testid, { dodatno = '', ms = KONFIG.cekanjeMs } = {}) {
    const lokator = this.po(testid, dodatno);

    return this.ponoviAkoJeZastareo(async () => {
      const element = await this.drajver.wait(
        until.elementLocated(lokator),
        ms,
        `Nema elementa [data-testid="${testid}"]${dodatno}`
      );

      return this.drajver.wait(until.elementIsVisible(element), ms);
    });
  }

  /** Čeka da elementa NEMA na stranici (npr. da je učitavanje prošlo). */
  async cekajDaNestane(testid, { dodatno = '', ms = KONFIG.cekanjeMs } = {}) {
    await this.drajver.wait(
      async () => (await this.drajver.findElements(this.po(testid, dodatno))).length === 0,
      ms,
      `Element [data-testid="${testid}"]${dodatno} nije nestao`
    );
  }

  /** Čeka da ih bude barem `koliko`; vraća sve nađene. */
  async cekajNajmanje(testid, koliko = 1, { dodatno = '', ms = KONFIG.cekanjeMs } = {}) {
    await this.drajver.wait(
      async () => (await this.drajver.findElements(this.po(testid, dodatno))).length >= koliko,
      ms,
      `Manje od ${koliko} elemenata [data-testid="${testid}"]${dodatno}`
    );

    return this.sve(testid, dodatno);
  }

  /** Čeka sopstveni uslov nad stranicom. */
  async cekajUslov(uslov, poruka, ms = KONFIG.cekanjeMs) {
    return this.drajver.wait(uslov, ms, poruka);
  }

  // ---------------------------------------------------------------
  // Čitanje
  // ---------------------------------------------------------------

  async sve(testid, dodatno = '') {
    return this.drajver.findElements(this.po(testid, dodatno));
  }

  /**
   * Čita listu elemenata i pretvara je u obične objekte.
   *
   * Angular listu ume da iscrta iznova dok se čita (signal se osvežio), pa
   * reference na elemente postanu nevažeće (`StaleElementReferenceError`).
   * Tada se čitanje ponavlja nad novom listom - to je stanje stranice, a ne
   * greška u testu, i zato se ne rešava pauzom.
   */
  async citaj(testid, uObjekat, { dodatno = '', pokusaja = 5 } = {}) {
    for (let i = 0; i < pokusaja; i++) {
      try {
        const elementi = await this.sve(testid, dodatno);
        const rezultat = [];

        for (const e of elementi) rezultat.push(await uObjekat(e));

        return rezultat;
      } catch (err) {
        if (err.name !== 'StaleElementReferenceError' || i === pokusaja - 1) throw err;
      }
    }

    return [];
  }

  async postoji(testid, dodatno = '') {
    return (await this.sve(testid, dodatno)).length > 0;
  }

  async tekst(testid, dodatno = '') {
    return this.ponoviAkoJeZastareo(async () =>
      (await this.cekaj(testid, { dodatno })).getText()
    );
  }

  /** Tekst ako element postoji, inače `null` - za poruke koje se ne moraju pojaviti. */
  async tekstAkoPostoji(testid, dodatno = '') {
    return this.ponoviAkoJeZastareo(async () => {
      const nadjeni = await this.sve(testid, dodatno);
      return nadjeni.length > 0 ? nadjeni[0].getText() : null;
    });
  }

  /**
   * Tekst elementa iz DOM-a, i kada je element vizuelno skriven.
   *
   * `getText()` po WebDriver standardu vraća prazno za elemente koje
   * korisnik ne vidi, a najave za čitač ekrana su upravo takve.
   */
  async tekstIzDoma(testid, dodatno = '') {
    return this.drajver.executeScript(
      `const e = document.querySelector('[data-testid="${testid}"]${dodatno}');
       return e ? (e.textContent || '').trim() : null;`
    );
  }

  async atribut(testid, ime, dodatno = '') {
    return (await this.cekaj(testid, { dodatno })).getAttribute(ime);
  }

  async vrednost(testid, dodatno = '') {
    return (await this.cekaj(testid, { dodatno })).getAttribute('value');
  }

  // ---------------------------------------------------------------
  // Akcije
  // ---------------------------------------------------------------

  /**
   * Klik na element.
   *
   * Prvo se čeka da bude omogućen, pa se doveze u vidno polje: Chrome
   * odbija klik na element koji je ispod fiksnog zaglavlja.
   */
  async klik(testid, { dodatno = '', ms = KONFIG.cekanjeMs } = {}) {
    return this.ponoviAkoJeZastareo(async () => {
      const element = await this.cekaj(testid, { dodatno, ms });

      await this.drajver.wait(until.elementIsEnabled(element), ms, `[${testid}] je ostao onemogućen`);
      await this.klikNaElement(element);

      return element;
    });
  }

  /**
   * Ponavlja radnju kada referenca na element zastari.
   *
   * Angular komponentu iscrtava iznova kad se signal promeni (poruka o
   * grešci, odbrojavanje u natpisu dugmeta), pa element koji je test tek
   * našao može da prestane da postoji pre nego što ga upotrebi. Element se
   * tada traži ponovo - problem je u trenutku, ne u stanju stranice.
   */
  async ponoviAkoJeZastareo(radnja, pokusaja = 4) {
    for (let i = 0; i < pokusaja; i++) {
      try {
        return await radnja();
      } catch (err) {
        if (err.name !== 'StaleElementReferenceError' || i === pokusaja - 1) throw err;
      }
    }

    return undefined;
  }

  /**
   * Klik na već nađen element.
   *
   * Element se prvo doveze u vidno polje, jer Chrome odbija klik na ono
   * što je ispod fiksnog zaglavlja. Ako klik prekine obaveštenje (toast u
   * gornjem desnom uglu ume da prekrije stavke menija), čeka se da nestane
   * i klik se ponavlja - to je stvarno stanje stranice, ne trka u testu.
   */
  async klikNaElement(element, ms = KONFIG.cekanjeMs) {
    await this.drajver.executeScript(
      'arguments[0].scrollIntoView({ block: "center", behavior: "instant" });',
      element
    );

    try {
      await element.click();
      return;
    } catch (e) {
      if (e.name !== 'ElementClickInterceptedError') throw e;
    }

    await this.cekajDaToastNestane(ms);

    await this.drajver.wait(
      async () => {
        try {
          await element.click();
          return true;
        } catch (e) {
          if (e.name === 'ElementClickInterceptedError') return false;
          throw e;
        }
      },
      ms,
      'Klik je ostao prekinut drugim elementom'
    );
  }

  /** Čeka da nestanu obaveštenja (toast), koja stoje preko zaglavlja. */
  async cekajDaToastNestane(ms = KONFIG.cekanjeMs) {
    await this.drajver.wait(
      async () => (await this.drajver.findElements(this.po('toast'))).length === 0,
      ms,
      'Obaveštenje (toast) nije nestalo'
    );
  }

  /** Briše polje i upisuje vrednost. */
  async upisi(testid, tekst, { dodatno = '' } = {}) {
    return this.ponoviAkoJeZastareo(async () => {
      const element = await this.cekaj(testid, { dodatno });

      await element.clear();
      if (tekst !== '') await element.sendKeys(String(tekst));

      return element;
    });
  }

  /**
   * Postavlja vrednost `input[type=date]` i `input[type=time]`.
   *
   * `sendKeys` nad tim poljima zavisi od jezika sistema (Chrome prati
   * lokalni format datuma), pa se vrednost postavlja direktno i šalju se
   * `input` i `change`, da ih Angular primi.
   */
  async postaviVrednost(testid, vrednost, { dodatno = '' } = {}) {
    const element = await this.cekaj(testid, { dodatno });

    await this.drajver.executeScript(
      `arguments[0].value = arguments[1];
       arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
       arguments[0].dispatchEvent(new Event('change', { bubbles: true }));`,
      element,
      String(vrednost)
    );
  }

  /** Bira opciju u `select` po vrednosti. */
  async izaberiOpciju(testid, vrednost, { dodatno = '' } = {}) {
    const element = await this.cekaj(testid, { dodatno });

    await element.findElement(By.css(`option[value="${vrednost}"]`)).click();
  }

  async pritisni(taster) {
    await this.drajver.actions().sendKeys(taster).perform();
  }

  static get Key() {
    return Key;
  }

  // ---------------------------------------------------------------
  // Pomoćno
  // ---------------------------------------------------------------

  /** Vrednost iz `localStorage` - testovi iz njega čitaju token. */
  async izSkladista(kljuc) {
    return this.drajver.executeScript(`return window.localStorage.getItem('${kljuc}');`);
  }

  async ocistiSkladiste() {
    await this.drajver.executeScript('window.localStorage.clear(); window.sessionStorage.clear();');
  }

  /** Ima li stranica horizontalni skrol (scenario 14). */
  async imaHorizontalniSkrol() {
    return this.drajver.executeScript(
      'return document.documentElement.scrollWidth > window.innerWidth;'
    );
  }

  async sirine() {
    return this.drajver.executeScript(
      'return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };'
    );
  }
}

module.exports = OsnovnaStranica;
