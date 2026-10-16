const crypto = require('crypto');

const Destination = require('../models/Destination');
const SearchStat = require('../models/SearchStat');
const City = require('../models/City');

/** Koliko dana unazad ulazi u „popularno" (spec §4.1). */
const PROZOR_DANA = 30;

/**
 * Tezina sacuvanog putovanja u odnosu na pretragu.
 *
 * score = brojPretraga + 3 * brojSacuvanih
 *
 * Pretraga je znak radoznalosti, a sacuvano putovanje odluka - neko je
 * prosao sva cetiri koraka carobnjaka i zadrzao plan. Faktor 3 je izabran
 * tako da jedno sacuvano putovanje vredi kao mala grupa pretraga, ali da
 * i dalje ne moze samo da odnese grad u vrh liste.
 */
const TEZINA_SACUVANIH = 3;

/** Ispod ovoliko pretraga grad ne ulazi u listu. */
const MIN_PRETRAGA = 3;

/** Gornja granica razlicitih trazilaca koje pamtimo po gradu i danu. */
const MAX_TRAZILACA = 5000;

/** 'YYYY-MM-DD' po UTC-u. */
const danas = () => new Date().toISOString().slice(0, 10);

/**
 * ISTAKNUTE I POPULARNE DESTINACIJE (spec §4.1, §9).
 */
class DestinacijeService {
  _greska(poruka, kod, status) {
    const e = new Error(poruka);
    e.code = kod;
    e.statusCode = status;
    return e;
  }

  /** Destinacija sa podacima grada, spremna za prikaz. */
  async _saGradom(d, gradPoId = null) {
    const grad = gradPoId?.get(d.gradId) || (await City.findById(d.gradId).lean());

    return {
      id: String(d._id),
      gradId: d.gradId,
      naziv: grad ? grad.nazivSr || grad.naziv : d.naslov || d.gradId,
      naslov: d.naslov || (grad ? grad.nazivSr || grad.naziv : ''),
      drzava: grad?.drzava || null,
      drzavaNaziv: grad?.drzavaNaziv || null,
      lat: grad?.lat ?? null,
      lon: grad?.lon ?? null,
      opis: d.opis || '',
      slika: d.slika || null,
      redosled: d.redosled ?? 100,
      istaknuta: d.istaknuta !== false
    };
  }

  /** Gradovi za listu destinacija, jednim upitom umesto N. */
  async _gradovi(destinacije) {
    const ids = [...new Set(destinacije.map((d) => d.gradId))];
    const gradovi = await City.find({ _id: { $in: ids } }).lean();

    return new Map(gradovi.map((g) => [String(g._id), g]));
  }

  async lista(sveUkljucujuciSklonjene = false) {
    const upit = sveUkljucujuciSklonjene ? {} : { istaknuta: true };

    const destinacije = await Destination.find(upit).sort({ redosled: 1, createdAt: 1 }).lean();
    const gradovi = await this._gradovi(destinacije);

    return Promise.all(destinacije.map((d) => this._saGradom(d, gradovi)));
  }

  async kreiraj(telo) {
    const gradId = String(telo.gradId || '').trim();

    if (!gradId) {
      throw this._greska('gradId je obavezan', 'VALIDATION_ERROR', 400);
    }

    const grad = await City.findById(gradId).lean();

    if (!grad) throw this._greska(`Grad ${gradId} ne postoji`, 'UNKNOWN_CITY', 400);

    if (await Destination.exists({ gradId })) {
      throw this._greska(
        `${grad.nazivSr || grad.naziv} je vec medju istaknutim destinacijama`,
        'DUPLICATE',
        409
      );
    }

    if (telo.slika?.url && !/^https:\/\//i.test(String(telo.slika.url))) {
      throw this._greska('slika.url mora da pocinje sa https://', 'VALIDATION_ERROR', 400);
    }

    // Nova destinacija ide na kraj liste
    const poslednja = await Destination.findOne().sort({ redosled: -1 }).lean();

    const d = await Destination.create({
      gradId,
      naslov: String(telo.naslov || '').trim(),
      opis: String(telo.opis || '').trim(),
      slika: telo.slika || null,
      redosled: Number.isFinite(Number(telo.redosled))
        ? Number(telo.redosled)
        : (poslednja?.redosled ?? 0) + 1,
      istaknuta: telo.istaknuta !== false
    });

    return this._saGradom(d.toObject());
  }

  async izmeni(id, telo) {
    const d = await Destination.findById(id).catch(() => null);

    if (!d) throw this._greska('Destinacija nije pronadjena', 'NOT_FOUND', 404);

    if (telo.slika?.url && !/^https:\/\//i.test(String(telo.slika.url))) {
      throw this._greska('slika.url mora da pocinje sa https://', 'VALIDATION_ERROR', 400);
    }

    if (telo.naslov !== undefined) d.naslov = String(telo.naslov).trim();
    if (telo.opis !== undefined) d.opis = String(telo.opis).trim();
    if (telo.slika !== undefined) d.slika = telo.slika || null;
    if (telo.redosled !== undefined) d.redosled = Number(telo.redosled);
    if (telo.istaknuta !== undefined) d.istaknuta = Boolean(telo.istaknuta);

    await d.save();

    return this._saGradom(d.toObject());
  }

  /**
   * Brisanje je TVRDO.
   *
   * Za razliku od kategorija i atrakcija, istaknuta destinacija nije
   * vezana ni za jedno sacuvano putovanje - to je samo izbor na pocetnoj
   * strani, pa nema sta da se sacuva.
   */
  async obrisi(id) {
    const d = await Destination.findByIdAndDelete(id).catch(() => null);

    if (!d) throw this._greska('Destinacija nije pronadjena', 'NOT_FOUND', 404);

    return { obrisanId: String(d._id), gradId: d.gradId };
  }

  /** Novi redosled po listi identifikatora (prvi u listi je prvi na strani). */
  async poredjaj(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw this._greska('ids mora biti lista identifikatora', 'VALIDATION_ERROR', 400);
    }

    const operacije = ids.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { redosled: i + 1 } } }
    }));

    await Destination.bulkWrite(operacije);

    return this.lista(true);
  }

  // =================================================================
  // Popularne destinacije
  // =================================================================

  /**
   * Otisak trazioca: prijavljeni korisnik po `id`, gost po sesiji.
   *
   * Hesira se, da u bazi ne stoji nista cime bi se gost prepoznao izvan
   * ove statistike. Bez oba podatka vraca `null` i zapis se tada broji
   * (ne moze da se proveri da li je isti trazilac) - to je ista granica
   * koju ima svaka statistika bez prijave.
   */
  otisak({ userId = null, sessionId = null } = {}) {
    const izvor = userId || sessionId;

    if (!izvor) return null;

    return crypto.createHash('sha256').update(String(izvor)).digest('hex').slice(0, 16);
  }

  /**
   * Belezi pretragu ili cuvanje plana za grad.
   *
   * Isti trazilac se ISTOG DANA za ISTI GRAD broji jednom: otisak se
   * pamti u `trazioci`, pa ponovljena pretraga (ili samo osvezena
   * stranica) ne povecava broj. Bez toga bi jedan korisnik sa deset
   * osvezavanja napravio „popularnu" destinaciju.
   *
   * @param {object} p - { gradId, vrsta: 'pretraga'|'sacuvano', userId, sessionId }
   * @returns {Promise<{ zabelezeno: boolean }>}
   */
  async zabelezi({ gradId, vrsta = 'pretraga', userId = null, sessionId = null }) {
    if (!gradId) return { zabelezeno: false };

    const datum = danas();
    const otisak = this.otisak({ userId, sessionId });

    const poljeBroj = vrsta === 'sacuvano' ? 'brojSacuvanih' : 'brojPretraga';
    const poljeSkup = vrsta === 'sacuvano' ? 'cuvaoci' : 'trazioci';

    const postojeci = await SearchStat.findOne({ gradId: String(gradId), datum }).lean();

    if (postojeci && otisak && (postojeci[poljeSkup] || []).includes(otisak)) {
      return { zabelezeno: false, razlog: 'vec brojano danas' };
    }

    const dodaj = {};

    if (otisak && (postojeci?.[poljeSkup]?.length ?? 0) < MAX_TRAZILACA) {
      dodaj[poljeSkup] = otisak;
    }

    await SearchStat.updateOne(
      { gradId: String(gradId), datum },
      {
        $inc: { [poljeBroj]: 1 },
        $set: { zabelezeno: new Date() },
        ...(Object.keys(dodaj).length > 0 ? { $addToSet: dodaj } : {})
      },
      { upsert: true }
    );

    return { zabelezeno: true };
  }

  /**
   * Popularne destinacije poslednjih 30 dana (spec §4.1).
   *
   * @param {number} limit
   * @returns {Promise<Array>} gradovi sa brojem pretraga i skorom
   */
  async popularne(limit = 8) {
    const od = new Date(Date.now() - PROZOR_DANA * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const zbirovi = await SearchStat.aggregate([
      { $match: { datum: { $gte: od } } },
      {
        $group: {
          _id: '$gradId',
          pretraga: { $sum: '$brojPretraga' },
          sacuvanih: { $sum: '$brojSacuvanih' }
        }
      },
      // Grad sa jednom-dve pretrage nije popularan, nego slucajan
      { $match: { pretraga: { $gte: MIN_PRETRAGA } } },
      {
        $addFields: {
          score: { $add: ['$pretraga', { $multiply: [TEZINA_SACUVANIH, '$sacuvanih'] }] }
        }
      },
      { $sort: { score: -1, pretraga: -1 } },
      { $limit: Math.max(1, Math.min(Number(limit) || 8, 24)) }
    ]);

    if (zbirovi.length === 0) return [];

    const gradovi = await City.find({ _id: { $in: zbirovi.map((z) => z._id) } }).lean();
    const poId = new Map(gradovi.map((g) => [String(g._id), g]));

    return zbirovi
      .filter((z) => poId.has(String(z._id)))
      .map((z) => {
        const g = poId.get(String(z._id));

        return {
          gradId: String(z._id),
          naziv: g.nazivSr || g.naziv,
          drzava: g.drzava,
          drzavaNaziv: g.drzavaNaziv,
          lat: g.lat,
          lon: g.lon,
          brojPretraga: z.pretraga,
          brojSacuvanih: z.sacuvanih,
          score: z.score
        };
      });
  }
}

module.exports = DestinacijeService;
module.exports.PROZOR_DANA = PROZOR_DANA;
module.exports.TEZINA_SACUVANIH = TEZINA_SACUVANIH;
module.exports.MIN_PRETRAGA = MIN_PRETRAGA;
