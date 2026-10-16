/**
 * Upisuje nekoliko istaknutih destinacija (spec §4.1).
 *
 *   npm run seed:destinacije
 *
 * Sluzi da pocetna strana ima sta da prikaze pre nego sto administrator
 * sam nesto doda. Opisi su kratki i napisani ovde; slike se traze sa
 * Wikipedije po MEDJUNARODNOM nazivu grada, istim putem kao slike
 * atrakcija - dakle stvarna slika sa potpisom, ne izmisljena.
 *
 * IDEMPOTENTNA: grad koji je vec istaknut se preskace.
 *
 * POPULARNE destinacije se NE seed-uju - one nastaju koriscenjem, pa bi
 * unapred upisani brojevi bili izmisljena statistika.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const axios = require('axios');

const City = require('../src/models/City');
const Destination = require('../src/models/Destination');
const CityService = require('../src/services/CityService');

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/trips_db';

const servisGradova = new CityService();

/** Wikipedia REST: sazetak strane sa slikom. */
const WIKI = 'https://en.wikipedia.org/api/rest_v1/page/summary';

/** Gradovi se traze po IATA kodu, da skripta ne nosi geoname id-jeve. */
const DESTINACIJE = [
  {
    iata: 'ATH',
    opis: 'Akropolj, Plaka i muzeji na svakom koraku — grad u kom se antika i svakodnevica prepliću.'
  },
  {
    iata: 'FCO',
    opis: 'Forum, Vatikan i trgovi sa fontanama; za Rim je i deset dana malo.'
  },
  {
    iata: 'VIE',
    opis: 'Carske palate, muzejski kvart i kafane u kojima se sedi satima.'
  },
  {
    iata: 'OPO',
    opis: 'Azulejo pločice, podrumi porta i most preko Dura — Porto se obilazi pešice.'
  },
  {
    iata: 'BCN',
    opis: 'Gaudi, Gotski kvart i plaža u istom danu.'
  }
];

/** Slika grada sa Wikipedije, sa potpisom izvora. */
const slikaSaWikipedije = async (nazivEn) => {
  try {
    const { data } = await axios.get(`${WIKI}/${encodeURIComponent(nazivEn)}`, {
      timeout: 8000,
      headers: { 'User-Agent': 'Voyra/1.0 (diplomski rad; kontakt u README)' }
    });

    const url = data?.thumbnail?.source || data?.originalimage?.source;

    if (!url) return null;

    return {
      url,
      sourceUrl: data?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${nazivEn}`,
      credit: 'Wikimedia Commons / Wikipedia'
    };
  } catch (err) {
    console.warn(`[SEED] Slika za ${nazivEn} nije preuzeta: ${err.message}`);
    return null;
  }
};

(async () => {
  await mongoose.connect(MONGO);

  let dodato = 0;
  let preskoceno = 0;
  let bezSlike = 0;

  for (const [i, d] of DESTINACIJE.entries()) {
    // Ista pravila kao CityService.poIataKodu: kod grada, pa najblizi
    const grad = await servisGradova.poIataKodu(d.iata).then(
      (g) => (g ? City.findById(g.id).lean() : null),
      () => null
    );

    if (!grad) {
      console.warn(`[SEED] Grad za kod ${d.iata} nije nadjen - preskacem`);
      continue;
    }

    if (await Destination.exists({ gradId: String(grad._id) })) {
      preskoceno += 1;
      continue;
    }

    const slika = await slikaSaWikipedije(grad.nazivEn || grad.naziv);
    if (!slika) bezSlike += 1;

    await Destination.create({
      gradId: String(grad._id),
      naslov: grad.nazivSr || grad.naziv,
      opis: d.opis,
      slika,
      redosled: i + 1,
      istaknuta: true
    });

    console.log(`[SEED] + ${grad.nazivSr || grad.naziv} (${grad.drzavaNaziv})${slika ? ' sa slikom' : ''}`);
    dodato += 1;
  }

  const ukupno = await Destination.countDocuments({ istaknuta: true });

  console.log(
    `[SEED] Destinacije: ${dodato} novih, ${preskoceno} vec postojalo` +
      `${bezSlike > 0 ? `, ${bezSlike} bez slike` : ''}`
  );
  console.log(`[SEED] Istaknutih u bazi: ${ukupno}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('[SEED] Neuspeh:', err.message);
  process.exit(1);
});
