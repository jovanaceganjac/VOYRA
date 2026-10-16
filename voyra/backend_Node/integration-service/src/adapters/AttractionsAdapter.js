const BaseAdapter = require('./BaseAdapter');
const { loadMockData } = require('../utils/mockData');
const { AttractionsCacheModel, TTL } = require('../models/CacheModels');

/**
 * Adapter za atrakcije (simulira OpenTripMap API).
 * Vraca SVE atrakcije grada - Planner Service sam bira koje ulaze u plan.
 */
class AttractionsAdapter extends BaseAdapter {
  constructor() {
    super(AttractionsCacheModel, TTL.attractions);
  }

  /** Spoljni format -> interni model (lat/lon za k-means i 2-opt) */
  normalize(a) {
    const zapis = {
      id: `ATR${String(a.id).padStart(3, '0')}`,
      name: a.naziv,
      city: a.city || a.grad,
      // Vise kategorija iz spec §4.2; `category` ostaje zbog ranije
      // sacuvanih planova koji su imali samo jednu
      categories: a.kategorije || [a.kategorija],
      category: a.kategorija,
      lat: a.lat,
      lon: a.lon,
      description: a.opis,
      currency: 'EUR',
      duration: a.vremeTrajanja,
      rating: a.ocena,
      views: a.pregledi
    };

    // Cena postoji samo tamo gde je javno poznata (ulaz besplatan = 0).
    // Za naplatne spomenike i muzeje se namerno izostavlja, jer se menja
    // iz godine u godinu - prikaz tada pise "cena nepoznata".
    if (a.cena !== undefined && a.cena !== null) zapis.price = a.cena;

    // Radno vreme samo kada je javno poznato; inace Faza 3 stavlja
    // procenu po kategoriji i oznaci je kao procenu
    if (a.radnoVreme?.open && a.radnoVreme?.close) zapis.openingHours = a.radnoVreme;

    // Naslov clanka na Wikipediji - odatle ide slika
    if (a.wikipedia) zapis.wikipedia = a.wikipedia;

    return zapis;
  }

  /**
   * Ucitavanje + filtriranje bez kesa.
   * Izdvojeno da bi OpenTripMapAdapter mogao da ga pozove kao fallback,
   * a da pritom ne upisuje drugi zapis u isti kes.
   */
  ucitajIFiltriraj({ city }) {
    const sveAtrakcije = loadMockData('attractions.json');
    const trazeniGrad = String(city).toLowerCase();

    /*
     * Izvor NE filtrira po interesovanjima.
     *
     * Ranije je vracao samo izabrana interesovanja, pa formula iz §6.2
     * (`alfa * poklapanje + (1 - alfa) * popularnost`) nije mogla da
     * odradi svoj posao: atrakcija van interesovanja nikada nije stizala
     * do Faze 3, pa nije mogla ni da dopuni dan kada onih u
     * interesovanjima nema dovoljno. Izbor je posao Faze 3.
     */
    return sveAtrakcije
      .filter(
        (a) =>
          a.grad?.toLowerCase() === trazeniGrad ||
          a.city?.toLowerCase() === trazeniGrad
      )
      .map((a) => this.normalize(a))
      // ocena opadajuce - najbolje ocenjene prve
      .sort((a, b) => b.rating - a.rating);
  }

  async fetch(query) {
    const { city } = query;
    const queryKey = `attractions-${city}`;

    return this.withCache(queryKey, async () => this.ucitajIFiltriraj(query));
  }
}

module.exports = AttractionsAdapter;
