const OsnovnaStranica = require('./OsnovnaStranica');
const KONFIG = require('../podesavanja/konfiguracija');

/**
 * POČETNA STRANICA i ARIA combobox za grad.
 *
 * Combobox se popunjava SAMO tastaturom (scenario 3): kucanje, strelica
 * dole, Enter. Tako se u jednom potezu proverava i pristupačnost obrasca
 * i to da vrednost nije slobodan tekst nego izabran grad.
 */
class Pocetna extends OsnovnaStranica {
  async otvori() {
    await this.idiNa('/');
    await this.cekaj('pretraga-forma');
  }

  // ---------------------------------------------------------------
  // Combobox grada
  // ---------------------------------------------------------------

  /**
   * Upisuje deo naziva i bira predlog tastaturom.
   *
   * @param {'from'|'to'} polje
   * @param {string} upit - npr. „ati"
   * @param {number} redom - koji predlog po redu (1 = prvi)
   */
  async izaberiGradTastaturom(polje, upit, redom = 1) {
    const unos = await this.cekaj(`grad-unos-${polje}`);

    await unos.clear();
    await unos.sendKeys(upit);

    // Lista se otvara posle odgovora servera - čeka se prva opcija
    await this.cekajNajmanje(`grad-opcija-${polje}`, 1, { ms: KONFIG.cekanjeMs });

    /*
     * Komponenta posle pretrage sama aktivira PRVI predlog
     * (`aria-activedescendant` pokazuje na njega), pa se za prvi predlog
     * ne pritiska strelica - Enter ga bira. Za n-ti se pritiska n-1 puta.
     */
    for (let i = 1; i < redom; i++) await unos.sendKeys(OsnovnaStranica.Key.ARROW_DOWN);

    await unos.sendKeys(OsnovnaStranica.Key.ENTER);

    // Posle Enter-a lista se zatvara, a polje nosi naziv izabranog grada
    await this.cekajDaNestane(`grad-lista-${polje}`);

    return unos.getAttribute('value');
  }

  /** Koja je opcija aktivna u listi - iz `aria-activedescendant` polja. */
  async aktivnaOpcija(polje) {
    const unos = await this.cekaj(`grad-unos-${polje}`);
    return unos.getAttribute('aria-activedescendant');
  }

  /**
   * Kuca upit i ostavlja listu otvorenom - za proveru same tastature.
   *
   * Čeka da se lista UMIRI, a ne samo da se pojavi: komponenta odgovore
   * sklapa kroz `debounceTime` i `switchMap`, pa posle prvog odgovora može
   * da dođe još jedan i da vrati aktivan predlog na prvi. Uslov je da dva
   * uzastopna čitanja daju isti broj predloga i isti aktivan predlog.
   */
  async otvoriListu(polje, upit) {
    const unos = await this.cekaj(`grad-unos-${polje}`);

    await unos.clear();
    await unos.sendKeys(upit);
    await this.cekajNajmanje(`grad-opcija-${polje}`, 1);

    let prethodno = null;

    await this.cekajUslov(async () => {
      const sada = [
        (await this.sve(`grad-opcija-${polje}`)).length,
        await unos.getAttribute('aria-activedescendant')
      ].join('|');

      const isto = sada === prethodno;
      prethodno = sada;

      return isto && !sada.endsWith('|null') && !sada.endsWith('|');
    }, `Lista predloga za ${polje} se nije umirila`);

    return unos;
  }

  /** Nazivi predloga - za proveru redosleda u listi. */
  async predlozi(polje) {
    const stavke = await this.sve(`grad-opcija-${polje}`);
    return Promise.all(stavke.map((s) => s.getText()));
  }

  // ---------------------------------------------------------------
  // Brza pretraga
  // ---------------------------------------------------------------

  async popuni({ od = KONFIG.polaziste, do_ = KONFIG.odredista.atina, polazak, povratak, putnika = 2, budzet = null } = {}) {
    await this.izaberiGradTastaturom('from', od.upit);
    await this.izaberiGradTastaturom('to', do_.upit);

    await this.postaviVrednost('polje-polazak', polazak);
    await this.postaviVrednost('polje-povratak', povratak);
    await this.upisi('polje-putnika', putnika);

    if (budzet !== null) await this.upisi('polje-budzet', budzet);
  }

  async posalji() {
    await this.klik('dugme-pronadji');
  }

  async greska() {
    return this.tekstAkoPostoji('greska-pretrage');
  }

  // ---------------------------------------------------------------
  // Istaknute i popularne destinacije (§4.1)
  // ---------------------------------------------------------------

  async imaIstaknute() {
    return this.postoji('istaknute-sekcija');
  }

  async nasloviIstaknutih() {
    const stavke = await this.sve('istaknuta-naslov');
    return Promise.all(stavke.map((s) => s.getText()));
  }

  /** Klik na istaknutu destinaciju vodi u čarobnjak sa tim gradom. */
  async klikNaIstaknutu(gradId) {
    await this.klik('istaknuta-kartica', { dodatno: `[data-grad="${gradId}"]` });
  }

  async imaPopularne() {
    return this.postoji('popularne-sekcija');
  }
}

module.exports = Pocetna;
