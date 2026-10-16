/**
 * PRELAZI STATUSA NALOGA (spec §3.3, §4.10).
 *
 * Status se ne menja proizvoljno, nego samo po ovim putanjama - isto
 * pravilo kao kod statusa putovanja u Trip Service-u. Bez toga bi nalog
 * mogao da ode iz `na_cekanju` pravo u `blokiran`, iako korisnik nikada
 * nije ni dobio pristup, ili iz `odbijen` u `blokiran`, sto ne znaci
 * nista.
 *
 *   na_cekanju -> odobren | odbijen      odluka administratora
 *   odobren    -> blokiran               blokiranje aktivnog naloga
 *   blokiran   -> odobren                deblokiranje
 *   odbijen    -> odobren                ispravka greske administratora
 */

const STATUSI = ['na_cekanju', 'odobren', 'odbijen', 'blokiran'];

const PRELAZI = {
  na_cekanju: ['odobren', 'odbijen'],
  odobren: ['blokiran'],
  blokiran: ['odobren'],
  odbijen: ['odobren']
};

/** Da li je prelaz dozvoljen. Isti status u isti je bez efekta, ne greska. */
const prelazDozvoljen = (izStatusa, uStatus) => {
  if (izStatusa === uStatus) return true;

  return (PRELAZI[izStatusa] || []).includes(uStatus);
};

/**
 * Kako se odluka zove u obavestenju korisniku i u revizionom zapisu.
 * `null` znaci da promena ne trazi obavestenje.
 */
const tipObavestenja = (izStatusa, uStatus) => {
  if (izStatusa === uStatus) return null;

  if (uStatus === 'odobren') {
    return izStatusa === 'blokiran' ? 'ACCOUNT_UNBLOCKED' : 'REGISTRATION_APPROVED';
  }

  if (uStatus === 'odbijen') return 'REGISTRATION_REJECTED';
  if (uStatus === 'blokiran') return 'ACCOUNT_BLOCKED';

  return null;
};

/**
 * Da li promena statusa ponistava vec izdate tokene.
 *
 * Blokiran i odbijen nalog mora da izgubi i tokene koji su vec u rukama
 * korisnika; bez toga bi blokiran korisnik nastavio da radi sve do isteka
 * tokena - do 24 sata.
 */
const ponistavaTokene = (uStatus) => uStatus === 'blokiran' || uStatus === 'odbijen';

/**
 * PRAVILA ZA PROMENU STATUSA, bez pristupa bazi.
 *
 * Ista provera je pre stajala u telu rute, gde se nije mogla testirati bez
 * pokrenutog servisa i baze. Broj aktivnih administratora se zato
 * prosledjuje kao ulaz, a ne cita ovde.
 *
 * Redosled provera je znacajan: nepostojeci status je greska zahteva (400),
 * a ostalo su sukobi stanja (409).
 *
 * @param {object} ulaz
 * @param {string} ulaz.izStatusa - trenutni status naloga
 * @param {string} ulaz.uStatus - trazeni status
 * @param {string} ulaz.uloga - uloga naloga koji se menja
 * @param {boolean} ulaz.samSebi - da li administrator menja sopstveni nalog
 * @param {number} ulaz.aktivnihAdmina - koliko naloga ima ulogu admin i status odobren
 * @returns {{ok: true}|{ok: false, error: string, message: string, statusCode: number}}
 */
const proveriPromenuStatusa = ({ izStatusa, uStatus, uloga, samSebi = false, aktivnihAdmina = 0 }) => {
  if (!STATUSI.includes(uStatus)) {
    return {
      ok: false,
      error: 'VALIDATION_ERROR',
      message: `Neispravan status. Dozvoljeni: ${STATUSI.join(', ')}`,
      statusCode: 400
    };
  }

  if (!prelazDozvoljen(izStatusa, uStatus)) {
    return {
      ok: false,
      error: 'INVALID_STATUS_TRANSITION',
      message:
        `Nalog u statusu "${izStatusa}" ne moze da predje u "${uStatus}". ` +
        `Dozvoljeno: ${(PRELAZI[izStatusa] || []).join(', ') || 'nista'}`,
      statusCode: 409
    };
  }

  // Admin ne sme sebe da blokira ni odbije - ostao bi zakljucan van sistema
  if (samSebi && uStatus !== 'odobren') {
    return {
      ok: false,
      error: 'SELF_LOCKOUT',
      message: 'Ne mozete sami sebi promeniti status u neaktivan',
      statusCode: 409
    };
  }

  // Poslednji admin ne sme da ostane bez pristupa - niko vise ne bi mogao u panel
  if (uloga === 'admin' && uStatus !== 'odobren' && aktivnihAdmina <= 1) {
    return {
      ok: false,
      error: 'LAST_ADMIN',
      message: 'Ne mozete blokirati poslednjeg aktivnog administratora',
      statusCode: 409
    };
  }

  return { ok: true };
};

module.exports = {
  STATUSI,
  PRELAZI,
  prelazDozvoljen,
  tipObavestenja,
  ponistavaTokene,
  proveriPromenuStatusa
};
