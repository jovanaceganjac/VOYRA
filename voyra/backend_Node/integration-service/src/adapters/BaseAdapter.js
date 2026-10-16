/**
 * Bazna klasa za sve adaptere spoljnih izvora podataka.
 *
 * Adapter pattern: Planner Service ne zna nista o tome odakle podaci
 * dolaze (mock fajl, Duffel, OpenTripMap...) niti u kom su formatu -
 * adapter prevodi spoljni format u interni model aplikacije.
 *
 * Kesiranje je zajednicko za sve adaptere, pa zivi ovde.
 */
class BaseAdapter {
  /**
   * @param {mongoose.Model} CacheModel - kes kolekcija ovog adaptera
   * @param {number} cacheDuration - TTL u sekundama (informativno; stvarno
   *        brisanje radi MongoDB TTL indeks definisan na modelu)
   */
  constructor(CacheModel, cacheDuration = 3600) {
    this.CacheModel = CacheModel;
    this.cacheDuration = cacheDuration;
  }

  /**
   * Vraca { data, cached: true } ako postoji svez zapis, inace null.
   * Greska u kesu ne sme da obori zahtev - samo se preskoci kes.
   */
  async getCached(queryKey) {
    try {
      const zapis = await this.CacheModel.findOne({ queryKey }).lean();
      if (zapis) {
        return { data: zapis.data, cached: true };
      }
    } catch (err) {
      console.error('[INTEGRATION_SERVICE] Cache read error:', err.message);
    }
    return null;
  }

  /**
   * Upisuje rezultat u kes. Stari zapis sa istim kljucem se zamenjuje.
   */
  async setCache(queryKey, data) {
    try {
      await this.CacheModel.findOneAndUpdate(
        { queryKey },
        { queryKey, data, createdAt: new Date() },
        { upsert: true }
      );
    } catch (err) {
      console.error('[INTEGRATION_SERVICE] Cache write error:', err.message);
    }
  }

  /**
   * Template metoda: kes -> (promasaj) -> dohvati -> upisi u kes.
   * Koriste je deca unutar svog fetch()-a.
   *
   * `jeUpotrebljiv` je dodatni uslov nad zapisom iz kesa. Kes sa letovima
   * traje 15 minuta, ali pojedinacna ponuda ume da istekne ranije - pa
   * zapis ciji sadrzaj samo sto nije zastareo nema smisla koristiti
   *
   */
  async withCache(queryKey, dohvati, { jeUpotrebljiv = null, preskociKes = false } = {}) {
    // Osvezavanje ponude pred rezervaciju trazi SVEZU pretragu (§1.3)
    const izKesa = preskociKes ? null : await this.getCached(queryKey);

    if (izKesa && (!jeUpotrebljiv || jeUpotrebljiv(izKesa.data))) {
      console.log(`[INTEGRATION_SERVICE] Cache HIT: ${queryKey}`);
      return izKesa;
    }

    if (izKesa) {
      console.log(`[INTEGRATION_SERVICE] Cache STALE: ${queryKey} - trazim ponovo`);
    }

    console.log(`[INTEGRATION_SERVICE] Cache MISS: ${queryKey}`);
    const data = await dohvati();
    await this.setCache(queryKey, data);

    return { data, cached: false };
  }

  /**
   * Svaki adapter mora da implementira svoj fetch(query).
   */
  async fetch(query) {
    throw new Error('fetch() must be implemented in child class');
  }
}

module.exports = BaseAdapter;
