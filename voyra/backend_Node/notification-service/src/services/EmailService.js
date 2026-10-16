const nodemailer = require('nodemailer');
const crypto = require('crypto');
const NotificationTemplate = require('../models/NotificationTemplate');
const TemplateEngine = require('./TemplateEngine');

const FROM = process.env.EMAIL_FROM || 'noreply@voyra.rs';

/** SMTP je podesen tek kad ima i host i korisnika. */
const smtpKonfigurisan = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

/**
 * Slanje email notifikacija.
 *
 * Bez SMTP podataka radi u simulaciji - ispisuje poruku u log i vraca
 * lazni messageId. Kod se ne menja kada kredencijali stignu; samo se
 * dopuni .env.
 */
class EmailService {
  constructor() {
    this.engine = new TemplateEngine();
    this.transporter = null;
  }

  _transporter() {
    if (this.transporter) return this.transporter;

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    return this.transporter;
  }

  async getTemplate(name) {
    const sablon = await NotificationTemplate.findOne({ name, type: 'email' });

    if (!sablon) {
      const e = new Error(`Template not found: ${name}`);
      e.code = 'TEMPLATE_NOT_FOUND';
      e.statusCode = 400;
      throw e;
    }

    return sablon;
  }

  /**
   * Sastavlja naslov poruke.
   *
   * Email se salje kao OBICAN TEKST (`text:`, ne `html:`), pa HTML escape
   * nema svrhu - samo bi ostavio `&gt;` i `&amp;` u poruci koju korisnik
   * cita. Stvarni rizik kod plain-text mejla je injekcija u zaglavlje:
   * prelom reda u naslovu bi zatvorio `Subject:` i ono posle njega bi
   * postalo novo zaglavlje (na primer `Bcc:`). Zato se prelomi uklanjaju.
   *
   * Izdvojeno iz `send` da se moze proveriti bez baze.
   */
  naslov(sablonSubject, podaci = {}) {
    return this.engine
      .interpolate(sablonSubject, podaci, false)
      .replace(/[\r\n]+/g, ' ')
      .trim();
  }

  /**
   * Sastavlja i salje email. Vraca { externalId, simulated }.
   */
  async send(notification) {
    const sablon = await this.getTemplate(notification.templateName);
    const podaci = notification.templateData || {};

    const subject = this.naslov(sablon.subject, podaci);

    const body = this.engine.interpolate(sablon.bodyTemplate, podaci, false);

    // Sastavljen tekst se pamti, da se u pregledu vidi sta je poslato
    notification.subject = subject;
    notification.body = body;

    const primalac = notification.recipient?.email;

    if (!primalac) {
      const e = new Error('Primalac nema email adresu');
      e.code = 'NO_RECIPIENT';
      e.statusCode = 400;
      throw e;
    }

    const prilog = notification.attachment?.content
      ? [
          {
            filename: notification.attachment.filename || 'prilog.pdf',
            content: notification.attachment.content,
            contentType: notification.attachment.contentType || 'application/pdf'
          }
        ]
      : [];

    if (!smtpKonfigurisan()) {
      const externalId = `sim_${crypto.randomBytes(6).toString('hex')}`;

      console.log(`[EMAIL_SENT] -> ${primalac}`);
      console.log(`             naslov: ${subject}`);
      if (prilog.length) {
        console.log(`             prilog: ${prilog[0].filename} (${prilog[0].content.length} B)`);
      }

      return { externalId, simulated: true };
    }

    const info = await this._transporter().sendMail({
      from: FROM,
      to: primalac,
      subject,
      text: body,
      attachments: prilog
    });

    console.log(`[EMAIL_SENT] -> ${primalac} (${info.messageId})`);

    return { externalId: info.messageId, simulated: false };
  }
}

module.exports = EmailService;
