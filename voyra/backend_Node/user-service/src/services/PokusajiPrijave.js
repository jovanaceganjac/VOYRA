const LoginAttempt = require('../models/LoginAttempt');

const { MAX_POKUSAJA, PROZOR_MIN } = LoginAttempt;

/**
 * OGRANICENJE BROJA POKUSAJA PRIJAVE.
 *
 * Isti mehanizam koristi i promena lozinke, samo sa drugim kljucem: tamo
 * se broje pogresne TRENUTNE lozinke po korisniku, pa je `ip` zamenjen
 * oznakom `password`.
 */
class PokusajiPrijave {
  /** `korisnickoIme|ip` - mala slova, da se velicina slova ne racuna. */
  _kljuc(korisnickoIme, ip) {
    return `${String(korisnickoIme || '').toLowerCase()}|${String(ip || 'nepoznat')}`;
  }

  /**
   * Da li je par zakljucan.
   *
   * @returns {Promise<{zakljucan: boolean, preostaloSek: number, pokusaji: number}>}
   */
  async stanje(korisnickoIme, ip) {
    const zapis = await LoginAttempt.findOne({ kljuc: this._kljuc(korisnickoIme, ip) }).lean();

    if (!zapis || zapis.pokusaji < MAX_POKUSAJA) {
      return {
        zakljucan: false,
        preostaloSek: 0,
        pokusaji: zapis?.pokusaji || 0,
        preostaloPokusaja: MAX_POKUSAJA - (zapis?.pokusaji || 0)
      };
    }

    /*
     * Prozor tece od PRVOG pokusaja. TTL indeks ce sam obrisati zapis,
     * ali MongoDB ga cisti otprilike jednom u minutu - zato se vreme
     * racuna i ovde, da zakljucavanje prestane u sekund kad treba.
     */
    const istice = new Date(zapis.prviPokusaj).getTime() + PROZOR_MIN * 60 * 1000;
    const preostaloSek = Math.ceil((istice - Date.now()) / 1000);

    if (preostaloSek <= 0) {
      await LoginAttempt.deleteOne({ kljuc: zapis.kljuc });
      return { zakljucan: false, preostaloSek: 0, pokusaji: 0, preostaloPokusaja: MAX_POKUSAJA };
    }

    return { zakljucan: true, preostaloSek, pokusaji: zapis.pokusaji, preostaloPokusaja: 0 };
  }

  /** Belezi promasaj; vraca novo stanje. */
  async zabelezi(korisnickoIme, ip) {
    const kljuc = this._kljuc(korisnickoIme, ip);
    const sada = new Date();

    await LoginAttempt.updateOne(
      { kljuc },
      {
        $inc: { pokusaji: 1 },
        $set: { korisnickoIme: String(korisnickoIme || ''), ip: String(ip || ''), poslednjiPokusaj: sada },
        $setOnInsert: { prviPokusaj: sada }
      },
      { upsert: true }
    );

    return this.stanje(korisnickoIme, ip);
  }

  /** Uspesna prijava brise brojac. */
  async ocisti(korisnickoIme, ip) {
    await LoginAttempt.deleteOne({ kljuc: this._kljuc(korisnickoIme, ip) });
  }

  /** Telo odgovora za 429, sa vremenom cekanja u minutima. */
  odgovor429(preostaloSek) {
    const minuta = Math.max(1, Math.ceil(preostaloSek / 60));

    return {
      success: false,
      error: 'RATE_LIMIT',
      message: `Previse pogresnih pokusaja. Pokusajte ponovo za ${minuta} ${
        minuta === 1 ? 'minut' : 'minuta'
      }`,
      retryAfter: preostaloSek,
      statusCode: 429
    };
  }
}

module.exports = PokusajiPrijave;
module.exports.MAX_POKUSAJA = MAX_POKUSAJA;
module.exports.PROZOR_MIN = PROZOR_MIN;
