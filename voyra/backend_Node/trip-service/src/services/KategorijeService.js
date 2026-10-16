const InterestCategory = require('../models/InterestCategory');
const Trip = require('../models/Trip');

const KLJUC = /^[a-z_]{3,30}$/;
/**
 * Radno vreme u obliku HH:MM.
 *
 * Dozvoljeno je i "24:00": Planner ga vec prepoznaje kao kraj dana
 * (`vreme.js`), pa priroda stoji kao 00:00-24:00, tj. bez ogranicenja.
 * Prelazak preko ponoci ("20:00"-"02:00") je takodje dozvoljen.
 */
const VREME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

/**
 * KATEGORIJE INTERESOVANJA (spec §3.3, §9).
 *
 * Cita ih Planner (preko interne rute, sa kesom), a uredjuje
 * administrator kroz Admin Service.
 */
class KategorijeService {
  _greska(poruka, kod, status, dodatno = {}) {
    const e = new Error(poruka);
    e.code = kod;
    e.statusCode = status;
    // `dodatno` ide u telo odgovora (lista `errors`)
    if (Object.keys(dodatno).length > 0) e.dodatno = dodatno;
    return e;
  }

  /** Oblik koji ide klijentu i Planneru. */
  zaPrikaz(k) {
    return {
      kljuc: k._id,
      naziv: k.naziv,
      opis: k.opis || '',
      eksterneKategorije: k.eksterneKategorije || [],
      geoapifyKategorije: k.geoapifyKategorije || [],
      trajanjePoseteMin: k.trajanjePoseteMin,
      radnoVreme: { open: k.radnoVreme?.open, close: k.radnoVreme?.close },
      redosled: k.redosled ?? 100,
      aktivna: k.aktivna !== false
    };
  }

  /**
   * @param {boolean} sveUkljucujuciNeaktivne - administrator vidi i
   *   neaktivne, Planner i frontend samo aktivne
   */
  async lista(sveUkljucujuciNeaktivne = false) {
    const upit = sveUkljucujuciNeaktivne ? {} : { aktivna: true };

    const kategorije = await InterestCategory.find(upit)
      .sort({ redosled: 1, _id: 1 })
      .lean();

    return kategorije.map((k) => this.zaPrikaz(k));
  }

  async jedna(kljuc) {
    const k = await InterestCategory.findById(String(kljuc)).lean();

    if (!k) throw this._greska('Kategorija nije pronadjena', 'NOT_FOUND', 404);

    return this.zaPrikaz(k);
  }

  /** Provera polja pre upisa; vraca listu gresaka. */
  _proveri(telo, { noviZapis }) {
    const greske = [];

    if (noviZapis && !KLJUC.test(String(telo.kljuc || ''))) {
      greske.push('kljuc sme da ima samo mala slova i donju crtu (3-30 znakova)');
    }

    if (!String(telo.naziv || '').trim()) greske.push('naziv je obavezan');

    if (telo.eksterneKategorije !== undefined) {
      const lista = telo.eksterneKategorije;

      if (!Array.isArray(lista) || lista.length === 0) {
        greske.push('eksterneKategorije mora biti lista sa bar jednom vrednoscu');
      } else if (lista.some((x) => !String(x || '').trim())) {
        greske.push('eksterneKategorije ne sme da sadrzi prazne vrednosti');
      }
    } else if (noviZapis) {
      greske.push('eksterneKategorije je obavezna');
    }

    if (telo.trajanjePoseteMin !== undefined) {
      const t = Number(telo.trajanjePoseteMin);

      if (!Number.isFinite(t) || t < 15 || t > 600) {
        greske.push('trajanjePoseteMin mora biti broj izmedju 15 i 600');
      }
    } else if (noviZapis) {
      greske.push('trajanjePoseteMin je obavezno');
    }

    if (telo.radnoVreme !== undefined) {
      const { open, close } = telo.radnoVreme || {};

      if (!VREME.test(String(open)) || !VREME.test(String(close))) {
        greske.push('radnoVreme.open i radnoVreme.close moraju biti u obliku HH:MM');
      }
      /*
       * Jednakost bi znacila dan bez ijednog minuta rada; `close < open`
       * je dozvoljeno i znaci prelazak preko ponoci (nocni zivot).
       */
      else if (open === close) {
        greske.push('radnoVreme.open i radnoVreme.close ne smeju biti isti');
      }
    } else if (noviZapis) {
      greske.push('radnoVreme je obavezno');
    }

    return greske;
  }

  async kreiraj(telo) {
    const greske = this._proveri(telo, { noviZapis: true });

    if (greske.length > 0) {
      throw this._greska('Kategorija nije ispravna', 'VALIDATION_ERROR', 400, { errors: greske });
    }

    const kljuc = String(telo.kljuc).trim();

    if (await InterestCategory.exists({ _id: kljuc })) {
      throw this._greska(`Kategorija "${kljuc}" vec postoji`, 'DUPLICATE', 409);
    }

    const k = await InterestCategory.create({
      _id: kljuc,
      naziv: String(telo.naziv).trim(),
      opis: String(telo.opis || '').trim(),
      eksterneKategorije: telo.eksterneKategorije.map((x) => String(x).trim()),
      geoapifyKategorije: (telo.geoapifyKategorije || []).map((x) => String(x).trim()).filter(Boolean),
      trajanjePoseteMin: Number(telo.trajanjePoseteMin),
      radnoVreme: { open: telo.radnoVreme.open, close: telo.radnoVreme.close },
      redosled: Number.isFinite(Number(telo.redosled)) ? Number(telo.redosled) : 100,
      aktivna: telo.aktivna !== false
    });

    return this.zaPrikaz(k.toObject());
  }

  /** `kljuc` se NE menja - sacuvana putovanja ga vec nose. */
  async izmeni(kljuc, telo) {
    const postojeca = await InterestCategory.findById(String(kljuc));

    if (!postojeca) throw this._greska('Kategorija nije pronadjena', 'NOT_FOUND', 404);

    const spojeno = {
      naziv: telo.naziv ?? postojeca.naziv,
      eksterneKategorije: telo.eksterneKategorije ?? postojeca.eksterneKategorije,
      trajanjePoseteMin: telo.trajanjePoseteMin ?? postojeca.trajanjePoseteMin,
      radnoVreme: telo.radnoVreme ?? {
        open: postojeca.radnoVreme.open,
        close: postojeca.radnoVreme.close
      }
    };

    const greske = this._proveri({ ...telo, ...spojeno }, { noviZapis: false });

    if (greske.length > 0) {
      throw this._greska('Kategorija nije ispravna', 'VALIDATION_ERROR', 400, { errors: greske });
    }

    postojeca.naziv = String(spojeno.naziv).trim();
    postojeca.eksterneKategorije = spojeno.eksterneKategorije.map((x) => String(x).trim());
    postojeca.trajanjePoseteMin = Number(spojeno.trajanjePoseteMin);
    postojeca.radnoVreme = { open: spojeno.radnoVreme.open, close: spojeno.radnoVreme.close };

    if (telo.geoapifyKategorije !== undefined) {
      postojeca.geoapifyKategorije = (telo.geoapifyKategorije || [])
        .map((x) => String(x).trim())
        .filter(Boolean);
    }

    if (telo.opis !== undefined) postojeca.opis = String(telo.opis).trim();
    if (telo.redosled !== undefined) postojeca.redosled = Number(telo.redosled);
    if (telo.aktivna !== undefined) postojeca.aktivna = Boolean(telo.aktivna);

    await postojeca.save();

    return this.zaPrikaz(postojeca.toObject());
  }

  /**
   * MEKO brisanje (`aktivna: false`).
   *
   * Tvrdo brisanje bi ostavilo sacuvana putovanja sa interesovanjem koje
   * vise ne postoji, pa se kategorija samo sklanja iz ponude.
   */
  async deaktiviraj(kljuc) {
    const k = await InterestCategory.findById(String(kljuc));

    if (!k) throw this._greska('Kategorija nije pronadjena', 'NOT_FOUND', 404);

    k.aktivna = false;
    await k.save();

    return { ...this.zaPrikaz(k.toObject()), koristiPutovanja: await this.koristiPutovanja(kljuc) };
  }

  /** Koliko sacuvanih putovanja koristi kategoriju - prikazuje se pre gasenja. */
  async koristiPutovanja(kljuc) {
    return Trip.countDocuments({ 'preferences.interests': String(kljuc) });
  }
}

module.exports = KategorijeService;
