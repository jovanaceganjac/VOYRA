const crypto = require('crypto');
const NotificationTemplate = require('../models/NotificationTemplate');
const TemplateEngine = require('./TemplateEngine');

const MAX_DUZINA = 160;

const twilioKonfigurisan = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );

/**
 * Slanje SMS notifikacija.
 * Bez Twilio podataka radi u simulaciji, isti oblik odgovora.
 */
class SMSService {
  constructor() {
    this.engine = new TemplateEngine();
  }

  async getTemplate(name) {
    const sablon = await NotificationTemplate.findOne({ name, type: 'sms' });

    if (!sablon) {
      const e = new Error(`Template not found: ${name}`);
      e.code = 'TEMPLATE_NOT_FOUND';
      e.statusCode = 400;
      throw e;
    }

    return sablon;
  }

  /**
   * Skracuje poruku na 160 karaktera, ali sece na granici reci i
   * dodaje "..." - da poslednja rec ne ostane presecena na pola.
   */
  skratiNa160(tekst) {
    const t = String(tekst || '').replace(/\s+/g, ' ').trim();

    if (t.length <= MAX_DUZINA) return t;

    const isecak = t.slice(0, MAX_DUZINA - 3);
    const poslednjiRazmak = isecak.lastIndexOf(' ');

    return (poslednjiRazmak > MAX_DUZINA * 0.6 ? isecak.slice(0, poslednjiRazmak) : isecak) + '...';
  }

  async send(notification) {
    const sablon = await this.getTemplate(notification.templateName);
    const podaci = notification.templateData || {};

    // SMS je obican tekst - HTML escape bi ubacio &amp; u poruku
    const puniTekst = this.engine.interpolate(sablon.bodyTemplate, podaci, false);
    const body = this.skratiNa160(puniTekst);

    notification.subject = '';
    notification.body = body;

    const broj = notification.recipient?.phone;

    if (!broj) {
      const e = new Error('Primalac nema broj telefona');
      e.code = 'NO_RECIPIENT';
      e.statusCode = 400;
      throw e;
    }

    if (!twilioKonfigurisan()) {
      const externalId = `sim_sms_${crypto.randomBytes(5).toString('hex')}`;

      console.log(`[SMS_SENT] -> ${broj} (${body.length} karaktera)`);
      console.log(`           "${body}"`);

      return { externalId, simulated: true };
    }

    // Twilio poziv - aktivira se kada kredencijali stignu
    const axios = require('axios');
    const sid = process.env.TWILIO_ACCOUNT_SID;

    const odgovor = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      new URLSearchParams({ To: broj, From: process.env.TWILIO_PHONE_NUMBER, Body: body }),
      {
        auth: { username: sid, password: process.env.TWILIO_AUTH_TOKEN },
        timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 10000
      }
    );

    console.log(`[SMS_SENT] -> ${broj} (${odgovor.data.sid})`);

    return { externalId: odgovor.data.sid, simulated: false };
  }
}

module.exports = SMSService;
