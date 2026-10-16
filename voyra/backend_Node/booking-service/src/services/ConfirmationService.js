const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const DIR = path.resolve(__dirname, '../../', process.env.CONFIRMATION_DIR || './confirmations');
const EMAIL_SIMULACIJA = process.env.EMAIL_SIMULATION_MODE !== 'false';

/**
 * Generisanje PDF potvrda i slanje email obavestenja.
 *
 * Email je trenutno SIMULACIJA - ispisuje se u log umesto da se salje.
 * Za pravo slanje treba nodemailer + SMTP podaci u .env (SMTP_HOST itd).
 */
class ConfirmationService {
  constructor() {
    if (!fs.existsSync(DIR)) {
      fs.mkdirSync(DIR, { recursive: true });
    }
  }

  _datum(v) {
    return v ? new Date(v).toISOString().split('T')[0] : '-';
  }

  /**
   * 2027-05-10T06:00:00 -> 10.05.2027. 06:00
   *
   * Vreme leta je lokalno vreme aerodroma, pa se cita tekstualno - inace
   * bi potvrda zavisila od vremenske zone servera koji je pravi.
   */
  _vreme(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return '-';

    return `${m[3]}.${m[2]}.${m[1]}. ${m[4]}:${m[5]}`;
  }

  _presedanja(broj) {
    if (!broj) return 'direktan let';
    return broj === 1 ? '1 presedanje' : `${broj} presedanja`;
  }

  /**
   * Pravi PDF potvrdu rezervacije. Vraca putanju do fajla.
   */
  async generatePdf(booking) {
    const imeFajla = `${booking.bookingId}.pdf`;
    const putanja = path.join(DIR, imeFajla);

    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const izlaz = fs.createWriteStream(putanja);

      doc.pipe(izlaz);
      izlaz.on('finish', resolve);
      izlaz.on('error', reject);

      // Zaglavlje
      doc.fontSize(24).text('VOYRA', { align: 'center' });
      doc.fontSize(12).fillColor('#666').text('Potvrda rezervacije', { align: 'center' });
      doc.moveDown(1.5).fillColor('#000');

      doc.fontSize(11);
      doc.text(`Broj rezervacije:  ${booking.bookingId}`);
      doc.text(`Status:            ${booking.status}`);
      doc.text(`Datum izdavanja:   ${this._datum(new Date())}`);
      doc.moveDown();

      // Letovi
      if (booking.flights?.length) {
        doc.fontSize(14).text('LETOVI');
        doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
        doc.moveDown(0.5).fontSize(10);

        booking.flights.forEach((f) => {
          doc.text(`${f.from} -> ${f.to}   ${f.airline || ''}`);
          doc.text(`  Kod rezervacije: ${f.bookingReference || '-'}    Status: ${f.status}`);

          if (f.outbound) {
            doc.text(
              `  Odlazak:  ${this._vreme(f.outbound.departure)} - ${this._vreme(f.outbound.arrival)}` +
              `   (${this._presedanja(f.outbound.stops)})`
            );
          }

          if (f.inbound) {
            doc.text(
              `  Povratak: ${this._vreme(f.inbound.departure)} - ${this._vreme(f.inbound.arrival)}` +
              `   (${this._presedanja(f.inbound.stops)})`
            );
          }

          doc.text(`  Cena: ${f.price} ${f.currency}`);
          doc.moveDown(0.5);
        });

        doc.moveDown(0.5);
      }

      // Putnici
      if (booking.passengers?.length) {
        doc.fontSize(14).text('PUTNICI');
        doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
        doc.moveDown(0.5).fontSize(10);

        booking.passengers.forEach((p, i) => {
          doc.text(`${i + 1}. ${p.givenName} ${p.familyName}${p.bornOn ? `  (${p.bornOn})` : ''}`);
        });

        doc.moveDown();
      }

      // Smestaj se ne rezervise kroz aplikaciju (spec §4.4), pa ga
      // potvrda ni ne sadrzi - vazi samo za let

      doc.fontSize(13).text(`UKUPNO: ${booking.totalPrice} ${booking.currency}`, { align: 'right' });

      doc.moveDown(2).fontSize(8).fillColor('#888');
      doc.text('Voyra - diplomski rad. Dokument je generisan automatski.', { align: 'center' });

      doc.end();
    });

    console.log(`[CONFIRMATION] PDF generisan: ${putanja}`);

    return { putanja, imeFajla, url: `/api/bookings/${booking.bookingId}/confirmation` };
  }

  /**
   * Salje potvrdu na email. Trenutno simulacija - ispis u log.
   */
  async sendEmail(booking, email, tip = 'CONFIRMATION') {
    if (!email) {
      console.warn(`[CONFIRMATION] Nema email adrese za ${booking.bookingId}`);
      return { sent: false, reason: 'Nema email adrese' };
    }

    const naslov =
      tip === 'CANCELLATION'
        ? `Voyra - otkazana rezervacija ${booking.bookingId}`
        : `Voyra - potvrda rezervacije ${booking.bookingId}`;

    if (EMAIL_SIMULACIJA) {
      console.log(`[CONFIRMATION] (simulacija email) -> ${email}`);
      console.log(`               naslov: ${naslov}`);
      console.log(`               status: ${booking.status}, ukupno: ${booking.totalPrice} ${booking.currency}`);

      return { sent: true, simulated: true, to: email, subject: naslov };
    }

    // Pravo slanje bi islo ovde (nodemailer + SMTP iz .env)
    console.warn('[CONFIRMATION] Slanje email-a nije konfigurisano');
    return { sent: false, reason: 'SMTP nije konfigurisan' };
  }

  /** Putanja do vec generisanog PDF-a, ako postoji. */
  putanjaPdf(bookingId) {
    const p = path.join(DIR, `${bookingId}.pdf`);
    return fs.existsSync(p) ? p : null;
  }
}

module.exports = ConfirmationService;
