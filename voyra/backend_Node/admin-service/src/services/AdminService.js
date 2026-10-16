const axios = require('axios');
const SystemStats = require('../models/SystemStats');

const TIMEOUT = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 30000;

/**
 * Admin Service ne drzi korisnike ni putovanja - ona zive u svojim
 * servisima. Ovde se samo prosledjuju pozivi na interne admin rute.
 *
 * Svaki poziv nosi DVE stvari:
 *   - X-Admin-Request: true  (marker da je zahtev interni, admin)
 *   - Authorization: Bearer <admin token>  (dokaz da je posiljalac admin)
 *
 * Sam header nije dokaz - bilo ko bi ga mogao poslati. Zato servisi
 * iza i dalje verifikuju token i ulogu.
 */
class AdminService {
  constructor() {
    this.userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:4001';
    this.tripServiceUrl = process.env.TRIP_SERVICE_URL || 'http://localhost:4002';
  }

  /** Zaglavlja za interni poziv, sa prosledjenim admin tokenom. */
  _headers(adminToken) {
    return {
      'X-Admin-Request': 'true',
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Prevodi gresku iz poziva ka drugom servisu u gresku sa statusom,
   * da ruta ne bi svaki problem prijavila kao 500.
   */
  _greska(err, podrazumevanaPoruka) {
    if (err.response) {
      const telo = err.response.data || {};
      const e = new Error(telo.message || podrazumevanaPoruka);

      e.code = telo.error || 'SERVICE_ERROR';
      e.statusCode = err.response.status;

      /*
       * Dodatna polja iz tela greske (lista `errors`, `retryAfter`...)
       * se prenose - isti propust je ranije postojao u gateway-u,
       * orchestratoru i booking-service-u, pa je poruka o gresci na
       * ekranu bila siromasnija nego sto servis zaista vraca.
       */
      const { message, error, statusCode, success, ...ostalo } = telo;
      if (Object.keys(ostalo).length > 0) e.upstream = ostalo;

      return e;
    }

    const e = new Error('Ciljni servis trenutno nije dostupan');
    e.code = 'SERVICE_UNAVAILABLE';
    e.statusCode = 503;
    return e;
  }

  async getAllUsers(filter = {}, adminToken) {
    try {
      const odgovor = await axios.get(`${this.userServiceUrl}/api/users/all`, {
        headers: this._headers(adminToken),
        params: filter,
        timeout: TIMEOUT
      });

      return odgovor.data.data || [];
    } catch (err) {
      console.error('[ADMIN_SERVICE] Get users error:', err.message);
      throw this._greska(err, 'Neuspesno preuzimanje korisnika');
    }
  }

  /**
   * @returns {Promise<{user: object, promena: object|null}>} korisnik i
   *   opis prelaza (`{ iz, u, obavestenje }`), iz kog ruta bira koje
   *   obavestenje salje
   */
  async updateUserStatus(userId, newStatus, adminToken) {
    try {
      const odgovor = await axios.patch(
        `${this.userServiceUrl}/api/users/${userId}/status`,
        { status: newStatus },
        { headers: this._headers(adminToken), timeout: TIMEOUT }
      );

      return { user: odgovor.data.data, promena: odgovor.data.promena || null };
    } catch (err) {
      console.error('[ADMIN_SERVICE] Update status error:', err.message);
      throw this._greska(err, 'Neuspesna promena statusa korisnika');
    }
  }

  async updateUserRole(userId, newRole, adminToken) {
    try {
      const odgovor = await axios.patch(
        `${this.userServiceUrl}/api/users/${userId}/role`,
        { uloga: newRole },
        { headers: this._headers(adminToken), timeout: TIMEOUT }
      );

      return odgovor.data.data;
    } catch (err) {
      console.error('[ADMIN_SERVICE] Update role error:', err.message);
      throw this._greska(err, 'Neuspesna promena uloge korisnika');
    }
  }

  async deleteUser(userId, adminToken) {
    try {
      const odgovor = await axios.delete(`${this.userServiceUrl}/api/users/${userId}`, {
        headers: this._headers(adminToken),
        timeout: TIMEOUT
      });

      return odgovor.data.data;
    } catch (err) {
      console.error('[ADMIN_SERVICE] Delete user error:', err.message);
      throw this._greska(err, 'Neuspesno brisanje korisnika');
    }
  }

  /**
   * Statistika sistema. Jedan servis koji ne odgovara ne sme da obori
   * ceo pregled - zato allSettled i status po servisu.
   */
  async getSystemStats(adminToken) {
    const headers = this._headers(adminToken);
    const pocetak = Date.now();

    const meri = async (fn) => {
      const t = Date.now();
      try {
        const r = await fn();
        return { ok: true, data: r.data, responseTime: Date.now() - t };
      } catch (err) {
        return { ok: false, error: err.message, responseTime: Date.now() - t };
      }
    };

    const [korisnici, putovanja, integracija] = await Promise.all([
      meri(() => axios.get(`${this.userServiceUrl}/api/users/all`, { headers, timeout: 5000 })),
      meri(() => axios.get(`${this.tripServiceUrl}/api/trips/all`, { headers, timeout: 5000 })),
      meri(() =>
        axios.get(
          `${process.env.INTEGRATION_SERVICE_URL || 'http://localhost:4003'}/health`,
          { timeout: 5000 }
        )
      )
    ]);

    const sviKorisnici = korisnici.ok ? korisnici.data.data || [] : [];
    const svaPutovanja = putovanja.ok ? putovanja.data.data || [] : [];

    const pre24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stats = {
      totalUsers: korisnici.ok ? korisnici.data.count ?? sviKorisnici.length : 0,
      activeUsers: sviKorisnici.filter(
        (u) => u.poslednjaPrijava && new Date(u.poslednjaPrijava) >= pre24h
      ).length,
      usersByStatus: this._prebroj(sviKorisnici, 'status'),
      usersByRole: this._prebroj(sviKorisnici, 'uloga'),
      totalTrips: putovanja.ok ? putovanja.data.count ?? svaPutovanja.length : 0,
      tripsByStatus: this._prebroj(svaPutovanja, 'status'),
      // Status je REZERVISANO; 'booked' je ostao iz prve sheme
      totalBookings: svaPutovanja.filter((t) => t.status === 'REZERVISANO').length,
      apiHealth: {
        user: this._zdravlje(korisnici),
        trip: this._zdravlje(putovanja),
        integration: this._zdravlje(integracija)
      },
      responseTime: Date.now() - pocetak,
      timestamp: new Date()
    };

    // Snimi snimak stanja - istorija se cuva 180 dana (TTL na modelu)
    try {
      await SystemStats.create(stats);
    } catch (err) {
      console.error('[ADMIN_SERVICE] Snimanje statistike neuspesno:', err.message);
    }

    return stats;
  }

  _prebroj(niz, polje) {
    return niz.reduce((acc, x) => {
      const k = x[polje] || 'nepoznato';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  }

  _zdravlje(rezultat) {
    return {
      status: rezultat.ok ? 'UP' : 'DOWN',
      lastCheck: new Date(),
      responseTime: rezultat.responseTime
    };
  }
}

module.exports = AdminService;
