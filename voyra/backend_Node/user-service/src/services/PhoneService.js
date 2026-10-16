const { validiraj, maskiraj } = require('../utils/phoneValidator');

/**
 * Broj telefona korisnika.
 *
 * Telefon je opcion i sluzi samo za SMS obavestenja. Broj se NE
 * potvrdjuje SMS kodom: proverava se samo oblik (E.164) i jedinstvenost,
 * a korisnik obavestenja moze da iskljuci u profilu.
 */
class PhoneService {
  _greska(poruka, code, statusCode) {
    const e = new Error(poruka);
    e.code = code;
    e.statusCode = statusCode;
    return e;
  }

  /**
   * Postavlja nov broj.
   *
   * @returns {{ changed: boolean, number: string }}
   */
  async postaviBroj(user, uneti) {
    const { valid, number, error } = validiraj(uneti);

    if (!valid) {
      throw this._greska(error, 'VALIDATION_ERROR', 400);
    }

    if (user.phone?.number === number) {
      await user.save();
      return { changed: false, number };
    }

    user.phone = {
      number,
      smsOptIn: user.phone?.smsOptIn ?? true
    };

    await user.save();

    console.log(`[USER_SERVICE] Broj za ${user.korisnickoIme} postavljen na ${maskiraj(number)}`);

    return { changed: true, number };
  }

  /** Ukljucivanje/iskljucivanje SMS obavestenja. */
  async postaviSmsPreferencu(user, smsOptIn) {
    if (typeof smsOptIn !== 'boolean') {
      throw this._greska('smsOptIn mora biti true ili false', 'VALIDATION_ERROR', 400);
    }

    if (!user.phone) user.phone = {};
    user.phone.smsOptIn = smsOptIn;

    await user.save();

    console.log(`[USER_SERVICE] SMS obavestenja za ${user.korisnickoIme}: ${smsOptIn ? 'ukljucena' : 'iskljucena'}`);

    return user;
  }
}

module.exports = PhoneService;
