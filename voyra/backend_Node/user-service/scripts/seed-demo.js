/**
 * seed:demo - pravi demo naloge iz README-a (`demo` i `demo_admin`).
 *
 * README je i pre ovoga obecavao ta dva naloga, ali ih nijedna skripta nije
 * pravila; na cistom klonu ih nije bilo odakle dobiti osim rucnom
 * registracijom i odobravanjem kroz panel. Zato postoji ova skripta
 *
 *
 * Idempotentna je: drugo pokretanje ne pravi duplikate, nego samo vraca
 * postojeci nalog na pocetne vrednosti (uloga, status, lozinka).
 *
 * Nalozi vaze SAMO za lokalni rad i odbranu. Lozinka je ista kao u README-u
 * i ne daje pristup nicemu izvan ove masine.
 *
 *   node scripts/seed-demo.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../src/models/User');

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/users_db';

/** Lozinka prolazi validator iz §11: 8+ znakova, veliko, malo, cifra, znak. */
const LOZINKA = 'VoyraDemo1!';

const NALOZI = [
  {
    ime: 'Demo',
    prezime: 'Korisnik',
    email: 'demo@voyra.local',
    korisnickoIme: 'demo',
    uloga: 'korisnik',
    cemu: 'prolaz kroz carobnjak, cuvanje i izmena plana'
  },
  {
    ime: 'Demo',
    prezime: 'Administrator',
    email: 'demo_admin@voyra.local',
    korisnickoIme: 'demo_admin',
    uloga: 'admin',
    cemu: 'admin panel'
  }
];

const seed = async () => {
  await mongoose.connect(MONGO);
  console.log(`Baza: ${MONGO}\n`);

  for (const n of NALOZI) {
    // Lozinku hesira `pre('save')` hook modela. Kada bi se ovde pozvao
    // bcrypt.hash, hook bi hesirao hes i prijava ne bi radila.
    let k = await User.findOne({ korisnickoIme: n.korisnickoIme }).select('+lozinka');
    let novo = false;

    if (!k) {
      k = new User({ ...n });
      novo = true;
    } else {
      k.ime = n.ime;
      k.prezime = n.prezime;
      k.email = n.email;
      k.uloga = n.uloga;
    }

    // Demo nalozi moraju biti odobreni - `na_cekanju` ne moze da se prijavi.
    k.status = 'odobren';
    k.lozinka = LOZINKA;

    // Promena lozinke ponistava ranije sesije; demo nalog ionako nema svoje.
    if (!novo) k.tokenVersion = (k.tokenVersion || 0) + 1;

    await k.save();
    console.log(`  ${novo ? 'napravljen' : 'osvezen  '}  ${n.korisnickoIme.padEnd(12)} ${n.uloga.padEnd(9)} ${n.cemu}`);
  }

  console.log(`\nLozinka za oba naloga je u README-u ("Demo nalozi").`);
  console.log('Nalozi su za lokalni rad; u pravom okruzenju se brisu iz /admin/korisnici.');

  await mongoose.disconnect();
};

seed().catch((e) => {
  console.error('seed:demo nije uspeo:', e.message);
  process.exit(1);
});
