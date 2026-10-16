/**
 * GENERATOR `openapi.yaml` FAJLOVA.
 *
 *   node backend_Node/shared/napravi-openapi.js
 *
 * Rute se CITAJU iz Express rutera svakog servisa, a opisi iz
 * `openapi-opisi.js`. Rezultat je obican YAML koji ide u repozitorijum -
 * generator se pokrece rucno kada se rute promene.
 *
 * Skripta NAMERNO puca kada neka ruta nema opis: bolje da generisanje
 * stane nego da u dokumentaciji osvane prazna stavka. Isto pravilo
 * cuva i provera pokrivenosti (`npm run proba:openapi`).
 */
const fs = require('fs');
const path = require('path');

const YAML = require('yaml');

const { sveRute, uOpenApi } = require('./rute');
const { OPISI } = require('./openapi-opisi');
const { SEMA_GRESKE, BEARER, INTERNAL, ODGOVORI } = require('./openapi-osnova');

const KOREN = path.join(__dirname, '..');

/** Servisi, sa portom i kratkim opisom za zaglavlje seme. */
const SERVISI = [
  {
    fascikla: 'api-gateway',
    naziv: 'Voyra API Gateway',
    port: 4000,
    opis:
      'Ulazna tacka sistema i JEDINI deo backenda koji frontend poziva. ' +
      'Proverava JWT, opoziv tokena i prosledjuje zahteve servisima iza.'
  },
  {
    fascikla: 'user-service',
    naziv: 'Voyra User Service',
    port: 4001,
    opis: 'Nalozi, prijava, profil i promena lozinke (spec §4.10).'
  },
  {
    fascikla: 'trip-service',
    naziv: 'Voyra Trip Service',
    port: 4002,
    opis:
      'Sacuvana putovanja, referentni podaci o gradovima i aerodromima, ' +
      'i sadrzaj koji uredjuje administrator (spec §9).'
  },
  {
    fascikla: 'integration-service',
    naziv: 'Voyra Integration Service',
    port: 4003,
    opis:
      'Jedini servis koji zove spoljne API-je (Duffel, LiteAPI, OpenTripMap, ' +
      'Frankfurter, Nominatim, Wikipedia), sa kesom i mock rezimom (spec §5).'
  },
  {
    fascikla: 'planner-service',
    naziv: 'Voyra Planner Service',
    port: 4004,
    opis: 'Algoritam planiranja u pet faza: rangiranje, izbor, k-means++, 2-opt (spec §6).'
  },
  {
    fascikla: 'admin-service',
    naziv: 'Voyra Admin Service',
    port: 4005,
    opis: 'Administracija korisnika i sadrzaja, statistika i revizioni zapisi (spec §3.3).'
  },
  {
    fascikla: 'booking-service',
    naziv: 'Voyra Booking Service',
    port: 4006,
    opis: 'Rezervacija i otkazivanje leta, potvrda u PDF-u (spec §4.8).'
  },
  {
    fascikla: 'notification-service',
    naziv: 'Voyra Notification Service',
    port: 4007,
    opis: 'E-posta i SMS sa redom cekanja i ponovnim pokusajima.'
  },
  {
    fascikla: 'orchestrator-service',
    naziv: 'Voyra Orchestrator Service',
    port: 4008,
    opis: 'Jedinstveni `/v1` API: sklapa plan iz vise servisa u jedan odgovor.'
  }
];

/** Parametri iz putanje: `/v1/trips/{id}` -> `id`. */
const parametriPutanje = (putanja) =>
  [...putanja.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description: `Vrednost parametra \`${m[1]}\``
  }));

/** Standardni odgovori za rutu, prema tome sta trazi. */
const odgovoriZa = (opis) => {
  const kodovi = ['400'];

  if (opis.zasticeno) kodovi.push('401', '403');
  if (opis.interno) kodovi.push('401');

  kodovi.push('404', '503');

  const izlaz = {
    200: {
      description: 'Uspeh',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', enum: [true] },
              data: { description: 'Sadrzaj odgovora; oblik zavisi od rute' },
              statusCode: { type: 'integer', example: 200 }
            }
          }
        }
      }
    }
  };

  for (const k of [...new Set(kodovi)]) izlaz[k] = ODGOVORI[k];

  // Rute koje imaju posebne ishode
  for (const [obrazac, dodatni] of [
    [/login|password/, ['429']],
    [/\/days|\/flight|regenerate/, ['409', '410']],
    [/bookings/, ['409', '410', '422']],
    [/plan/, ['410']]
  ]) {
    if (obrazac.test(opis._putanja || '')) {
      for (const k of dodatni) izlaz[k] = ODGOVORI[k];
    }
  }

  return izlaz;
};

/** Sema jednog servisa. */
const napraviSemu = (servis, rute) => {
  const staze = {};
  const bezOpisa = [];
  const oznake = new Set();

  for (const { metod, putanja } of rute) {
    const uPutanji = uOpenApi(putanja);
    const kljuc = `${metod} ${uPutanji}`;
    const opis = OPISI[kljuc];

    if (!opis) {
      bezOpisa.push(kljuc);
      continue;
    }

    const stavka = {
      summary: opis.summary,
      ...(opis.description ? { description: opis.description } : {}),
      tags: opis.tags || ['Ostalo'],
      ...(parametriPutanje(uPutanji).length
        ? { parameters: parametriPutanje(uPutanji) }
        : {}),
      responses: odgovoriZa({ ...opis, _putanja: uPutanji })
    };

    if (opis.zasticeno) stavka.security = [{ bearerAuth: [] }];
    if (opis.interno) {
      stavka.security = [{ internalKey: [] }];
      stavka.description = `**Interno.** ${opis.description || 'Poziva ga drugi servis, ne klijent.'}`;
    }

    for (const t of stavka.tags) oznake.add(t);

    staze[uPutanji] = staze[uPutanji] || {};
    staze[uPutanji][metod.toLowerCase()] = stavka;
  }

  if (bezOpisa.length > 0) {
    throw new Error(
      `${servis.fascikla}: rute bez opisa u openapi-opisi.js:\n  ` + bezOpisa.join('\n  ')
    );
  }

  const REDOSLED_OZNAKA = [
    'Servis',
    'Nalozi',
    'Profil',
    'Planiranje',
    'Izmena plana',
    'Gradovi',
    'Destinacije',
    'Putovanja',
    'Rezervacija',
    'Obavestenja',
    'Administracija',
    'Algoritam',
    'Izvori',
    'Interno',
    'Ostalo'
  ];

  return {
    openapi: '3.0.3',
    info: {
      title: servis.naziv,
      version: '1.0.0',
      description:
        `${servis.opis}\n\n` +
        'Svi odgovori su JSON. Uspeh nosi `success: true`, a greska zajednicku ' +
        'semu `Greska`. Dokumentacija se iskljucuje sa `DOCS_ENABLED=false`.'
    },
    servers: [{ url: `http://localhost:${servis.port}`, description: 'Lokalni razvoj' }],
    tags: REDOSLED_OZNAKA.filter((t) => oznake.has(t)).map((name) => ({ name })),
    paths: staze,
    components: {
      securitySchemes: { bearerAuth: BEARER, internalKey: INTERNAL },
      schemas: { Greska: SEMA_GRESKE }
    }
  };
};

/** Ucitava aplikaciju servisa bez pokretanja servera. */
const ucitajApp = (fascikla) => {
  process.env.DOCS_ENABLED = 'false';

  const putanja = path.join(KOREN, fascikla, 'src', 'index.js');

  delete require.cache[require.resolve(putanja)];

  return require(putanja);
};

const napravi = () => {
  let ukupno = 0;

  for (const servis of SERVISI) {
    const app = ucitajApp(servis.fascikla);
    const rute = sveRute(app);
    const sema = napraviSemu(servis, rute);

    const izlaz = path.join(KOREN, servis.fascikla, 'openapi.yaml');

    fs.writeFileSync(
      izlaz,
      '# GENERISANO skriptom backend_Node/shared/napravi-openapi.js\n' +
        '# Opisi se menjaju u shared/openapi-opisi.js, pa se skripta pokrene ponovo.\n' +
        YAML.stringify(sema, { lineWidth: 100 }),
      'utf8'
    );

    console.log(`${servis.fascikla.padEnd(22)} ${rute.length} ruta -> openapi.yaml`);
    ukupno += rute.length;
  }

  console.log(`\nUkupno dokumentovano: ${ukupno} ruta u ${SERVISI.length} servisa`);
};

if (require.main === module) {
  try {
    napravi();
  } catch (err) {
    console.error('\n[OPENAPI] Generisanje nije uspelo:\n' + err.message);
    process.exit(1);
  }
}

module.exports = { SERVISI, napraviSemu, ucitajApp };
