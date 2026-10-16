const OsnovnaStranica = require('./OsnovnaStranica');
const KONFIG = require('../podesavanja/konfiguracija');

/**
 * PRIKAZ PLANA.
 *
 * Isti prikaz stoji i na koraku 4 čarobnjaka i na stranici sačuvanog
 * putovanja (komponenta `app-itinerar`), pa je i klasa jedna.
 */
class Plan extends OsnovnaStranica {
  async cekaj_() {
    await this.cekaj('plan-dani', { ms: KONFIG.cekanjePlanMs });
  }

  async brojDana() {
    await this.cekaj_();
    return (await this.sve('plan-dan')).length;
  }

  /** Dani sa brojem aktivnosti, satnicom i pređenim kilometrima. */
  async dani() {
    await this.cekaj_();
    const stavke = await this.sve('plan-dan');

    const rezultat = [];

    for (const s of stavke) {
      const aktivnosti = await s.findElements(OsnovnaStranica.po('plan-aktivnost'));
      const satnica = await s.findElements(OsnovnaStranica.po('plan-dan-satnica'));

      rezultat.push({
        dan: Number(await s.getAttribute('data-dan')),
        km: Number(await s.getAttribute('data-km')) || 0,
        aktivnosti: aktivnosti.length,
        satnica: satnica.length > 0 ? (await satnica[0].getText()).trim() : null
      });
    }

    return rezultat;
  }

  /** Aktivnosti jednog dana, redom kojim stoje u planu. */
  async aktivnostiDana(dan) {
    await this.cekaj_();
    const danEl = await this.cekaj('plan-dan', { dodatno: `[data-dan="${dan}"]` });
    const stavke = await danEl.findElements(OsnovnaStranica.po('plan-aktivnost'));

    return Promise.all(
      stavke.map(async (s) => {
        const naziv = await s.findElement(OsnovnaStranica.po('plan-aktivnost-naziv'));

        return {
          id: await s.getAttribute('data-id'),
          pocetak: await s.getAttribute('data-pocetak'),
          izvor: await s.getAttribute('data-izvor'),
          krsenje: (await s.getAttribute('data-krsenje')) === 'true',
          naziv: (await naziv.getText()).trim()
        };
      })
    );
  }

  /** Ima li dan pauzu za ručak. */
  async imaRucak(dan) {
    const danEl = await this.cekaj('plan-dan', { dodatno: `[data-dan="${dan}"]` });
    return (await danEl.findElements(OsnovnaStranica.po('plan-rucak'))).length > 0;
  }

  /** Vreme sletanja prikazano u prvom danu (scenario 3). */
  async vremeSletanja() {
    const el = await this.sve('plan-sletanje');
    if (el.length === 0) return null;

    return (await el[0].getText()).trim().split('\n')[0];
  }

  async ukupanTrosak() {
    return (await this.tekst('plan-ukupno')).trim();
  }

  async brojAktivnosti() {
    return Number((await this.tekst('plan-broj-aktivnosti')).trim());
  }

  async cenaLeta() {
    return this.tekstAkoPostoji('plan-let-cena');
  }

  async offerIdLeta() {
    const el = await this.sve('plan-let');
    return el.length > 0 ? el[0].getAttribute('data-offer-id') : null;
  }

  /** Ima li aktivnost oznaku „Preporuka Voyre" (scenario 12). */
  async imaOznakuVoyre() {
    return this.postoji('plan-oznaka-voyre');
  }
}

module.exports = Plan;
