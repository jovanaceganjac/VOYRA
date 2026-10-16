const OsnovnaStranica = require('./OsnovnaStranica');
const KONFIG = require('../podesavanja/konfiguracija');

/**
 * REZERVACIJA LETA, tri koraka (spec §4.8).
 *
 *   provera ponude -> putnici -> pregled i potvrda
 */
class Rezervacija extends OsnovnaStranica {
  async otvori(tripId) {
    await this.idiNa(`/moja-putovanja/${tripId}/rezervacija`);
    await this.cekajKorak1();
  }

  /** Koji je korak tekući. */
  async korak() {
    const stavka = await this.sve('rez-korak', '[data-stanje="tekuci"]');
    if (stavka.length === 0) return (await this.postoji('rez-uspeh')) ? 4 : null;

    return Number(await stavka[0].getAttribute('data-broj'));
  }

  // ---------------------------------------------------------------
  // Korak 1: provera ponude
  // ---------------------------------------------------------------

  async cekajKorak1() {
    await this.cekajUslov(
      async () =>
        (await this.postoji('rez-cena-promena')) ||
        (await this.postoji('rez-cena-potvrdjena')) ||
        (await this.postoji('rez-alternative')) ||
        (await this.postoji('rez-greska')) ||
        (await this.postoji('rez-previse-putnika')),
      'Korak 1 rezervacije nije dao ishod',
      KONFIG.cekanjePlanMs
    );
  }

  async cenaPromenjena() {
    return this.postoji('rez-cena-promena');
  }

  /**
   * Šta je korak 1 na kraju prikazao.
   *
   * Vraća jednu od vrednosti: `cena-promena`, `cena-potvrdjena`,
   * `alternative`, `greska`, `previse-putnika`. Test tako ne mora da
   * proverava svako stanje posebno i ne može da pročita međustanje
   * („osvežavamo ponudu…") kao konačan ishod.
   */
  async ishodKoraka1() {
    const stanja = [
      ['rez-cena-promena', 'cena-promena'],
      ['rez-cena-potvrdjena', 'cena-potvrdjena'],
      ['rez-alternative', 'alternative'],
      ['rez-greska', 'greska'],
      ['rez-previse-putnika', 'previse-putnika']
    ];

    let ishod = null;

    await this.cekajUslov(
      async () => {
        for (const [testid, naziv] of stanja) {
          if (await this.postoji(testid)) {
            ishod = naziv;
            return true;
          }
        }

        return false;
      },
      'Korak 1 rezervacije nije dao ishod',
      KONFIG.cekanjePlanMs
    );

    return ishod;
  }

  /** Je li „Dalje" zaključano dok nova cena nije prihvaćena. */
  async daljeJeOmoguceno() {
    const dugme = await this.cekaj('rez-dalje-putnici');
    return dugme.isEnabled();
  }

  async prihvatiCenu() {
    const polje = await this.cekaj('rez-prihvati-cenu');
    if (!(await polje.isSelected())) await this.klikNaElement(polje);

    // Dugme se otvara kad Angular primi promenu; čeka se uslov, ne pauza
    await this.cekajUslov(async () => {
      const dugmad = await this.sve('rez-dalje-putnici');
      return dugmad.length > 0 && (await dugmad[0].isEnabled());
    }, '„Dalje" se nije otvorilo posle prihvatanja nove cene');
  }

  async daljeNaPutnike() {
    await this.klik('rez-dalje-putnici');
    await this.cekaj('rez-putnik');
  }

  /** Ponuda je istekla i traži se novi let (scenario 9). */
  async imaAlternative() {
    return this.postoji('rez-alternative');
  }

  async izaberiPrvuAlternativu() {
    const dugmad = await this.cekajNajmanje('rez-izaberi-alternativu', 1, { ms: KONFIG.cekanjePlanMs });
    await this.klikNaElement(dugmad[0]);
    await this.cekajKorak1();
  }

  // ---------------------------------------------------------------
  // Korak 2: putnici
  // ---------------------------------------------------------------

  async brojPutnika() {
    return (await this.sve('rez-putnik')).length;
  }

  /**
   * Popunjava jednog putnika. `broj` je 1-baziran, kao u prikazu.
   * Polja koja nisu prosleđena se ne diraju (test tako proverava obavezna).
   */
  async popuniPutnika(broj, podaci) {
    const putnik = await this.cekaj('rez-putnik', { dodatno: `[data-broj="${broj}"]` });

    const postavi = async (testid, vrednost) => {
      if (vrednost === undefined) return;

      const polje = await putnik.findElement(OsnovnaStranica.po(testid));
      const tip = await polje.getAttribute('type');
      const oznaka = await polje.getTagName();

      if (oznaka === 'select') {
        await polje.findElement({ css: `option[value="${vrednost}"]` }).click();
        return;
      }

      if (tip === 'date') {
        await this.drajver.executeScript(
          `arguments[0].value = arguments[1];
           arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
           arguments[0].dispatchEvent(new Event('change', { bubbles: true }));`,
          polje,
          vrednost
        );
        return;
      }

      await polje.clear();
      await polje.sendKeys(String(vrednost));
    };

    await postavi('rez-titula', podaci.titula);
    await postavi('rez-pol', podaci.pol);
    await postavi('rez-ime', podaci.ime);
    await postavi('rez-prezime', podaci.prezime);
    await postavi('rez-rodjen', podaci.rodjen);
    await postavi('rez-email', podaci.email);
    await postavi('rez-telefon', podaci.telefon);
  }

  async daljeNaPregled() {
    await this.klik('rez-dalje-pregled');
  }

  /** Greške koje server vrati za putnike. */
  async greskeServera() {
    return this.tekstAkoPostoji('rez-greske-servera');
  }

  /**
   * Greška uz jedno polje putnika.
   *
   * Obrazac isto pravilo proverava i na klijentu (`putnik.validator.ts`) i
   * na serveru (`putniciValidator.js`), pa se ćirilično ime zaustavi već
   * ovde - forma se ne šalje i poruka stoji uz polje.
   */
  async greskaPolja(polje, { broj = 1 } = {}) {
    const putnik = await this.cekaj('rez-putnik', { dodatno: `[data-broj="${broj}"]` });
    const greske = await putnik.findElements(
      OsnovnaStranica.po('rez-greska-polja', `[data-polje="${polje}"]`)
    );

    return greske.length > 0 ? (await greske[0].getText()).trim() : null;
  }

  /** Čeka da se greška uz polje pojavi i vrati je. */
  async cekajGreskuPolja(polje, { broj = 1 } = {}) {
    await this.cekaj('rez-greska-polja', { dodatno: `[data-polje="${polje}"]` });
    return this.greskaPolja(polje, { broj });
  }

  /** Je li „Dalje: pregled" omogućeno (forma bez greške). */
  async pregledJeOmogucen() {
    const dugme = await this.cekaj('rez-dalje-pregled');
    return dugme.isEnabled();
  }

  async cekajGreskeServera() {
    await this.cekaj('rez-greske-servera', { ms: KONFIG.cekanjePlanMs });
    return this.tekst('rez-greske-servera');
  }

  // ---------------------------------------------------------------
  // Korak 3: pregled i potvrda
  // ---------------------------------------------------------------

  async potvrdiTestRezim() {
    const polje = await this.cekaj('rez-potvrda-test');
    if (!(await polje.isSelected())) await this.klikNaElement(polje);
  }

  async potvrdi() {
    await this.klik('rez-potvrdi', { ms: KONFIG.cekanjePlanMs });
  }

  async cekajUspeh() {
    await this.cekaj('rez-uspeh', { ms: KONFIG.cekanjePlanMs });
  }

  async pnr() {
    return (await this.tekst('rez-pnr')).trim();
  }

  async statusPutovanja() {
    return this.atribut('rez-status', 'data-status');
  }

  async preuzmiPotvrdu() {
    await this.klik('rez-preuzmi-pdf');
  }
}

module.exports = Rezervacija;
