const HttpClient = require('./clients/httpClient');
const { REGISTRY } = require('../config/serviceRegistry');

const INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS, 10) || 10000;
const PING_TIMEOUT = parseInt(process.env.HEALTH_TIMEOUT_MS, 10) || 3000;

/**
 * Periodicno pinguje /health svih servisa i drzi poslednji rezultat.
 *
 * GET /v1/health vraca zapamceno stanje - da jedan zahtev ka health-u
 * ne bi pokretao 7 mreznih poziva.
 */
class ServiceHealthMonitor {
  constructor() {
    this.klijenti = Object.fromEntries(
      Object.entries(REGISTRY).map(([ime, k]) => [ime, new HttpClient(ime, k)])
    );

    this.poslednje = null;
    this.timer = null;
  }

  /**
   * HEALTHY  - svi UP
   * DEGRADED - pao bar jedan ne-kriticni servis
   * CRITICAL - pao bar jedan kriticni (planner, integration)
   */
  _ukupanStatus(servisi) {
    const pali = Object.entries(servisi).filter(([, s]) => s.status !== 'UP');

    if (pali.length === 0) return 'HEALTHY';
    if (pali.some(([ime]) => REGISTRY[ime].critical)) return 'CRITICAL';

    return 'DEGRADED';
  }

  async proveri() {
    const imena = Object.keys(this.klijenti);

    const rezultati = await Promise.all(
      imena.map((ime) => this.klijenti[ime].ping(PING_TIMEOUT))
    );

    const servisi = {};

    imena.forEach((ime, i) => {
      servisi[ime] = { ...rezultati[i], critical: REGISTRY[ime].critical };
    });

    this.poslednje = {
      status: this._ukupanStatus(servisi),
      services: servisi,
      lastCheck: new Date().toISOString()
    };

    return this.poslednje;
  }

  /** Zapamceno stanje; prvi poziv pre nego sto monitor odradi krug pinguje odmah. */
  async stanje(osvezi = false) {
    if (osvezi || !this.poslednje) return this.proveri();
    return this.poslednje;
  }

  start() {
    if (this.timer) return;

    this.proveri().catch((e) => console.error('[ORCHESTRATOR] Health provera:', e.message));

    this.timer = setInterval(() => {
      this.proveri().catch((e) => console.error('[ORCHESTRATOR] Health provera:', e.message));
    }, INTERVAL);

    console.log(`[ORCHESTRATOR] Health monitor pokrenut (na svakih ${INTERVAL} ms)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = ServiceHealthMonitor;
