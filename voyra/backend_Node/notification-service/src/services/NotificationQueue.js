const Notification = require('../models/Notification');

const INTERVAL = parseInt(process.env.QUEUE_INTERVAL_MS, 10) || 5000;
const BACKOFF = parseInt(process.env.RETRY_BACKOFF_MS, 10) || 300000;

// Ako worker padne usred slanja, zakljucan zapis se posle ovoga oslobadja
const LOCK_TIMEOUT_MS = 60000;

/**
 * Red notifikacija zasnovan na MongoDB-u (bez Redis-a i RabbitMQ-a).
 *
 * Worker se budi na svakih 5 sekundi, uzima PENDING notifikacije kojima
 * je vreme doslo i salje ih. Neuspeh se ponavlja do 3 puta sa
 * eksponencijalnim razmakom.
 */
class NotificationQueue {
  constructor(notificationService) {
    this.service = notificationService;
    this.timer = null;
    this.uToku = false;
    this.obradjeno = 0;
  }

  /**
   * Preuzima jednu notifikaciju iz reda.
   *
   * findOneAndUpdate je atomican - dva workera ne mogu da uzmu isti
   * zapis, jer prvi odmah postavi `lockedAt`.
   */
  async _uzmiSledecu() {
    const sada = new Date();
    const zastareoLock = new Date(Date.now() - LOCK_TIMEOUT_MS);

    return Notification.findOneAndUpdate(
      {
        status: 'PENDING',
        $and: [
          { $or: [{ scheduledFor: null }, { scheduledFor: { $lte: sada } }] },
          { $or: [{ lockedAt: null }, { lockedAt: { $lte: zastareoLock } }] }
        ]
      },
      { $set: { lockedAt: sada } },
      { sort: { createdAt: 1 }, new: true }
    );
  }

  /** Razmak pre sledeceg pokusaja raste: 1x, 2x, 4x... */
  _backoff(retryCount) {
    return BACKOFF * Math.pow(2, Math.max(0, retryCount));
  }

  /**
   * Jedan prolaz kroz red. Vraca broj obradjenih notifikacija.
   */
  async process() {
    if (this.uToku) return 0;
    this.uToku = true;

    let brojac = 0;

    try {
      let notification = await this._uzmiSledecu();

      while (notification) {
        try {
          await this.service.posalji(notification);
          console.log(`[QUEUE] SENT ${notification._id} (${notification.type})`);
        } catch (err) {
          const { willRetry } = await this.service.zabeleziNeuspeh(
            notification,
            err,
            this._backoff(notification.retryCount)
          );

          console.warn(
            `[QUEUE] ${willRetry ? 'RETRY' : 'FAILED'} ${notification._id}: ${err.message}` +
            ` (pokusaj ${notification.retryCount}/${notification.maxRetries})`
          );
        }

        brojac++;
        this.obradjeno++;
        notification = await this._uzmiSledecu();
      }
    } catch (err) {
      console.error('[QUEUE] Greska u obradi:', err.message);
    } finally {
      this.uToku = false;
    }

    return brojac;
  }

  start() {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.process().catch((e) => console.error('[QUEUE]', e.message));
    }, INTERVAL);

    console.log(`[QUEUE] Worker pokrenut (na svakih ${INTERVAL} ms, ${BACKOFF} ms izmedju pokusaja)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[QUEUE] Worker zaustavljen');
    }
  }
}

module.exports = NotificationQueue;
