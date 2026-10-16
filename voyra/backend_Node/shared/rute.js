/**
 * CITANJE REGISTROVANIH RUTA IZ EXPRESS-A.
 *
 * Provera pokrivenosti OpenAPI seme mora da poredi dokumentaciju sa
 * STVARNIM stanjem koda, a ne sa rucno prepisanim spiskom - takav spisak
 * bi zastareo prvi put kada neko doda rutu i zaboravi da ga dopuni.
 *
 * Express 4 cuva rute u `app._router.stack`, a 5 u `app.router.stack`.
 * Ugnjezdeni ruteri (`app.use('/api/x', ruter)`)
 * su u istom nizu kao slojevi sa svojim `handle.stack`, pa se prolazi
 * rekurzivno i putanje spajaju.
 */

/** `/^\/api\/users\/?(?=\/|$)/i` -> `/api/users` */
const izRegexa = (regex) => {
  const tekst = regex.toString();

  // Express montira rutere kao regularne izraze nad prefiksom putanje
  const m = tekst.match(/^\/\^\\\/(?<telo>.*?)\\\/\?\(\?=\\\/\|\$\)/);

  if (!m) return '';

  return (
    '/' +
    m.groups.telo
      .replace(/\\\//g, '/')
      .replace(/\\\./g, '.')
      .replace(/\\-/g, '-')
  );
};

/** `/:id` ostaje `/:id`; prazna putanja postaje `/`. */
const spoji = (prefiks, putanja) => {
  const ceo = `${prefiks}${putanja}`.replace(/\/{2,}/g, '/');

  if (ceo.length > 1 && ceo.endsWith('/')) return ceo.slice(0, -1);

  return ceo || '/';
};

/**
 * Sve rute aplikacije.
 *
 * @param {import('express').Express} app
 * @returns {Array<{metod: string, putanja: string}>} sortirano, bez duplikata
 */
const sveRute = (app) => {
  const nadjene = [];

  const prodji = (stack, prefiks) => {
    for (const sloj of stack || []) {
      // Obicna ruta: app.get('/x'), router.post('/y')
      if (sloj.route) {
        const putanja = spoji(prefiks, sloj.route.path);

        for (const [metod, ukljucen] of Object.entries(sloj.route.methods || {})) {
          if (ukljucen && metod !== '_all') {
            nadjene.push({ metod: metod.toUpperCase(), putanja });
          }
        }

        continue;
      }

      // Ugnjezden ruter: app.use('/api/x', ruter)
      if (sloj.name === 'router' && sloj.handle?.stack) {
        prodji(sloj.handle.stack, spoji(prefiks, izRegexa(sloj.regexp)));
      }
    }
  };

  /*
   * Express 4 drzi rutere u `_router`, a 5 u `router`. Citanje `app.router`
   * na verziji 4 baca gresku o zastarelom API-ju, pa `_router` ide PRVI.
   */
  prodji(app._router?.stack || app.router?.stack, '');

  const jedinstvene = new Map();
  for (const r of nadjene) jedinstvene.set(`${r.metod} ${r.putanja}`, r);

  return [...jedinstvene.values()].sort(
    (a, b) => a.putanja.localeCompare(b.putanja) || a.metod.localeCompare(b.metod)
  );
};

/** `/api/users/:id` -> `/api/users/{id}`, kako OpenAPI zapisuje parametre. */
const uOpenApi = (putanja) => putanja.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

module.exports = { sveRute, uOpenApi, izRegexa };
