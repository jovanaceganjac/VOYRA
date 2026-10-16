/**
 * PROVERA OPENAPI SEMA.
 *
 *   npm run proba:openapi        (iz korena `voyra/`)
 *
 * Dve provere po servisu:
 *
 *   1. `openapi.yaml` je VALIDNA OpenAPI 3.0 sema. Radi to
 *      `@apidevtools/swagger-parser`, isti validator koji koriste i
 *      Swagger alati - ne sopstvena, pola-proverena pravila.
 *
 *   2. POKRIVENOST U OBA SMERA: svaka ruta registrovana u Express-u
 *      postoji u semi, i svaka ruta iz seme postoji u Express-u. Rute se
 *      citaju iz rutera, ne iz spiska u ovom fajlu, pa provera ne moze
 *      da zastari: nova ruta bez dokumentacije obara probu isti dan.
 */
const fs = require('fs');
const path = require('path');

const YAML = require('yaml');
const SwaggerParser = require('@apidevtools/swagger-parser');

const { sveRute, uOpenApi } = require('./rute');
const { SERVISI, ucitajApp } = require('./napravi-openapi');

const KOREN = path.join(__dirname, '..');

let pali = 0;

const tacno = (sta, uslov, opis = '') => {
  console.log(`${uslov ? 'OK  ' : 'PAD '} ${sta}${opis ? `: ${opis}` : ''}`);
  if (!uslov) pali += 1;
};

/** Sve `METOD /putanja` iz seme. */
const ruteIzSeme = (sema) => {
  const izlaz = [];

  for (const [putanja, stavka] of Object.entries(sema.paths || {})) {
    for (const metod of Object.keys(stavka)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(metod)) {
        izlaz.push(`${metod.toUpperCase()} ${putanja}`);
      }
    }
  }

  return izlaz.sort();
};

(async () => {
  console.log('=== Validacija shema i pokrivenost ruta ===\n');

  let ukupnoRuta = 0;

  for (const servis of SERVISI) {
    const putanjaYaml = path.join(KOREN, servis.fascikla, 'openapi.yaml');

    console.log(`--- ${servis.fascikla} ---`);

    if (!fs.existsSync(putanjaYaml)) {
      tacno('openapi.yaml postoji', false, 'fajl nije pronadjen');
      continue;
    }

    const sirovo = fs.readFileSync(putanjaYaml, 'utf8');
    let sema;

    try {
      sema = YAML.parse(sirovo);
    } catch (err) {
      tacno('openapi.yaml je ispravan YAML', false, err.message);
      continue;
    }

    // --- 1. validacija seme ---
    try {
      // `validate` radi i dereferenciranje, pa menja objekat - zato kopija
      await SwaggerParser.validate(JSON.parse(JSON.stringify(sema)));
      tacno('sema je validna OpenAPI 3.0', true, `verzija ${sema.openapi}`);
    } catch (err) {
      tacno('sema je validna OpenAPI 3.0', false, err.message.split('\n')[0]);
    }

    // --- 2. pokrivenost u oba smera ---
    const app = ucitajApp(servis.fascikla);
    const uKodu = sveRute(app).map((r) => `${r.metod} ${uOpenApi(r.putanja)}`).sort();
    const uSemi = ruteIzSeme(sema);

    const nedostaju = uKodu.filter((r) => !uSemi.includes(r));
    const viska = uSemi.filter((r) => !uKodu.includes(r));

    tacno(
      'svaka ruta iz koda je dokumentovana',
      nedostaju.length === 0,
      nedostaju.length ? nedostaju.join(', ') : `${uKodu.length} ruta`
    );

    tacno(
      'nema dokumentovanih ruta kojih nema u kodu',
      viska.length === 0,
      viska.length ? viska.join(', ') : 'nijedna suvisna'
    );

    // --- 3. minimalan kvalitet opisa ---
    const bezOpisa = [];
    const bezOdgovora = [];

    for (const [putanja, stavka] of Object.entries(sema.paths || {})) {
      for (const [metod, def] of Object.entries(stavka)) {
        if (!def || typeof def !== 'object') continue;

        if (!def.summary) bezOpisa.push(`${metod.toUpperCase()} ${putanja}`);
        if (!def.responses || Object.keys(def.responses).length === 0) {
          bezOdgovora.push(`${metod.toUpperCase()} ${putanja}`);
        }
      }
    }

    tacno('svaka ruta ima opis', bezOpisa.length === 0, bezOpisa.slice(0, 3).join(', '));
    tacno('svaka ruta ima odgovore', bezOdgovora.length === 0, bezOdgovora.slice(0, 3).join(', '));

    // --- 4. zajednicka sema greske i bezbednost ---
    tacno(
      'sema greske je definisana',
      Boolean(sema.components?.schemas?.Greska),
      Object.keys(sema.components?.schemas || {}).join(', ')
    );

    const bezbednost = Object.keys(sema.components?.securitySchemes || {});

    tacno(
      'definisane su seme bezbednosti',
      bezbednost.includes('bearerAuth') && bezbednost.includes('internalKey'),
      bezbednost.join(', ')
    );

    ukupnoRuta += uKodu.length;
    console.log('');
  }

  console.log(`--- Rezultat ---\nDokumentovano ${ukupnoRuta} ruta u ${SERVISI.length} servisa`);

  if (pali > 0) {
    console.log(`\nPALO PROVERA: ${pali}`);
    process.exit(1);
  }

  console.log('\nSVE PROVERE PROLAZE');
  process.exit(0);
})().catch((err) => {
  console.error('\nPROBA PREKINUTA:', err.message);
  process.exit(1);
});
