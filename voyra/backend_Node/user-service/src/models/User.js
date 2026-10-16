const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

const userSchema = new mongoose.Schema({
  ime: {
    type: String,
    required: [true, 'Ime je obavezno'],
    trim: true,
    minlength: [2, 'Ime mora imati najmanje 2 karaktera']
  },

  prezime: {
    type: String,
    required: [true, 'Prezime je obavezno'],
    trim: true,
    minlength: [2, 'Prezime mora imati najmanje 2 karaktera']
  },

  email: {
    type: String,
    required: [true, 'Email je obavezan'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, 'Unesite validan email']
  },

  korisnickoIme: {
    type: String,
    required: [true, 'Korisnicko ime je obavezno'],
    unique: true,
    trim: true,
    minlength: [3, 'Korisnicko ime mora imati najmanje 3 karaktera'],
    maxlength: [20, 'Korisnicko ime sme imati najvise 20 karaktera'],
    match: [/^[a-zA-Z0-9_-]+$/, 'Korisnicko ime sme sadrzati samo slova, brojeve, _ i -']
  },

  lozinka: {
    type: String,
    required: [true, 'Lozinka je obavezna'],
    minlength: 8,
    select: false // lozinka se ne vraca u query-ima
  },

  uloga: {
    type: String,
    enum: ['korisnik', 'admin'],
    default: 'korisnik'
  },

  status: {
    type: String,
    enum: ['na_cekanju', 'odobren', 'odbijen', 'blokiran'],
    default: 'na_cekanju'
  },

  /**
   * VERZIJA TOKENA.
   *
   * Token nosi ovu vrednost kao claim `tv`. Kada se nalog promeni tako
   * da raniji tokeni vise ne smeju da vaze - promena lozinke,
   * blokiranje, odbijanje, promena uloge - verzija se uveca i svi stari
   * tokeni odjednom postaju nevazeci, bez cekanja da isteknu.
   *
   * Tokeni izdati pre ovog taska nemaju `tv`; tretiraju se kao 0, pa
   * rade dok se verzija korisnika ne promeni.
   */
  tokenVersion: {
    type: Number,
    default: 0
  },

  // Telefon je opcion i sluzi samo za SMS obavestenja - bez SMS potvrde.
  phone: {
    number: { type: String, trim: true },
    smsOptIn: { type: Boolean, default: true }
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * Ponistava sve ranije izdate tokene ovog korisnika.
 *
 * `$inc` ide direktno u bazu, bez ucitavanja dokumenta: poziva se i sa
 * mesta koja korisnika menjaju kroz `findByIdAndUpdate`, pa nema uvek
 * ucitan dokument pri ruci.
 */
userSchema.statics.ponistiTokene = function (id) {
  return this.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
};

// Hesiranje lozinke pre snimanja (samo ako je promenjena)
userSchema.pre('save', async function (next) {
  this.updatedAt = new Date();

  if (!this.isModified('lozinka')) return next();

  try {
    this.lozinka = await bcrypt.hash(this.lozinka, BCRYPT_ROUNDS);
    next();
  } catch (err) {
    next(err);
  }
});

// Poredjenje unete lozinke sa hesom iz baze
userSchema.methods.uporediLozinku = async function (uneta) {
  return bcrypt.compare(uneta, this.lozinka);
};

// Lozinka nikada ne izlazi iz servisa
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.lozinka;
  delete obj.__v;

  // Kod i brojac pokusaja su interni
  if (obj.phone) {
    delete obj.phone.verificationCode;
    delete obj.phone.attempts;
    delete obj.phone.lockedUntil;
  }

  return obj;
};

// sparse dozvoljava vise naloga bez broja; ako broj postoji, mora biti jedinstven
userSchema.index({ 'phone.number': 1 }, { unique: true, sparse: true });

/** Podaci o telefonu koji smeju da napuste servis (bez koda i brojaca). */
userSchema.methods.javniTelefon = function () {
  if (!this.phone?.number) return null;

  return {
    number: this.phone.number,
    smsOptIn: this.phone.smsOptIn
  };
};

module.exports = mongoose.model('User', userSchema);
