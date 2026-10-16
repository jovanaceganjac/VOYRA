const OsnovnaStranica = require('./OsnovnaStranica');
const KONFIG = require('../podesavanja/konfiguracija');

/** MOJA PUTOVANJA - lista sačuvanih planova. */
class MojaPutovanja extends OsnovnaStranica {
  async otvori() {
    await this.idiNa('/moja-putovanja');
    await this.cekajUslov(
      async () => (await this.postoji('putovanja-lista')) || (await this.postoji('putovanja-prazno')),
      'Lista putovanja se nije učitala'
    );
  }

  async putovanja() {
    const stavke = await this.sve('putovanje');

    return Promise.all(
      stavke.map(async (s) => {
        const naslov = await s.findElements(OsnovnaStranica.po('putovanje-naslov'));
        const cena = await s.findElements(OsnovnaStranica.po('putovanje-cena'));

        return {
          id: await s.getAttribute('data-id'),
          status: await s.getAttribute('data-status'),
          naslov: naslov.length > 0 ? (await naslov[0].getText()).trim() : null,
          cena: cena.length > 0 ? (await cena[0].getText()).trim() : null
        };
      })
    );
  }

  async nadji(id) {
    const sva = await this.putovanja();
    return sva.find((p) => p.id === id) || null;
  }

  async otvoriPutovanje(id) {
    await this.klik('putovanje-otvori', { dodatno: '' });
    await this.cekajPutanju(new RegExp(`/moja-putovanja/${id}`));
  }
}

/** STRANICA JEDNOG PUTOVANJA - prikaz, izmena, rezervacija, otkazivanje. */
class Putovanje extends OsnovnaStranica {
  async otvori(id) {
    await this.idiNa(`/moja-putovanja/${id}`);
    await this.cekajUslov(
      async () => (await this.postoji('putovanje-zaglavlje')) || (await this.postoji('putovanje-greska')),
      'Stranica putovanja se nije učitala',
      KONFIG.cekanjePlanMs
    );
  }

  async status() {
    return this.atribut('putovanje-zaglavlje', 'data-status');
  }

  async cekajStatus(status) {
    await this.cekaj('putovanje-zaglavlje', { dodatno: `[data-status="${status}"]` });
  }

  async naslov() {
    return (await this.tekst('putovanje-naslov')).trim();
  }

  // ---------------------------------------------------------------
  // Režim izmene (scenario 6)
  // ---------------------------------------------------------------

  async pocniIzmenu() {
    await this.klik('trip-izmeni');
    await this.cekaj('izmena-dani');
  }

  async izmenaDani() {
    const stavke = await this.sve('izmena-dan');

    const rezultat = [];

    for (const s of stavke) {
      const aktivnosti = await s.findElements(OsnovnaStranica.po('izmena-aktivnost'));

      rezultat.push({
        dan: Number(await s.getAttribute('data-dan')),
        km: Number(await s.getAttribute('data-km')) || 0,
        aktivnosti: aktivnosti.length
      });
    }

    return rezultat;
  }

  async izmenaAktivnosti(dan) {
    const danEl = await this.cekaj('izmena-dan', { dodatno: `[data-dan="${dan}"]` });
    const stavke = await danEl.findElements(OsnovnaStranica.po('izmena-aktivnost'));

    return Promise.all(
      stavke.map(async (s) => {
        const naziv = await s.findElement(OsnovnaStranica.po('izmena-aktivnost-naziv'));

        return {
          id: await s.getAttribute('data-id'),
          pocetak: await s.getAttribute('data-pocetak'),
          krsenje: (await s.getAttribute('data-krsenje')) === 'true',
          naziv: (await naziv.getText()).trim()
        };
      })
    );
  }

  /**
   * Premešta aktivnost u drugi dan preko padajućeg izbora.
   *
   * Posle premeštanja se vremena preračunavaju, pa se čeka da se aktivnost
   * pojavi u ciljnom danu - bez pauze. Izbor se ponavlja ako se ne primi:
   * prikaz se u međuvremenu iscrtava iznova (nova vremena, nove oznake), pa
   * klik ume da padne na element koji je u tom trenutku zamenjen.
   */
  async premesti(izDana, idAktivnosti, uDan, { pokusaja = 3 } = {}) {
    for (let i = 0; i < pokusaja; i++) {
      try {
        await this.ponoviAkoJeZastareo(async () => {
          const aktivnost = await this.cekaj('izmena-aktivnost', {
            dodatno: `[data-id="${idAktivnosti}"]`
          });

          const izbor = await aktivnost.findElement(OsnovnaStranica.po('izmena-premesti'));

          await this.klikNaElement(izbor);
          await izbor.findElement({ css: `option[value="${uDan}"]` }).click();
        });

        await this.cekajUslov(
          async () => {
            const uCilju = await this.izmenaAktivnosti(uDan);
            return uCilju.some((a) => a.id === idAktivnosti);
          },
          `Aktivnost ${idAktivnosti} se nije pojavila u danu ${uDan}`,
          5000
        );

        return;
      } catch (err) {
        const zadnji = i === pokusaja - 1;

        if (zadnji) throw err;
      }
    }
  }

  /**
   * Najava za čitač ekrana - iz nje se vidi da je preračun završen.
   *
   * Servis je postavlja na „Vremena su preračunata (…)" tek kad odgovor
   * servera stigne, pa je to jedini pouzdan signal da su nova vremena i
   * oznake kršenja u prikazu.
   */
  async najava() {
    return (await this.tekstIzDoma('izmena-najava')) || '';
  }

  /**
   * Čeka da se preračunavanje završi POSLE zadate najave.
   *
   * Izmena se prvo primenjuje lokalno, a nova vremena stižu sa servera
   * posle kratkog zastoja (`debounceTime`). Bez ovog čekanja test čita
   * stanje pre odgovora i vidi plan bez oznaka kršenja.
   */
  async cekajPreracunavanje(najavaPre = '') {
    await this.cekajUslov(async () => {
      const sada = await this.najava();
      return sada !== najavaPre && /preračunata/i.test(sada);
    }, 'Vremena nisu preračunata posle izmene');
  }

  /** Kilometraža dana u režimu izmene - „Optimizuj redosled" je ne sme povećati. */
  async kmDana(dan) {
    const dani = await this.izmenaDani();
    return dani.find((d) => d.dan === dan)?.km ?? 0;
  }

  async optimizuj(dan) {
    const danEl = await this.cekaj('izmena-dan', { dodatno: `[data-dan="${dan}"]` });
    const dugme = await danEl.findElement(OsnovnaStranica.po('izmena-optimizuj'));

    const redosledPre = (await this.izmenaAktivnosti(dan)).map((a) => a.id).join('|');

    await this.klikNaElement(dugme);

    // Optimizacija se završila kada dugme opet piše „Optimizuj redosled"
    await this.cekajUslov(
      async () => (await dugme.getText()).includes('Optimizuj'),
      'Optimizacija se nije završila'
    );

    return redosledPre;
  }

  async sacuvajIzmene() {
    await this.klik('trip-sacuvaj');
  }

  async imaKrsenja() {
    return this.postoji('trip-krsenja');
  }

  async brojKrsenja() {
    const tekst = await this.tekstAkoPostoji('trip-krsenja');
    if (!tekst) return 0;

    return Number(tekst.trim().split(/\s+/)[0]) || 0;
  }

  // ---------------------------------------------------------------
  // Konflikt verzije (scenario 7)
  // ---------------------------------------------------------------

  async cekajDijalogKonflikta() {
    await this.cekaj('dijalog-konflikt');
    return this.tekst('dijalog-konflikt');
  }

  async imaDijalogKonflikta() {
    return this.postoji('dijalog-konflikt');
  }

  // ---------------------------------------------------------------
  // Rezervacija i otkazivanje
  // ---------------------------------------------------------------

  async naRezervaciju() {
    await this.klik('trip-rezervisi');
    await this.cekajPutanju(/rezervacija/);
  }

  async pnr() {
    return (await this.tekst('trip-pnr')).trim();
  }

  async imaRezervaciju() {
    return this.postoji('trip-rezervacija');
  }

  async preuzmiPotvrdu() {
    await this.klik('trip-preuzmi-pdf');
  }

  async otkazi() {
    await this.klik('trip-otkazi');
    await this.cekaj('dijalog-otkazivanje');
    await this.klik('otkazivanje-potvrdi');
  }
}

module.exports = { MojaPutovanja, Putovanje };
