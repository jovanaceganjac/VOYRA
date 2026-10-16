const OsnovnaStranica = require('./OsnovnaStranica');

/** ADMIN PANEL - odeljci (spec §3.3, §9). */
class Admin extends OsnovnaStranica {
  async otvori(odeljak = '') {
    await this.idiNa(`/admin${odeljak ? `/${odeljak}` : ''}`);
    await this.cekaj('admin-panel');
  }

  async otvoriPregled() {
    await this.otvori();
    await this.cekaj('admin-pregled');
  }

  async otvoriZahteve() {
    await this.otvori('zahtevi');
    await this.cekajUslov(
      async () => (await this.postoji('zahtevi-lista')) || (await this.postoji('zahtevi-prazno')),
      'Odeljak Zahtevi se nije učitao'
    );
  }

  /** Korisnička imena zahteva koji čekaju odluku. */
  async zahtevi() {
    const stavke = await this.sve('zahtev');
    return Promise.all(stavke.map((s) => s.getAttribute('data-korisnicko-ime')));
  }

  /** Odobrava zahtev i čeka da nestane sa liste. */
  async odobri(korisnickoIme) {
    const red = await this.cekaj('zahtev', { dodatno: `[data-korisnicko-ime="${korisnickoIme}"]` });
    const dugme = await red.findElement(OsnovnaStranica.po('zahtev-odobri'));

    await this.klikNaElement(dugme);

    await this.cekajUslov(
      async () => !(await this.postoji('zahtev', `[data-korisnicko-ime="${korisnickoIme}"]`)),
      `Zahtev ${korisnickoIme} je ostao na listi posle odobrenja`
    );
  }

  /** Koji odeljak je aktivan - proverava se posle klika u navigaciji. */
  async aktivneStavke() {
    const stavke = await this.sve('admin-nav-stavka');
    return Promise.all(stavke.map((s) => s.getAttribute('data-putanja')));
  }
}

module.exports = Admin;
