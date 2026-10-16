const fs = require('fs');
const path = require('path');

const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');

/**
 * OPENAPI DOKUMENTACIJA NA `/docs` (spec §8, §11).
 *
 * Jedan pomocnik za svih devet servisa: svaki uz kod ima `openapi.yaml`,
 * a ovde se on ucitava i izlaze na `/docs` (Swagger UI) i
 * `/docs/openapi.json` (sirova sema, za alate).
 *
 * Zavisnosti (`swagger-ui-express`, `yaml`) stoje u `voyra/package.json`,
 * pa se instaliraju jednom - Node ih pronalazi penjanjem do
 * `voyra/node_modules`. Bez toga bi isti paket bio instaliran devet puta.
 *
 * `DOCS_ENABLED=false` gasi dokumentaciju. Podrazumevano je ukljucena,
 * jer je u razvoju i na odbrani upravo ona ono sto treba da se vidi; u
 * pravom okruzenju se gasi, da se javno ne izlaze spisak ruta.
 */

const dokumentacijaUkljucena = () =>
  String(process.env.DOCS_ENABLED ?? 'true').toLowerCase() !== 'false';

/**
 * Ucitava `openapi.yaml` pored koda servisa.
 *
 * @param {string} korenServisa - obicno `__dirname` iz `src/index.js`
 * @returns {object|null} sema ili `null` kada fajl ne postoji
 */
const ucitajSemu = (korenServisa) => {
  const putanja = path.join(korenServisa, '..', 'openapi.yaml');

  if (!fs.existsSync(putanja)) return null;

  try {
    return YAML.parse(fs.readFileSync(putanja, 'utf8'));
  } catch (err) {
    console.error(`[DOCS] openapi.yaml nije ispravan YAML: ${err.message}`);
    return null;
  }
};

/**
 * Montira `/docs` i `/docs/openapi.json`.
 *
 * @param {import('express').Express} app
 * @param {object} p - { korenServisa, naziv }
 */
const montirajDocs = (app, { korenServisa, naziv }) => {
  if (!dokumentacijaUkljucena()) {
    console.log(`[${naziv}] /docs je iskljucen (DOCS_ENABLED=false)`);
    return false;
  }

  const sema = ucitajSemu(korenServisa);

  if (!sema) {
    console.warn(`[${naziv}] openapi.yaml nije pronadjen - /docs nije montiran`);
    return false;
  }

  app.get('/docs/openapi.json', (req, res) => res.json(sema));

  app.use(
    '/docs',
    swaggerUi.serveFiles(sema, {}),
    swaggerUi.setup(sema, {
      customSiteTitle: `${naziv} - API dokumentacija`,
      swaggerOptions: { displayRequestDuration: true, docExpansion: 'list' }
    })
  );

  console.log(`[${naziv}] API dokumentacija: /docs`);

  return true;
};

module.exports = { montirajDocs, ucitajSemu, dokumentacijaUkljucena };
