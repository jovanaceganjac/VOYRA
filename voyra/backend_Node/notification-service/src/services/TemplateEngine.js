const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Zamena {{placeholder}} vrednosti u tekstu sablona.
 *
 * Za email se vrednosti HTML-escape-uju: podaci dolaze iz zahteva
 * (ime korisnika, razlog greske), pa bi neescape-ovan <script> zavrsio
 * u poruci koju korisnik otvara.
 */
class TemplateEngine {
  escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
  }

  /**
   * @param {string} template - tekst sa {{promenljivama}}
   * @param {object} data - vrednosti
   * @param {boolean} escape - da li escape-ovati (true za email)
   */
  interpolate(template, data = {}, escape = true) {
    if (!template) return '';

    return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (ceo, kljuc) => {
      const vrednost = kljuc.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);

      // Nepoznata promenljiva ostaje vidljiva umesto da tiho nestane
      if (vrednost === undefined || vrednost === null) return ceo;

      return escape ? this.escapeHtml(vrednost) : String(vrednost);
    });
  }

  /** Koje promenljive sablon trazi - za validaciju. */
  izvuciPromenljive(template) {
    const nadjene = String(template || '').match(/\{\{\s*([\w.]+)\s*\}\}/g) || [];
    return [...new Set(nadjene.map((m) => m.replace(/[{}\s]/g, '')))];
  }

  /** Promenljive koje sablon trazi, a nisu prosledjene. */
  nedostajucePromenljive(template, data = {}) {
    return this.izvuciPromenljive(template).filter((k) => {
      const v = k.split('.').reduce((o, x) => (o == null ? undefined : o[x]), data);
      return v === undefined || v === null;
    });
  }
}

module.exports = TemplateEngine;
