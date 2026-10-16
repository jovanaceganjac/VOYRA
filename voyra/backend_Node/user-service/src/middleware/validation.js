const Joi = require('joi');

const { semaLozinke } = require('../config/lozinka');

// Samo slova (ukljucujuci nasa: čćžšđ), razmak, crtica i apostrof - bez brojeva
const SAMO_SLOVA = /^[A-Za-zČĆŽŠĐČćčćžšđÀ-ɏ' -]+$/;

const registerSchema = Joi.object({
  ime: Joi.string()
    .min(2)
    .max(50)
    .pattern(SAMO_SLOVA)
    .required()
    .messages({
      'string.min': 'Ime mora imati minimum 2 karaktera',
      'string.max': 'Ime sme imati najvise 50 karaktera',
      'string.pattern.base': 'Ime sme sadrzati samo slova',
      'string.empty': 'Ime je obavezno',
      'any.required': 'Ime je obavezno'
    }),

  prezime: Joi.string()
    .min(2)
    .max(50)
    .pattern(SAMO_SLOVA)
    .required()
    .messages({
      'string.min': 'Prezime mora imati minimum 2 karaktera',
      'string.max': 'Prezime sme imati najvise 50 karaktera',
      'string.pattern.base': 'Prezime sme sadrzati samo slova',
      'string.empty': 'Prezime je obavezno',
      'any.required': 'Prezime je obavezno'
    }),

  email: Joi.string()
    // tlds:false -> dozvoljava i interne domene tipa voyra.local
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Unesite validan email',
      'string.empty': 'Email je obavezan',
      'any.required': 'Email je obavezan'
    }),

  korisnickoIme: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(3)
    .max(20)
    .required()
    .messages({
      'string.pattern.base': 'Korisnicko ime sme sadrzati samo slova, brojeve, _ i - (bez razmaka)',
      'string.min': 'Korisnicko ime mora imati najmanje 3 karaktera',
      'string.max': 'Korisnicko ime sme imati najvise 20 karaktera',
      'any.required': 'Korisnicko ime je obavezno'
    }),

  // Pravila su u config/lozinka.js - deli ih i promena lozinke
  lozinka: semaLozinke('Lozinka'),

  lozinkaConfirm: Joi.string()
    .valid(Joi.ref('lozinka'))
    .required()
    .messages({
      'any.only': 'Lozinke se ne poklapaju',
      'any.required': 'Potvrda lozinke je obavezna'
    }),

  // Telefon je opcion; tacan format proverava phoneValidator
  phone: Joi.string().allow('', null).optional()
});

/**
 * PUT /api/users/me/password (spec §4.10).
 *
 * `novaLozinka` prati ISTA pravila kao registracija - shema je ista.
 * Poredjenje sa trenutnom lozinkom radi ruta, jer trazi bazu.
 */
const promenaLozinkeSchema = Joi.object({
  trenutnaLozinka: Joi.string().required().messages({
    'string.empty': 'Trenutna lozinka je obavezna',
    'any.required': 'Trenutna lozinka je obavezna'
  }),

  novaLozinka: semaLozinke('Nova lozinka')
});

const loginSchema = Joi.object({
  korisnickoIme: Joi.string().required().messages({
    'string.empty': 'Korisnicko ime je obavezno',
    'any.required': 'Korisnicko ime je obavezno'
  }),
  lozinka: Joi.string().required().messages({
    'string.empty': 'Lozinka je obavezna',
    'any.required': 'Lozinka je obavezna'
  })
});

/**
 * Fabrika middleware-a: validira req.body datom Joi semom.
 * Na gresku vraca 400 sa listom svih poruka; na uspeh upisuje
 * ociscenu vrednost nazad u req.body.
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details.map((d) => d.message),
      statusCode: 400
    });
  }

  req.body = value;
  next();
};

module.exports = {
  promenaLozinkeSchema, registerSchema, loginSchema, validate };
