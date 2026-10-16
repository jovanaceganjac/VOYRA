/**
 * ZAJEDNICKI DELOVI OPENAPI SEMA.
 *
 * Svih devet servisa vraca gresku u istom obliku, pa nema smisla da
 * svaki `openapi.yaml` nosi svoju kopiju te seme. Ovde su zajednicki
 * delovi, a skripta `scripts/napravi-openapi.js` ih ugradjuje u svaki
 * fajl - tako se sema greske menja na jednom mestu.
 *
 * Fajlovi `openapi.yaml` su i dalje obicni, citljivi YAML: generator se
 * pokrece rucno kada se rute promene, a rezultat ide u repozitorijum.
 */

/** Telo greske - potvrdjeno na svim servisima. */
const SEMA_GRESKE = {
  type: 'object',
  required: ['success', 'error', 'message', 'statusCode'],
  properties: {
    success: { type: 'boolean', enum: [false], description: 'Uvek `false` kod greske' },
    error: {
      type: 'string',
      description: 'Masinski citljiv kod greske',
      example: 'VALIDATION_ERROR'
    },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      description: 'Poruka za korisnika; Joi validacija vraca listu poruka'
    },
    statusCode: { type: 'integer', example: 400 },
    errors: {
      type: 'array',
      items: { type: 'string' },
      description: 'Pojedinacne greske validacije, kada ih servis salje'
    },
    attemptsLeft: {
      type: 'integer',
      description: 'Koliko pokusaja ostaje pre zakljucavanja (prijava, SMS kod, lozinka)'
    },
    retryAfter: {
      type: 'integer',
      description: 'Sekundi do isteka zakljucavanja (uz 429)'
    },
    currentVersion: {
      type: 'string',
      description: 'Trenutna verzija putovanja kod 409 VERSION_CONFLICT'
    }
  }
};

/** Odgovori koje vraca skoro svaka ruta. */
const ODGOVORI = {
  400: {
    description: 'Neispravan zahtev (validacija)',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Neispravni podaci',
          errors: ['checkIn je obavezan'],
          statusCode: 400
        }
      }
    }
  },
  401: {
    description: 'Nedostaje token, token je nevazeci ili je opozvan',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'TOKEN_REVOKED',
          message: 'Sesija je istekla ili je nalog promenjen. Prijavite se ponovo.',
          statusCode: 401
        }
      }
    }
  },
  403: {
    description: 'Nalog nema pravo pristupa (uloga ili status)',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'FORBIDDEN',
          message: 'Samo administratori mogu da pristupe ovom resursu',
          statusCode: 403
        }
      }
    }
  },
  404: {
    description: 'Resurs nije pronadjen',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'NOT_FOUND',
          message: 'Putovanje nije pronadjeno',
          statusCode: 404
        }
      }
    }
  },
  409: {
    description: 'Sukob sa trenutnim stanjem (verzija, dvostruka rezervacija, prelaz statusa)',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'VERSION_CONFLICT',
          message: 'Putovanje je u medjuvremenu izmenjeno',
          currentVersion: '2027-06-10T12:00:00.000Z',
          statusCode: 409
        }
      }
    }
  },
  410: {
    description: 'Ponuda vise ne postoji (Duffel ponude vaze 15-20 min)',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'SELECTION_EXPIRED',
          message: 'Izabrana ponuda je istekla - izaberite ponovo',
          statusCode: 410
        }
      }
    }
  },
  422: {
    description: 'Zahtev je ispravan, ali se ne moze izvrsiti nad ovim podacima',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'UNPROCESSABLE',
          message: 'Podaci o putnicima nisu potpuni',
          errors: ['Putnik 1: nedostaje broj pasosa'],
          statusCode: 422
        }
      }
    }
  },
  429: {
    description: 'Previse pokusaja - zaglavlje `Retry-After` nosi vreme cekanja',
    headers: {
      'Retry-After': { schema: { type: 'integer' }, description: 'Sekundi do sledeceg pokusaja' }
    },
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'RATE_LIMIT',
          message: 'Previse pogresnih pokusaja. Pokusajte ponovo za 15 minuta',
          retryAfter: 900,
          statusCode: 429
        }
      }
    }
  },
  503: {
    description: 'Servis iza gateway-a nije dostupan',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Greska' },
        example: {
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Ciljni servis trenutno nije dostupan',
          statusCode: 503
        }
      }
    }
  }
};

/** Sema bezbednosti: JWT za korisnicke rute. */
const BEARER = {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description:
    'JWT iz `POST /api/users/login`. Vazi 24 h, a prestaje da vazi ranije ' +
    'kada se promeni lozinka, uloga ili status naloga (claim `tv`).'
};

/** Sema bezbednosti: zajednicki kljuc za pozive servis-servis. */
const INTERNAL = {
  type: 'apiKey',
  in: 'header',
  name: 'X-Internal-Key',
  description:
    'Zajednicki kljuc iz `.env`-a. Ove rute NISU dostupne spolja - gateway ih ne prosledjuje.'
};

/** Odgovor `{ success: true, data: ... }`, koji vraca vecina ruta. */
const uspeh = (opis, sema = { type: 'object' }) => ({
  description: opis,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: sema,
          statusCode: { type: 'integer', example: 200 }
        }
      }
    }
  }
});

/** Samo trazeni statusi iz zajednickog spiska. */
const odgovori = (...kodovi) => {
  const izlaz = {};

  for (const k of kodovi) {
    if (ODGOVORI[k]) izlaz[String(k)] = ODGOVORI[k];
  }

  return izlaz;
};

module.exports = { SEMA_GRESKE, ODGOVORI, BEARER, INTERNAL, uspeh, odgovori };
