/**
 * Booking.com link za rezervaciju smestaja.
 *
 * Specifikacija §4.4: aplikacija NE rezervise smestaj, nego korisnika
 * preusmerava na Booking.com sa vec popunjenim gradom, datumima i brojem
 * gostiju. Ovo je obican link ka javnoj pretrazi - ne koristi se nijedan
 * Booking.com API niti kljuc.
 */
const BOOKING_PRETRAGA = 'https://www.booking.com/searchresults.html';

/**
 * @param {object} p
 * @param {string} p.city     naziv grada (npr. "Athens")
 * @param {string} p.checkIn  YYYY-MM-DD
 * @param {string} p.checkOut YYYY-MM-DD
 * @param {number} p.guests   broj odraslih gostiju
 * @param {string} [p.hotelName] naziv objekta - suzava pretragu na njega
 * @returns {string|null} null kada nema dovoljno podataka za smislen link
 */
const bookingUrl = ({ city, checkIn, checkOut, guests = 1, hotelName } = {}) => {
  if (!city && !hotelName) return null;

  // Naziv objekta je precizniji pojam od grada, pa ima prednost
  const pojam = hotelName ? `${hotelName} ${city || ''}`.trim() : city;

  const params = new URLSearchParams({
    ss: pojam,
    group_adults: String(Math.max(1, parseInt(guests, 10) || 1)),
    no_rooms: '1',
    group_children: '0'
  });

  if (checkIn) params.set('checkin', String(checkIn).slice(0, 10));
  if (checkOut) params.set('checkout', String(checkOut).slice(0, 10));

  return `${BOOKING_PRETRAGA}?${params.toString()}`;
};

module.exports = { bookingUrl };
