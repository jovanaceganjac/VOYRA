const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { FRANKFURTER } = require('../config/externalApis');
const { ExchangeRatesCacheModel, TTL } = require('../models/CacheModels');

/**
 * Poslednja linija odbrane: kada ni Frankfurter ni kes nisu dostupni.
 * Priblizne vrednosti, dovoljne da plan ne ostane bez cena - odgovor
 * tada nosi `source: "mock-fallback"`, pa se zna da nisu tacne.
 */
const UGRADJENI_KURSEVI = {
  EUR: 1,
  USD: 1.1,
  RSD: 117.2,
  GBP: 0.85,
  CHF: 0.94,
  JPY: 162.5,
  SEK: 11.3,
  NOK: 11.6,
  DKK: 7.46,
  PLN: 4.3,
  CZK: 25.2,
  HUF: 392.0,
  RON: 4.97,
  BGN: 1.96,
  TRY: 38.5,
  ISK: 150.0
};

/**
 * Kursna lista preko Frankfurter-a (ECB), specifikacija §5.
 *
 * Servis nema kljuc ni ogranicenje poziva, ali kurs objavljuje jednom
 * dnevno - zato kes od 24 h. Uvek se cuva CELA tabela prema EUR-u u
 * jednom zapisu: jedan poziv pokriva sve valute koje se mogu pojaviti.
 */
class FrankfurterExchangeAdapter extends BaseAdapter {
  constructor() {
    super(ExchangeRatesCacheModel, TTL.rates);
  }

  /** Cela tabela kurseva prema EUR. */
  async _sviKursevi() {
    const odgovor = await axios.get(`${FRANKFURTER.baseUrl}${FRANKFURTER.latestPath}`, {
      params: { base: 'EUR' },
      timeout: FRANKFURTER.timeout
    });

    const kursevi = odgovor.data?.rates;

    if (!kursevi || typeof kursevi !== 'object') {
      throw new Error('Frankfurter nije vratio kurseve');
    }

    // Odgovor ne sadrzi baznu valutu, a racun je trazi
    return { EUR: 1, ...kursevi };
  }

  /**
   * Tabela kurseva prema EUR, sa oznakom odakle je stigla.
   * Redosled: kes -> Frankfurter -> ugradjena tabela.
   */
  async tabela() {
    const izKesa = await this.getCached('rates-EUR');

    if (izKesa) {
      return { kursevi: izKesa.data.rates, source: 'cache', date: izKesa.data.date };
    }

    try {
      const kursevi = await this._sviKursevi();
      const zapis = { rates: kursevi, date: new Date().toISOString().slice(0, 10) };

      await this.setCache('rates-EUR', zapis);
      console.log(`[FRANKFURTER] Kursevi osvezeni (${Object.keys(kursevi).length} valuta)`);

      return { kursevi, source: 'frankfurter', date: zapis.date };
    } catch (err) {
      console.error('[FRANKFURTER] Error:', err.message);
      console.warn('[FRANKFURTER] Koristim ugradjenu tabelu (fallback)');

      return { kursevi: UGRADJENI_KURSEVI, source: 'mock-fallback', date: null };
    }
  }

  /**
   * Iznos u EUR, zaokruzen na dve decimale.
   * Nepoznata valuta se vraca nepromenjena uz upozorenje - bolje nego
   * da ceo plan ostane bez cene.
   */
  async uEur(iznos, valuta) {
    const broj = Number(iznos);

    if (!Number.isFinite(broj)) return null;

    const oznaka = String(valuta || 'EUR').toUpperCase();
    if (oznaka === 'EUR') return Math.round(broj * 100) / 100;

    const { kursevi } = await this.tabela();
    const kurs = kursevi[oznaka];

    if (!kurs) {
      console.warn(`[FRANKFURTER] Nepoznata valuta ${oznaka} - cena ostaje nekonvertovana`);
      return Math.round(broj * 100) / 100;
    }

    return Math.round((broj / kurs) * 100) / 100;
  }

  /** Ruta /exchange-rates?from=USD&to=EUR */
  async fetch(query) {
    const from = String(query.from).toUpperCase();
    const to = String(query.to).toUpperCase();

    const { kursevi, source, date } = await this.tabela();

    const odEur = kursevi[from];
    const doEur = kursevi[to];

    if (!odEur || !doEur) {
      const greska = new Error(`Nepodrzana valuta: ${!odEur ? from : to}`);
      greska.code = 'UNSUPPORTED_CURRENCY';
      throw greska;
    }

    // Konverzija preko EUR-a: 1 FROM = (EUR->TO) / (EUR->FROM) TO
    return {
      data: {
        from,
        to,
        rate: Math.round((doEur / odEur) * 10000) / 10000,
        date,
        timestamp: new Date().toISOString()
      },
      cached: source === 'cache',
      source
    };
  }
}

// Jedna instanca za ceo servis - kes kurseva se deli medju adapterima,
// pa konverzija cena u letovima i smestaju ne trosi nove pozive
const kursAdapter = new FrankfurterExchangeAdapter();

module.exports = { kursAdapter, FrankfurterExchangeAdapter, UGRADJENI_KURSEVI };
