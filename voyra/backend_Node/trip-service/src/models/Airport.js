const mongoose = require('mongoose');

/**
 * Aerodromi Evrope sa redovnim linijama (spec §4.2).
 *
 * Izvor: OurAirports `airports.csv` (javni domen). Uzimaju se samo
 * `large_airport` i `medium_airport` sa `scheduled_service = yes` i
 * postojecim IATA kodom - mali aerodromi bez linija ne mogu da budu
 * polaziste ni odrediste leta.
 *
 * `_id` je IATA kod, pa je ponovni uvoz idempotentan.
 */
const AirportSchema = new mongoose.Schema(
  {
    _id: { type: String },

    iata: { type: String, required: true },
    naziv: { type: String, required: true },
    grad: { type: String, default: '' },

    drzava: { type: String, required: true },
    drzavaNaziv: { type: String, default: '' },

    lat: { type: Number, required: true },
    lon: { type: Number, required: true },

    /** `large_airport` ili `medium_airport`. */
    tip: { type: String, required: true }
  },
  { timestamps: true, _id: false }
);

AirportSchema.index({ drzava: 1 });
AirportSchema.index({ tip: 1 });

module.exports = mongoose.model('Airport', AirportSchema, 'airports');
