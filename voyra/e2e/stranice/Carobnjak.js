const OsnovnaStranica = require('./OsnovnaStranica');
const KONFIG = require('../podesavanja/konfiguracija');

/**
 * ČAROBNJAK, koraci 1-4 (spec §4.2 - §4.7).
 *
 * Jedna klasa po koraku bila bi vernija obrascu, ali koraci dele traku
 * napretka i navigaciju, pa su tu kao četiri grupe metoda nad jednom
 * stranicom - `/planiranje/1..4` je jedna komponenta sa `router-outlet`.
 */
class Carobnjak extends OsnovnaStranica {
  async otvori(korak = 1) {
    await this.idiNa(`/planiranje/${korak}`);
    await this.cekaj('traka-koraka');
  }

  /** Koji je korak aktivan po traci napretka. */
  async aktivanKorak() {
    const stavka = await this.cekaj('traka-korak', { dodatno: '[data-stanje="aktivan"]' });
    return Number(await stavka.getAttribute('data-broj'));
  }

  async cekajKorak(broj) {
    await this.cekaj('traka-korak', { dodatno: `[data-broj="${broj}"][data-stanje="aktivan"]` });
  }

  // =================================================================
  // Korak 1: parametri
  // =================================================================

  async korak1Popuni({ od = KONFIG.polaziste, do_ = KONFIG.odredista.atina, polazak, povratak, putnika = 2, budzet = null } = {}) {
    await this.cekaj('korak1-forma');

    if (od) await this.izaberiGrad('from', od.upit);
    if (do_) await this.izaberiGrad('to', do_.upit);

    await this.postaviVrednost('korak1-polazak', polazak);
    await this.postaviVrednost('korak1-povratak', povratak);
    await this.upisi('korak1-putnika', putnika);

    if (budzet !== null) await this.upisi('korak1-budzet', budzet);
  }

  /** Grad se bira SAMO tastaturom (scenario 3). */
  async izaberiGrad(polje, upit, redom = 1) {
    const unos = await this.cekaj(`grad-unos-${polje}`);

    await unos.clear();
    await unos.sendKeys(upit);
    await this.cekajNajmanje(`grad-opcija-${polje}`, 1);

    /*
     * Komponenta posle pretrage sama aktivira PRVI predlog, pa se za njega
     * ne pritiska strelica - Enter ga bira. Za n-ti se pritiska n-1 puta.
     */
    for (let i = 1; i < redom; i++) await unos.sendKeys(OsnovnaStranica.Key.ARROW_DOWN);

    await unos.sendKeys(OsnovnaStranica.Key.ENTER);
    await this.cekajDaNestane(`grad-lista-${polje}`);

    return unos.getAttribute('value');
  }

  /** Koja je opcija aktivna u listi - iz `aria-activedescendant` polja. */
  async aktivnaOpcija(polje) {
    const unos = await this.cekaj(`grad-unos-${polje}`);
    return unos.getAttribute('aria-activedescendant');
  }

  async korak1OtvoriPreferencije() {
    const detalji = await this.cekaj('korak1-preferencije');

    if (!(await detalji.getAttribute('open'))) {
      await this.klik('korak1-preferencije-otvori');
      await this.cekajUslov(
        async () => Boolean(await detalji.getAttribute('open')),
        'Preferencije se nisu otvorile'
      );
    }
  }

  async korak1Tempo(vrednost) {
    await this.korak1OtvoriPreferencije();
    await this.klik('korak1-tempo', { dodatno: `[data-vrednost="${vrednost}"]` });
  }

  async korak1Interesovanja(kljucevi) {
    await this.korak1OtvoriPreferencije();

    for (const k of kljucevi) {
      const polje = await this.cekaj('korak1-interesovanje', { dodatno: `[data-vrednost="${k}"]` });
      if (!(await polje.isSelected())) await this.klikNaElement(polje);
    }
  }

  /**
   * Ostavlja označena SAMO zadata interesovanja.
   *
   * Podrazumevano su označeni „kultura" i „muzeji" (`preferencije.js`), pa
   * dodavanje jednog ne znači da su ostala isključena.
   */
  async korak1SamoInteresovanja(kljucevi) {
    await this.korak1OtvoriPreferencije();

    const polja = await this.sve('korak1-interesovanje');

    for (const p of polja) {
      const vrednost = await p.getAttribute('data-vrednost');
      const oznacen = await p.isSelected();

      if (kljucevi.includes(vrednost) !== oznacen) await this.klikNaElement(p);
    }
  }

  /** Koja su interesovanja označena - posle osvežavanja stranice (scenario 5). */
  async korak1IzabranaInteresovanja() {
    const polja = await this.sve('korak1-interesovanje');
    const izabrana = [];

    for (const p of polja) {
      if (await p.isSelected()) izabrana.push(await p.getAttribute('data-vrednost'));
    }

    return izabrana;
  }

  async korak1Dalje() {
    await this.klik('korak1-dalje');
  }

  async korak1Greske() {
    return this.tekstAkoPostoji('korak1-greske');
  }

  // =================================================================
  // Korak 2: izbor leta
  // =================================================================

  /** Čeka da se pretraga letova završi (ili da se pojavi poruka da ih nema). */
  async korak2Cekaj() {
    await this.cekajUslov(
      async () =>
        (await this.postoji('korak2-ponuda')) ||
        (await this.postoji('korak2-bez-ponuda')) ||
        (await this.postoji('korak2-greska')),
      'Korak 2 nije prikazao ni ponude ni poruku',
      KONFIG.cekanjePlanMs
    );
  }

  async korak2Ponude() {
    await this.korak2Cekaj();

    return this.citaj('korak2-ponuda', async (s) => ({
      offerId: await s.getAttribute('data-offer-id'),
      preporuceno: (await s.getAttribute('data-preporuceno')) === 'true',
      izabrano: (await s.getAttribute('data-izabrano')) === 'true',
      cena: Number(await s.getAttribute('data-cena'))
    }));
  }

  /** `offerId` ponude označene kao preporučena. */
  async korak2Preporucena() {
    const ponude = await this.korak2Ponude();
    return ponude.find((p) => p.preporuceno)?.offerId || null;
  }

  async korak2Izabrana() {
    const ponude = await this.korak2Ponude();
    return ponude.find((p) => p.izabrano)?.offerId || null;
  }

  async korak2IzaberiPrvu() {
    await this.korak2Cekaj();
    const stavke = await this.sve('korak2-ponuda');
    await this.klikNaElement(stavke[0]);

    return stavke[0].getAttribute('data-offer-id');
  }

  async korak2Izaberi(offerId) {
    await this.klik('korak2-ponuda', { dodatno: `[data-offer-id="${offerId}"]` });
  }

  async korak2PromeniPrioritet(vrednost) {
    await this.izaberiOpciju('korak2-prioritet', vrednost);
    await this.korak2Cekaj();
  }

  async korak2Dalje() {
    await this.klik('korak2-dalje', { ms: KONFIG.cekanjePlanMs });
  }

  async korak2BezLeta() {
    await this.klik('korak2-bez-leta');
  }

  // =================================================================
  // Korak 3: izbor smeštaja
  // =================================================================

  async korak3Cekaj() {
    await this.cekajUslov(
      async () =>
        (await this.postoji('korak3-ponuda')) ||
        (await this.postoji('korak3-bez-ponuda')) ||
        (await this.postoji('korak3-greska')),
      'Korak 3 nije prikazao ni ponude ni poruku',
      KONFIG.cekanjePlanMs
    );
  }

  async korak3Ponude() {
    await this.korak3Cekaj();

    return this.citaj('korak3-ponuda', async (s) => ({
      id: await s.getAttribute('data-id'),
      tip: await s.getAttribute('data-tip'),
      izabrano: (await s.getAttribute('data-izabrano')) === 'true'
    }));
  }

  /** Uključuje/isključuje filter tipa smeštaja i čeka novu pretragu. */
  async korak3FilterTipa(tip) {
    const polje = await this.cekaj('korak3-tip', { dodatno: `[data-vrednost="${tip}"]` });
    await this.klikNaElement(polje);
    await this.korak3Cekaj();
  }

  /**
   * Ostavlja označen SAMO zadati tip smeštaja.
   *
   * Podrazumevano su sva tri tipa označena, pa jedan klik ne „filtrira na
   * hostele" nego hostele ISKLJUČUJE - ostali se moraju odznačiti.
   */
  async korak3SamoTip(tip) {
    const polja = await this.sve('korak3-tip');

    for (const p of polja) {
      const vrednost = await p.getAttribute('data-vrednost');
      const oznacen = await p.isSelected();

      if ((vrednost === tip) !== oznacen) await this.klikNaElement(p);
    }

    await this.korak3Cekaj();
  }

  async korak3IzaberiPrvu() {
    await this.korak3Cekaj();
    const stavke = await this.sve('korak3-ponuda');
    await this.klikNaElement(stavke[0]);

    return stavke[0].getAttribute('data-id');
  }

  async korak3BookingLink() {
    const linkovi = await this.sve('korak3-booking-link');
    return linkovi.length > 0 ? linkovi[0].getAttribute('href') : null;
  }

  async korak3Dalje() {
    await this.klik('korak3-dalje', { ms: KONFIG.cekanjePlanMs });
  }

  async korak3BezSmestaja() {
    await this.klik('korak3-bez-smestaja');
  }

  // =================================================================
  // Korak 4: plan
  // =================================================================

  async korak4Cekaj() {
    await this.cekajUslov(
      async () =>
        (await this.postoji('plan-dani')) ||
        (await this.postoji('korak4-greske')) ||
        (await this.postoji('korak4-isteklo')),
      'Korak 4 nije prikazao ni plan ni poruku',
      KONFIG.cekanjePlanMs
    );
  }

  async korak4Sacuvaj() {
    await this.klik('korak4-sacuvaj', { ms: KONFIG.cekanjePlanMs });
  }

  /** `tripId` iz dugmeta „Otvori putovanje" - pojavi se posle čuvanja. */
  async korak4SacuvanId() {
    const dugme = await this.cekaj('korak4-otvori-putovanje', { ms: KONFIG.cekanjePlanMs });
    return dugme.getAttribute('data-trip-id');
  }

  async korak4Isteklo() {
    const el = await this.sve('korak4-isteklo');
    return el.length > 0 ? el[0].getAttribute('data-sta') : null;
  }
}

module.exports = Carobnjak;
