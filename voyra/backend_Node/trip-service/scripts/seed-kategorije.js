/**
 * Upisuje sest pocetnih kategorija interesovanja (spec §4.2, §9).
 *
 *   npm run seed:kategorije
 *
 * Vrednosti se CITAJU iz `planner-service/src/config/preferencije.js`, a
 * ne prepisuju rucno: seed tako po definiciji daje isto sto je do sada
 * bilo u kodu, pa prelazak na bazu ne menja nijedan postojeci plan.
 *
 * IDEMPOTENTNA: postojeca kategorija se ne dira (administrator je mozda
 * vec izmenio), a nedostajuca se dodaje. Sa `--force` se sve vraca na
 * pocetne vrednosti.
 */
require('dotenv').config();

const mongoose = require('mongoose');

const InterestCategory = require('../src/models/InterestCategory');

/*
 * Jedino mesto u projektu gde jedan servis cita fajl drugog - i to
 * namerno. Ovo je JEDNOKRATNA seed skripta, ne kod koji radi u pogonu:
 * cilj je da pocetne vrednosti budu identicne konstantama Plannera po
 * definiciji, a ne "prepisane pa se nadamo da se poklapaju". Servisi u
 * radu i dalje komuniciraju samo preko HTTP-a.
 */
let konstante;

try {
  konstante = require('../../planner-service/src/config/preferencije');
} catch (err) {
  console.error(
    '[SEED] Nije pronadjen planner-service/src/config/preferencije.js.\n' +
      '       Skripta uzima pocetne vrednosti odatle, pa mora da se pokrene\n' +
      '       iz repozitorijuma u kom su oba servisa.'
  );
  process.exit(1);
}

const { INTERESOVANJA, RADNO_VREME, TRAJANJE_POSETE, INTERESOVANJE_U_KINDS } = konstante;

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/trips_db';

/**
 * Geoapify kategorije po interesovanju.
 *
 * Svaki kljuc postoji u zvanicnoj Geoapify listi kategorija
 * (https://apidocs.geoapify.com/docs/places/#categories) - nista se ne
 * izmislja. Kategorije su hijerarhijske, pa je dovoljno navesti najvisi
 * nivo: `tourism.sights` pokriva i `tourism.sights.castle`,
 * `tourism.sights.monument` i ostale podgrupe.
 */
const GEOAPIFY_KATEGORIJE = {
  kultura: [
    'tourism.sights',
    'tourism.attraction',
    'religion.place_of_worship',
    'heritage',
    'entertainment.culture'
  ],
  muzeji: ['entertainment.museum'],
  priroda: [
    'leisure.park',
    'natural',
    'beach',
    'national_park',
    'entertainment.zoo',
    'entertainment.aquarium'
  ],
  gastronomija: ['catering.restaurant', 'catering.cafe', 'commercial.marketplace'],
  nocni_zivot: ['adult.nightclub', 'catering.bar', 'catering.pub', 'entertainment.culture.theatre'],
  soping: ['commercial.shopping_mall', 'commercial.marketplace', 'commercial.department_store']
};

/** Prikazni nazivi i opisi - jedino sto konstante nemaju. */
const OPISI = {
  kultura: {
    naziv: 'Kultura',
    opis: 'Spomenici, crkve, tvrđave i istorijska arhitektura'
  },
  priroda: {
    naziv: 'Priroda',
    opis: 'Parkovi, vidikovci, plaže i zaštićena područja'
  },
  gastronomija: {
    naziv: 'Gastronomija',
    opis: 'Restorani, pijace i lokalna kuhinja'
  },
  nocni_zivot: {
    naziv: 'Noćni život',
    opis: 'Klubovi, barovi i večernji program'
  },
  soping: {
    naziv: 'Šoping',
    opis: 'Trgovi, tržni centri i zanatske radnje'
  },
  muzeji: {
    naziv: 'Muzeji',
    opis: 'Stalne postavke i galerije'
  }
};

/** Kategorija onako kako je definisu konstante Plannera. */
const izKonstanti = (kljuc, i) => ({
  _id: kljuc,
  naziv: OPISI[kljuc]?.naziv || kljuc,
  opis: OPISI[kljuc]?.opis || '',
  eksterneKategorije: [...(INTERESOVANJE_U_KINDS[kljuc] || [])],
  geoapifyKategorije: [...(GEOAPIFY_KATEGORIJE[kljuc] || [])],
  trajanjePoseteMin: TRAJANJE_POSETE[kljuc] ?? TRAJANJE_POSETE.ostalo,
  radnoVreme: { ...(RADNO_VREME[kljuc] ?? RADNO_VREME.ostalo) },
  redosled: i + 1,
  aktivna: true
});

(async () => {
  const forsiraj = process.argv.includes('--force');

  await mongoose.connect(MONGO);

  let dodato = 0;
  let azurirano = 0;
  let nepromenjeno = 0;

  for (const [i, kljuc] of INTERESOVANJA.entries()) {
    const zapis = izKonstanti(kljuc, i);
    const postoji = await InterestCategory.findById(kljuc);

    if (!postoji) {
      await InterestCategory.create(zapis);
      dodato += 1;
      continue;
    }

    if (forsiraj) {
      await InterestCategory.updateOne({ _id: kljuc }, { $set: zapis });
      azurirano += 1;
    } else {
      nepromenjeno += 1;
    }
  }

  console.log(`[SEED] Kategorije: ${dodato} novih, ${azurirano} vracenih na pocetne, ${nepromenjeno} netaknutih`);

  // Provera da baza i konstante zaista daju isto
  const razlike = [];

  for (const [i, kljuc] of INTERESOVANJA.entries()) {
    const ocekivano = izKonstanti(kljuc, i);
    const uBazi = await InterestCategory.findById(kljuc).lean();

    if (!uBazi) {
      razlike.push(`${kljuc}: nema je u bazi`);
      continue;
    }

    const poredi = (polje, a, b) => {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        razlike.push(`${kljuc}.${polje}: baza ${JSON.stringify(a)} != konstante ${JSON.stringify(b)}`);
      }
    };

    poredi('trajanjePoseteMin', uBazi.trajanjePoseteMin, ocekivano.trajanjePoseteMin);
    poredi(
      'radnoVreme',
      { open: uBazi.radnoVreme.open, close: uBazi.radnoVreme.close },
      ocekivano.radnoVreme
    );
    poredi(
      'eksterneKategorije',
      [...uBazi.eksterneKategorije].sort(),
      [...ocekivano.eksterneKategorije].sort()
    );
    poredi(
      'geoapifyKategorije',
      [...(uBazi.geoapifyKategorije || [])].sort(),
      [...ocekivano.geoapifyKategorije].sort()
    );
  }

  if (razlike.length > 0) {
    console.log('[SEED] Baza se razlikuje od konstanti (ocekivano ako ih je administrator menjao):');
    for (const r of razlike) console.log(`       ${r}`);
  } else {
    console.log('[SEED] Baza i konstante daju identicne vrednosti');
  }

  const ukupno = await InterestCategory.countDocuments();
  console.log(`[SEED] Kategorija u bazi: ${ukupno}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('[SEED] Neuspeh:', err.message);
  process.exit(1);
});
