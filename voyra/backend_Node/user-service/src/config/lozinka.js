const Joi = require('joi');

/**
 * PRAVILA ZA LOZINKU (spec §11).
 *
 * Najmanje 8 znakova, veliko slovo, malo slovo, broj i poseban znak.
 *
 * Stoje na JEDNOM mestu: registracija i promena lozinke koriste isti
 * izraz i iste poruke. Druga kopija regularnog izraza bi vremenom
 * odlutala, pa bi lozinka koja prolazi pri registraciji mogla da padne
 * pri promeni (ili obrnuto).
 */

const MIN_ZNAKOVA = 8;

/** Traži bar po jedan: veliko, malo, cifru i poseban znak. */
const PRAVILA = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*])/;

const PORUKE = {
  'string.min': `Lozinka mora imati najmanje ${MIN_ZNAKOVA} karaktera`,
  'string.pattern.base':
    'Lozinka mora imati: VELIKA SLOVA, mala slova, broj, poseban karakter (!@#$%^&*)',
  'any.required': 'Lozinka je obavezna',
  'string.empty': 'Lozinka je obavezna'
};

/**
 * Joi shema za polje lozinke.
 *
 * @param {string} nazivPolja - naziv u poruci („Lozinka", „Nova lozinka")
 */
const semaLozinke = (nazivPolja = 'Lozinka') =>
  Joi.string()
    .min(MIN_ZNAKOVA)
    .pattern(PRAVILA)
    .required()
    .messages({
      ...PORUKE,
      'string.min': `${nazivPolja} mora imati najmanje ${MIN_ZNAKOVA} karaktera`,
      'any.required': `${nazivPolja} je obavezna`,
      'string.empty': `${nazivPolja} je obavezna`
    });

/** Provera bez Joi-ja - za mesta koja ne validiraju kroz shemu. */
const ispravnaLozinka = (lozinka) =>
  typeof lozinka === 'string' && lozinka.length >= MIN_ZNAKOVA && PRAVILA.test(lozinka);

module.exports = { MIN_ZNAKOVA, PRAVILA, PORUKE, semaLozinke, ispravnaLozinka };
