const mongoose = require('mongoose');

/**
 * Referentni podaci o gradovima Evrope (spec §4.2, §7).
 *
 * Izvor: GeoNames `cities15000` (CC BY 4.0) - naselja sa preko 15.000
 * stanovnika. Aerodromi uz grad se racunaju PRI UVOZU, ne pri svakom
 * zahtevu, jer se ni gradovi ni aerodromi ne pomeraju.
 *
 * `_id` je `geonameId`, pa je ponovni uvoz idempotentan.
 */
const CitySchema = new mongoose.Schema(
  {
    _id: { type: String },

    naziv: { type: String, required: true },
    /** Srpski naziv, samo za gradove za koje ga zaista imamo. */
    nazivSr: { type: String, default: null },
    nazivEn: { type: String, default: null },

    /** Lokalni i strani nazivi (samo latinica) - ulaze u pretragu. */
    alternativniNazivi: { type: [String], default: [] },

    /**
     * Normalizovani oblici za pretragu: mala slova, bez dijakritike.
     * Tako "munch", "münch" i "minh" nalaze isti grad.
     */
    pretraga: { type: [String], default: [] },

    /**
     * Oblici GLAVNIH naziva (lokalni, engleski, srpski).
     *
     * Razdvojeni od ostalih da bi se u rangiranju razlikovalo poklapanje
     * po imenu grada od poklapanja po nekoj od desetina stranih
     * transliteracija - inace "ljub" nalazi Lublin (ima oblik "ljublin")
     * pre Ljubljane.
     */
    pretragaGlavna: { type: [String], default: [] },

    drzava: { type: String, required: true },
    drzavaNaziv: { type: String, default: '' },

    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    stanovnika: { type: Number, default: 0 },

    /** Do tri najbliza aerodroma sa redovnim linijama, do 150 km. */
    aerodromi: {
      type: [
        {
          _id: false,
          iata: String,
          naziv: String,
          udaljenostKm: Number,
          tip: String
        }
      ],
      default: []
    },

    /**
     * Metropolitanski IATA kod (LON, PAR, MIL...).
     *
     * Duffel prima "the 3-letter IATA code for the city or airport"
     * (docs: offer-requests/create-offer-request), pa se za gradove sa
     * vise aerodroma pretraga radi po kodu grada i pokriva sve njih.
     */
    iataGrada: { type: String, default: null }
  },
  { timestamps: true, _id: false }
);

// Pretraga po prefiksu ide preko ovog indeksa
CitySchema.index({ pretraga: 1 });
CitySchema.index({ pretragaGlavna: 1 });
CitySchema.index({ drzava: 1 });
CitySchema.index({ stanovnika: -1 });

module.exports = mongoose.model('City', CitySchema, 'cities');
