const OsnovnaStranica = require('./OsnovnaStranica');
const KONFIG = require('../podesavanja/konfiguracija');

/** PRIJAVA. */
class Prijava extends OsnovnaStranica {
  async otvori() {
    await this.idiNa('/prijava');
    await this.cekaj('prijava-forma');
  }

  async popuniIPosalji(korisnickoIme, lozinka) {
    await this.upisi('prijava-korisnicko-ime', korisnickoIme);
    await this.upisi('prijava-lozinka', lozinka);
    await this.klik('prijava-dugme');
  }

  /** Prijava kroz UI, do trenutka kada token stigne u `localStorage`. */
  async prijaviSe(korisnickoIme, lozinka) {
    await this.otvori();
    await this.popuniIPosalji(korisnickoIme, lozinka);

    await this.cekajUslov(
      async () => Boolean(await this.izSkladista('voyra_token')),
      `Prijava ${korisnickoIme} nije prošla: ${await this.greska()}`
    );
  }

  async greska() {
    return this.tekstAkoPostoji('prijava-greska');
  }

  /** Čeka da se pojavi poruka o grešci i vrati je. */
  async cekajGresku() {
    await this.cekaj('prijava-greska');
    return this.tekst('prijava-greska');
  }
}

/** REGISTRACIJA. */
class Registracija extends OsnovnaStranica {
  async otvori() {
    await this.idiNa('/registracija');
    await this.cekaj('registracija-forma');
  }

  async popuni(nalog) {
    await this.upisi('registracija-ime', nalog.ime);
    await this.upisi('registracija-prezime', nalog.prezime);
    await this.upisi('registracija-email', nalog.email);
    await this.upisi('registracija-korisnicko-ime', nalog.korisnickoIme);
    await this.upisi('registracija-lozinka', nalog.lozinka);
    await this.upisi('registracija-lozinka-potvrda', nalog.lozinka);
  }

  async posalji() {
    await this.klik('registracija-dugme');
  }

  /** Poruka „nalog čeka odobrenje". */
  async cekajUspeh() {
    await this.cekaj('registracija-uspeh', { ms: KONFIG.cekanjeMs });
    return this.tekst('registracija-uspeh');
  }

  async greske() {
    return this.tekstAkoPostoji('registracija-greska');
  }
}

/** PROFIL - promena lozinke (scenario 11). */
class Profil extends OsnovnaStranica {
  async otvori() {
    await this.idiNa('/profil');
    await this.cekaj('profil-trenutna-lozinka');
  }

  async promeniLozinku(trenutna, nova) {
    await this.upisi('profil-trenutna-lozinka', trenutna);
    await this.upisi('profil-nova-lozinka', nova);
    await this.upisi('profil-potvrda-lozinke', nova);
    await this.klik('profil-promeni-lozinku');
  }

  async greska() {
    return this.tekstAkoPostoji('profil-greska-lozinke');
  }
}

/** ZAGLAVLJE - navigacija i odjava. */
class Zaglavlje extends OsnovnaStranica {
  async jePrijavljen() {
    return this.postoji('nav-odjava');
  }

  async jeAdmin() {
    return this.postoji('nav-admin');
  }

  async odjava() {
    await this.klik('nav-odjava');
    await this.cekajUslov(
      async () => !(await this.izSkladista('voyra_token')),
      'Token nije obrisan posle odjave'
    );
  }

  async naMojaPutovanja() {
    await this.klik('nav-moja-putovanja');
  }

  /**
   * Čeka da sesija prestane da važi.
   *
   * Opoziv se ne vidi sam po sebi — vidi se na PRVOM zahtevu posle njega,
   * kada gateway vrati 401 i presretač obriše token. Zato se zahtev
   * ponavlja: svaki put se otvori zaštićena stranica i kratko čeka da
   * zaglavlje izgubi dugme za odjavu. Ukupno se čeka najviše `ms` — u test
   * steku je keš opoziva 0, pa prođe iz prvog pokušaja; nad razvojnim
   * stekom keš je 30 s.
   */
  async cekajOdjavu(ms = 40000) {
    const rok = Date.now() + ms;

    while (Date.now() < rok) {
      await this.idiNa('/moja-putovanja');

      try {
        await this.cekajUslov(
          async () => !(await this.jePrijavljen()),
          'sesija još važi',
          Math.min(5000, Math.max(1000, rok - Date.now()))
        );

        return true;
      } catch (err) {
        if (err.name !== 'TimeoutError') throw err;
      }
    }

    return !(await this.jePrijavljen());
  }

  async naAdmin() {
    await this.klik('nav-admin');
  }
}

module.exports = { Prijava, Registracija, Profil, Zaglavlje };
