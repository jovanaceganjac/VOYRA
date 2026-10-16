const Attraction = require('../models/Attraction');
const City = require('../models/City');
const InterestCategory = require('../models/InterestCategory');
const { udaljenostKm } = require('../utils/normalizacija');

const VREME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

/**
 * Najdalje sto atrakcija sme da bude od centra grada.
 *
 * 50 km je namerno siroko: u opseg ulaze i mesta koja tehnicki nisu u
 * gradu, ali se obilaze iz njega (Dafni je 10 km od centra Atine,
 * Versaj 17 km od Pariza, Vintgar 4 km od Bleda). Sire od toga vise nije
 * jednodnevni obilazak iz tog grada, pa je verovatnije da je
 * administrator izabrao pogresan grad ili pogresio koordinate.
 */
const MAX_UDALJENOST_KM = 50;

/**
 * ATRAKCIJE ADMINISTRATORA (spec §3.3, §4.5).
 *
 * Cita ih Planner (interno, za spajanje u Fazi 3), a uredjuje ih
 * administrator kroz Admin Service.
 */
class AtrakcijeService {
  _greska(poruka, kod, status, dodatno = {}) {
    const e = new Error(poruka);
    e.code = kod;
    e.statusCode = status;
    // `dodatno` ide u telo odgovora (errors, udaljenostKm...)
    if (Object.keys(dodatno).length > 0) e.dodatno = dodatno;
    return e;
  }

  /** Oblik koji ide klijentu i Planneru. */
  zaPrikaz(a) {
    return {
      id: String(a._id),
      izvor: a.izvor || 'admin',
      naziv: a.naziv,
      opis: a.opis || '',
      gradId: a.gradId,
      gradNaziv: a.gradNaziv || null,
      lat: a.lat,
      lon: a.lon,
      kategorije: a.kategorije || [],
      trajanjeMin: a.trajanjeMin,
      radnoVreme: a.radnoVreme || null,
      cenaUlaznice: a.cenaUlaznice ?? null,
      slika: a.slika || null,
      aktivna: a.aktivna !== false
    };
  }

  /**
   * Oblik koji Planner ocekuje od izvora atrakcija.
   *
   * Isti kljucevi kao kod OpenTripMap-a, pa Faza 3 ne mora da zna odakle
   * atrakcija dolazi - jedino `source: 'admin'` ostaje kao oznaka.
   */
  zaPlanner(a) {
    return {
      id: `ADM_${a._id}`,
      name: a.naziv,
      description: a.opis || '',
      lat: a.lat,
      lon: a.lon,
      categories: a.kategorije || [],
      category: (a.kategorije || [])[0] || null,
      duration: a.trajanjeMin,
      ...(a.radnoVreme?.open && a.radnoVreme?.close
        ? { openingHours: { open: a.radnoVreme.open, close: a.radnoVreme.close } }
        : {}),
      price: a.cenaUlaznice ?? 0,
      /*
       * Bez ocene posetilaca: atrakcija administratora je proverena, ali
       * izmisljena ocena bila bi netacan podatak. Faza 3 zapis bez ocene
       * svodi na sredinu skale.
       */
      rating: null,
      image: a.slika?.url || null,
      imageSource: a.slika?.sourceUrl || null,
      imageCredit: a.slika?.credit || null,
      source: 'admin'
    };
  }

  /** Aktivne atrakcije administratora za grad - poziva ih Planner. */
  async zaGrad(gradId, { sveUkljucujuciNeaktivne = false } = {}) {
    const upit = { gradId: String(gradId) };
    if (!sveUkljucujuciNeaktivne) upit.aktivna = true;

    return Attraction.find(upit).sort({ naziv: 1 }).lean();
  }

  async lista(gradId, sveUkljucujuciNeaktivne = false) {
    const zapisi = await this.zaGrad(gradId, { sveUkljucujuciNeaktivne });

    return zapisi.map((a) => this.zaPrikaz(a));
  }

  async jedna(id) {
    const a = await Attraction.findById(id).lean().catch(() => null);

    if (!a) throw this._greska('Atrakcija nije pronadjena', 'NOT_FOUND', 404);

    return this.zaPrikaz(a);
  }

  /** Provera polja; vraca listu gresaka. */
  async _proveri(telo, { noviZapis }) {
    const greske = [];

    if (noviZapis || telo.naziv !== undefined) {
      if (!String(telo.naziv || '').trim()) greske.push('naziv je obavezan');
    }

    if (noviZapis || telo.trajanjeMin !== undefined) {
      const t = Number(telo.trajanjeMin);

      if (!Number.isFinite(t) || t < 15 || t > 600) {
        greske.push('trajanjeMin mora biti broj izmedju 15 i 600');
      }
    }

    if (noviZapis || telo.kategorije !== undefined) {
      const lista = telo.kategorije;

      if (!Array.isArray(lista) || lista.length === 0) {
        greske.push('izaberite bar jednu kategoriju');
      } else {
        // Kategorija mora da postoji, inace atrakcija ne bi bila nadjena
        const postoje = await InterestCategory.find({ _id: { $in: lista } }).lean();
        const poznate = new Set(postoje.map((k) => k._id));
        const nepoznate = lista.filter((k) => !poznate.has(k));

        if (nepoznate.length > 0) {
          greske.push(`Nepoznata kategorija: ${nepoznate.join(', ')}`);
        }
      }
    }

    if (telo.radnoVreme) {
      const { open, close } = telo.radnoVreme;

      if (!VREME.test(String(open)) || !VREME.test(String(close))) {
        greske.push('radnoVreme.open i radnoVreme.close moraju biti u obliku HH:MM');
      } else if (open === close) {
        greske.push('radnoVreme.open i radnoVreme.close ne smeju biti isti');
      }
    }

    if (telo.cenaUlaznice !== undefined && telo.cenaUlaznice !== null) {
      const c = Number(telo.cenaUlaznice);

      if (!Number.isFinite(c) || c < 0) greske.push('cenaUlaznice ne moze biti negativna');
    }

    if (telo.slika && telo.slika.url) {
      if (!/^https:\/\//i.test(String(telo.slika.url))) {
        greske.push('slika.url mora da pocinje sa https://');
      }
      if (!String(telo.slika.credit || '').trim()) {
        greske.push('uz sliku je obavezan potpis izvora');
      }
    }

    return greske;
  }

  /**
   * Grad i provera da su koordinate u njegovom krugu.
   *
   * @throws 400 sa izmerenom udaljenoscu - administrator iz poruke vidi
   *   koliko je promasio, pa lakse nadje gresku (zamenjeni lat/lon, tacka
   *   iz drugog grada...)
   */
  async _proveriLokaciju(gradId, lat, lon) {
    const grad = await City.findById(String(gradId)).lean();

    if (!grad) {
      throw this._greska(`Grad ${gradId} ne postoji`, 'UNKNOWN_CITY', 400);
    }

    const brLat = Number(lat);
    const brLon = Number(lon);

    if (!Number.isFinite(brLat) || !Number.isFinite(brLon)) {
      throw this._greska('lat i lon moraju biti brojevi', 'VALIDATION_ERROR', 400, {
        errors: ['lat i lon moraju biti brojevi']
      });
    }

    const udaljenost = udaljenostKm(
      { lat: grad.lat, lon: grad.lon },
      { lat: brLat, lon: brLon }
    );

    if (udaljenost > MAX_UDALJENOST_KM) {
      throw this._greska(
        `Koordinate su ${udaljenost.toFixed(1)} km od centra grada ${grad.nazivSr || grad.naziv}, ` +
          `a najvise je dozvoljeno ${MAX_UDALJENOST_KM} km`,
        'LOCATION_OUT_OF_RANGE',
        400,
        { udaljenostKm: Math.round(udaljenost * 10) / 10, maxUdaljenostKm: MAX_UDALJENOST_KM }
      );
    }

    return { grad, udaljenost };
  }

  async kreiraj(telo) {
    const greske = await this._proveri(telo, { noviZapis: true });

    if (!telo.gradId) greske.push('gradId je obavezan');

    if (greske.length > 0) {
      throw this._greska('Atrakcija nije ispravna', 'VALIDATION_ERROR', 400, { errors: greske });
    }

    const { grad } = await this._proveriLokaciju(telo.gradId, telo.lat, telo.lon);

    const a = await Attraction.create({
      izvor: 'admin',
      naziv: String(telo.naziv).trim(),
      opis: String(telo.opis || '').trim(),
      gradId: String(telo.gradId),
      gradNaziv: grad.nazivSr || grad.naziv,
      lat: Number(telo.lat),
      lon: Number(telo.lon),
      kategorije: telo.kategorije,
      trajanjeMin: Number(telo.trajanjeMin),
      radnoVreme: telo.radnoVreme || null,
      cenaUlaznice: telo.cenaUlaznice === undefined ? null : telo.cenaUlaznice,
      slika: telo.slika || null,
      aktivna: telo.aktivna !== false
    });

    return this.zaPrikaz(a.toObject());
  }

  async izmeni(id, telo) {
    const postojeca = await Attraction.findById(id).catch(() => null);

    if (!postojeca) throw this._greska('Atrakcija nije pronadjena', 'NOT_FOUND', 404);

    const greske = await this._proveri(telo, { noviZapis: false });

    if (greske.length > 0) {
      throw this._greska('Atrakcija nije ispravna', 'VALIDATION_ERROR', 400, { errors: greske });
    }

    // Grad ili koordinate se menjaju samo zajedno sa proverom rastojanja
    const gradId = telo.gradId ?? postojeca.gradId;
    const lat = telo.lat ?? postojeca.lat;
    const lon = telo.lon ?? postojeca.lon;

    if (telo.gradId !== undefined || telo.lat !== undefined || telo.lon !== undefined) {
      const { grad } = await this._proveriLokaciju(gradId, lat, lon);

      postojeca.gradId = String(gradId);
      postojeca.gradNaziv = grad.nazivSr || grad.naziv;
      postojeca.lat = Number(lat);
      postojeca.lon = Number(lon);
    }

    if (telo.naziv !== undefined) postojeca.naziv = String(telo.naziv).trim();
    if (telo.opis !== undefined) postojeca.opis = String(telo.opis).trim();
    if (telo.kategorije !== undefined) postojeca.kategorije = telo.kategorije;
    if (telo.trajanjeMin !== undefined) postojeca.trajanjeMin = Number(telo.trajanjeMin);
    if (telo.radnoVreme !== undefined) postojeca.radnoVreme = telo.radnoVreme || null;
    if (telo.cenaUlaznice !== undefined) postojeca.cenaUlaznice = telo.cenaUlaznice;
    if (telo.slika !== undefined) postojeca.slika = telo.slika || null;
    if (telo.aktivna !== undefined) postojeca.aktivna = Boolean(telo.aktivna);

    await postojeca.save();

    return this.zaPrikaz(postojeca.toObject());
  }

  /** MEKO brisanje - sacuvani planovi je i dalje prikazuju. */
  async deaktiviraj(id) {
    const a = await Attraction.findById(id).catch(() => null);

    if (!a) throw this._greska('Atrakcija nije pronadjena', 'NOT_FOUND', 404);

    a.aktivna = false;
    await a.save();

    return this.zaPrikaz(a.toObject());
  }
}

module.exports = AtrakcijeService;
module.exports.MAX_UDALJENOST_KM = MAX_UDALJENOST_KM;
