const axios = require('axios');

const Notification = require('../models/Notification');
const NotificationLog = require('../models/NotificationLog');
const NotificationTemplate = require('../models/NotificationTemplate');
const EmailService = require('./EmailService');
const SMSService = require('./SMSService');
const TemplateEngine = require('./TemplateEngine');
const PODRAZUMEVANI_SABLONI = require('../templates/defaults');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:4001';
const TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS, 10) || 10000;

const TTL_SENT_DANA = parseInt(process.env.TTL_SENT_DAYS, 10) || 7;
const TTL_FAILED_DANA = parseInt(process.env.TTL_FAILED_DAYS, 10) || 30;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3;

/** Koji tip notifikacije koristi koji sablon i kanal. */
const MAPA_TIPOVA = {
  BOOKING_CONFIRMED: { template: 'booking-confirmed', channel: 'email' },
  BOOKING_FAILED: { template: 'booking-failed', channel: 'email' },
  BOOKING_CANCELLED: { template: 'booking-cancelled', channel: 'email' },
  TRIP_SAVED: { template: 'trip-saved', channel: 'email' },
  TRIP_DELETED: { template: 'trip-deleted', channel: 'email' },
  REGISTRATION_APPROVED: { template: 'registration-approved', channel: 'email' },
  REGISTRATION_REJECTED: { template: 'registration-rejected', channel: 'email' },
  ACCOUNT_BLOCKED: { template: 'account-blocked', channel: 'email' },
  ACCOUNT_UNBLOCKED: { template: 'account-unblocked', channel: 'email' },
  PASSWORD_CHANGED: { template: 'password-changed', channel: 'email' },
  ADMIN_ACTION: { template: 'admin-action', channel: 'email' }
};

/**
 * Sabloni koji su nekada postojali, a vise se ne koriste.
 *
 * Placanje je uklonjeno (aplikacija ne naplacuje), pa su ova
 * dva sablona ostala bez posiljaoca; brisu se iz baze pri pokretanju.
 */
const UKLONJENI_SABLONI = ['payment-failed', 'payment-refunded'];

class NotificationService {
  constructor() {
    this.email = new EmailService();
    this.sms = new SMSService();
    this.engine = new TemplateEngine();
  }

  _greska(poruka, code, statusCode) {
    const e = new Error(poruka);
    e.code = code;
    e.statusCode = statusCode;
    return e;
  }

  /** Upisuje podrazumevane sablone pri pokretanju, ako ih nema. */
  async seedTemplates() {
    let dodato = 0;

    for (const s of PODRAZUMEVANI_SABLONI) {
      const postoji = await NotificationTemplate.findOne({ name: s.name });
      if (!postoji) {
        await NotificationTemplate.create(s);
        dodato++;
      }
    }

    /*
     * Sabloni se cuvaju u bazi da bi mogli da se menjaju bez novog
     * deploy-a, pa uklonjeni sabloni moraju i odavde da nestanu - inace
     * bi `payment-failed` zauvek ostao u bazi posle brisanja iz koda.
     */
    const obrisano = await NotificationTemplate.deleteMany({
      name: { $in: UKLONJENI_SABLONI }
    });

    const ukupno = await NotificationTemplate.countDocuments();

    console.log(
      `[NOTIFICATION_SERVICE] Sabloni: ${ukupno} ukupno (${dodato} novih` +
        `${obrisano.deletedCount ? `, ${obrisano.deletedCount} uklonjenih` : ''})`
    );
  }

  /**
   * Pronalazi email i telefon primaoca.
   * Prvo se koristi ono sto je pozivalac poslao; ako nije, pita se
   * User Service (pozivaoci kao Booking Service cesto vec imaju email).
   */
  async _razresiPrimaoca(userId, recipient) {
    // Za SMS uvek treba stanje telefona iz User Service-a (opt-in,
    // potvrda), pa se prosledjeni recipient koristi samo za email.
    if (recipient?.email && !recipient?.trazimTelefon) {
      return {
        userId,
        email: recipient.email,
        phone: recipient.phone,
        firstName: recipient.firstName
      };
    }

    try {
      const r = await axios.get(`${USER_SERVICE_URL}/api/users/internal/${userId}`, {
        headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY },
        timeout: TIMEOUT
      });

      const u = r.data.data;

      return {
        userId,
        email: u.email,
        phone: u.phone?.number,
        smsOptIn: u.phone?.smsOptIn !== false,
        firstName: u.ime
      };
    } catch (err) {
      console.warn(`[NOTIFICATION_SERVICE] Ne mogu da nadjem korisnika ${userId}: ${err.message}`);
      return { userId };
    }
  }

  /**
   * FAZA 1: prima zahtev, pravi Notification sa statusom PENDING.
   * Worker ga kasnije preuzima iz reda.
   */
  async send({ type, userId, recipient, templateData = {}, attachment = null, scheduledFor = null, metadata = {} }) {
    if (!userId) {
      throw this._greska('userId required', 'VALIDATION_ERROR', 400);
    }

    const mapa = MAPA_TIPOVA[type];
    if (!mapa) {
      throw this._greska(`Nepoznat tip notifikacije: ${type}`, 'VALIDATION_ERROR', 400);
    }

    // Sablon mora da postoji pre nego sto se notifikacija prihvati -
    // inace bi zahtev vratio 201, a tek worker bi otkrio gresku.
    const sablon = await NotificationTemplate.findOne({
      name: mapa.template,
      type: mapa.channel
    });

    if (!sablon) {
      throw this._greska(`Template not found: ${mapa.template}`, 'TEMPLATE_NOT_FOUND', 400);
    }

    const primalac = await this._razresiPrimaoca(
      userId,
      mapa.channel === 'sms' ? { ...recipient, trazimTelefon: true } : recipient
    );

    // SMS ima dodatna pravila: korisnik mora da ga zeli i da ima broj
    let pocetniStatus = 'PENDING';
    let razlogPauze;
    const zakazanoZa = scheduledFor ? new Date(scheduledFor) : null;

    if (mapa.channel === 'sms') {
      if (primalac.smsOptIn === false) {
        pocetniStatus = 'CANCELLED';
        razlogPauze = 'User opt-out';
      } else if (!primalac.phone) {
        pocetniStatus = 'CANCELLED';
        razlogPauze = 'Nalog nema broj telefona';
      }
    }

    // Ako sablon trazi ime, a nije poslato, uzmi ga iz korisnickog naloga
    const podaci = { firstName: primalac.firstName, ...templateData };

    // Ista notifikacija za isti dogadjaj se ne salje dvaput
    const dedupeKey = metadata?.bookingId
      ? `${userId}:${type}:${metadata.bookingId}`
      : undefined;

    if (dedupeKey) {
      const postojeca = await Notification.findOne({ dedupeKey });
      if (postojeca) {
        console.log(`[NOTIFICATION_SERVICE] Duplikat preskocen: ${dedupeKey}`);
        return { notification: postojeca, duplicate: true };
      }
    }

    const pripremljenPrilog = attachment?.content
      ? {
          filename: attachment.filename || 'prilog.pdf',
          // Prilog stize kao base64 u JSON-u, cuva se kao binarni sadrzaj
          content: Buffer.isBuffer(attachment.content)
            ? attachment.content
            : Buffer.from(attachment.content, 'base64'),
          contentType: attachment.contentType || 'application/pdf'
        }
      : undefined;

    try {
      const notification = await Notification.create({
        type,
        channel: mapa.channel,
        recipient: { userId, email: primalac.email, phone: primalac.phone },
        templateName: mapa.template,
        templateData: podaci,
        attachment: pripremljenPrilog,
        status: pocetniStatus,
        failureReason: razlogPauze,
        scheduledFor: zakazanoZa,
        maxRetries: MAX_RETRIES,
        metadata,
        dedupeKey
      });

      console.log(
        `[NOTIFICATION_SERVICE] ${type} (${mapa.channel}) ${pocetniStatus}: ${notification._id}` +
        (razlogPauze ? ` - ${razlogPauze}` : '') +
        (zakazanoZa ? ` - zakazano za ${zakazanoZa.toISOString()}` : '')
      );

      return { notification, duplicate: false };
    } catch (err) {
      // Trka izmedju provere i upisa - jedinstveni indeks je poslednja odbrana
      if (err.code === 11000 && dedupeKey) {
        const postojeca = await Notification.findOne({ dedupeKey });
        return { notification: postojeca, duplicate: true };
      }
      throw err;
    }
  }

  /**
   * Stvarno slanje jedne notifikacije. Poziva ga worker.
   */
  async posalji(notification) {
    const servis = notification.channel === 'sms' ? this.sms : this.email;

    const rezultat = await servis.send(notification);

    notification.status = 'SENT';
    notification.sentAt = new Date();
    notification.failureReason = undefined;
    notification.lockedAt = undefined;
    notification.expiresAt = new Date(Date.now() + TTL_SENT_DANA * 24 * 60 * 60 * 1000);

    await notification.save();

    await NotificationLog.create({
      notificationId: String(notification._id),
      action: 'SENT',
      details: rezultat.simulated ? 'Poslato u simulaciji' : 'Poslato',
      externalId: rezultat.externalId
    });

    return rezultat;
  }

  /**
   * Neuspelo slanje: jos pokusaja -> nazad u red; iscrpljeni -> FAILED.
   */
  async zabeleziNeuspeh(notification, err, backoffMs) {
    notification.retryCount += 1;
    notification.failureReason = err.message;
    notification.lockedAt = undefined;

    const imaJos = notification.retryCount < notification.maxRetries;

    if (imaJos) {
      notification.status = 'PENDING';
      notification.scheduledFor = new Date(Date.now() + backoffMs);
    } else {
      notification.status = 'FAILED';
      notification.expiresAt = new Date(Date.now() + TTL_FAILED_DANA * 24 * 60 * 60 * 1000);
    }

    await notification.save();

    await NotificationLog.create({
      notificationId: String(notification._id),
      action: imaJos ? 'RETRIED' : 'FAILED',
      details: `Pokusaj ${notification.retryCount}/${notification.maxRetries}: ${err.message}`
    });

    return { willRetry: imaJos };
  }

  /** Notifikacija sa svojim logovima. */
  async getNotification(id, { userId, jeAdmin } = {}) {
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) {
      throw this._greska('Notifikacija nije pronadjena', 'NOT_FOUND', 404);
    }

    const notification = await Notification.findById(id);

    // Tudja notifikacija daje isti 404 kao nepostojeca
    if (!notification || (!jeAdmin && userId && notification.recipient.userId !== userId)) {
      throw this._greska('Notifikacija nije pronadjena', 'NOT_FOUND', 404);
    }

    const logs = await NotificationLog.find({ notificationId: String(id) }).sort({ timestamp: 1 });

    return { notification, logs };
  }

  /** Paginirani pregled. Bez userId (admin) vraca sve. */
  async listNotifications({ userId, status, type, from, to, page = 1, limit = 20 }) {
    const upit = {};

    if (userId) upit['recipient.userId'] = userId;
    if (status) upit.status = status;
    if (type) upit.type = type;

    if (from || to) {
      upit.createdAt = {};
      if (from) upit.createdAt.$gte = new Date(from);
      if (to) upit.createdAt.$lte = new Date(to);
    }

    const str = Math.max(1, parseInt(page, 10) || 1);
    const po = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const [total, notifications] = await Promise.all([
      Notification.countDocuments(upit),
      Notification.find(upit)
        .select('-attachment.content') // prilog moze biti megabajt, ne ide u listu
        .sort({ createdAt: -1 })
        .skip((str - 1) * po)
        .limit(po)
    ]);

    return { total, page: str, limit: po, pages: Math.ceil(total / po), notifications };
  }

  /** Statistika korisnika (ili cele instalacije ako userId nije dat). */
  async getStats(userId) {
    const upit = userId ? { 'recipient.userId': userId } : {};

    const [poStatusu, poTipu] = await Promise.all([
      Notification.aggregate([{ $match: upit }, { $group: { _id: '$status', c: { $sum: 1 } } }]),
      Notification.aggregate([{ $match: upit }, { $group: { _id: '$type', c: { $sum: 1 } } }])
    ]);

    const nadji = (s) => poStatusu.find((x) => x._id === s)?.c || 0;

    return {
      totalSent: nadji('SENT'),
      totalFailed: nadji('FAILED'),
      totalPending: nadji('PENDING'),
      totalCancelled: nadji('CANCELLED'),
      byType: poTipu.reduce((acc, x) => ({ ...acc, [x._id]: x.c }), {})
    };
  }

  /** Ponovni pokusaj slanja neuspele notifikacije. */
  async retry(id, opcije = {}) {
    const { notification } = await this.getNotification(id, opcije);

    if (notification.status !== 'FAILED') {
      throw this._greska(
        `Ponovno slanje je moguce samo za FAILED (trenutno ${notification.status})`,
        'INVALID_STATE',
        409
      );
    }

    // Rucni pokusaj podize i gornju granicu, inace bi odmah opet pao
    notification.status = 'PENDING';
    notification.maxRetries = notification.retryCount + MAX_RETRIES;
    notification.scheduledFor = null;
    notification.expiresAt = undefined;
    notification.failureReason = undefined;

    await notification.save();

    await NotificationLog.create({
      notificationId: String(notification._id),
      action: 'RETRIED',
      details: 'Rucno ponovno slanje'
    });

    return notification;
  }

  /** Otkazuje notifikaciju koja jos nije poslata. */
  async cancel(id, opcije = {}) {
    const { notification } = await this.getNotification(id, opcije);

    if (notification.status !== 'PENDING') {
      throw this._greska(
        `Otkazivanje je moguce samo za PENDING (trenutno ${notification.status})`,
        'INVALID_STATE',
        409
      );
    }

    notification.status = 'CANCELLED';
    notification.expiresAt = new Date(Date.now() + TTL_FAILED_DANA * 24 * 60 * 60 * 1000);
    await notification.save();

    await NotificationLog.create({
      notificationId: String(notification._id),
      action: 'CANCELLED',
      details: 'Otkazano pre slanja'
    });

    return notification;
  }
}

module.exports = NotificationService;
module.exports.MAPA_TIPOVA = MAPA_TIPOVA;
