const HttpClient = require('./httpClient');
const { REGISTRY } = require('../../config/serviceRegistry');

/**
 * Klijent ka Admin Service-u (fire-and-forget audit).
 * Interna ruta POST /api/admin/internal/audit dodata je u ovom tasku.
 */
class AdminClient {
  constructor() {
    this.http = new HttpClient('admin', REGISTRY.admin);
  }

  async log({ action, userId, target, status, metadata, errorMessage }, requestId) {
    try {
      await this.http.zahtev({
        metod: 'post',
        putanja: '/api/admin/internal/audit',
        telo: { action, userId, target, status, metadata, errorMessage },
        internalKey: process.env.INTERNAL_API_KEY,
        requestId
      });

      return { logged: true };
    } catch (err) {
      console.warn('[ORCHESTRATOR] Audit zapis neuspesan:', err.message);
      return { logged: false };
    }
  }
}

module.exports = AdminClient;
