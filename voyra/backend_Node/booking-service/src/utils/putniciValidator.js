/**
 * Validacija podataka o putnicima PRE poziva izvora (spec §4.8 t.3).
 *
 * Pravila su preuzeta iz zvanicne Duffel dokumentacije, "Create an order"
 * (https://duffel.com/docs/api/v2/orders/create-order), polja
 * `passengers.*`:
 *
 *   title       - obavezno; "mr" | "ms" | "mrs" | "miss" | "dr"
 *                 (uz napomenu da `dr` neke kompanije ne podrzavaju)
 *   gender      - obavezno; "m" | "f"
 *   given_name  - obavezno; dozvoljeni su razmak, `-`, `'` i slova iz
 *   family_name   ASCII, Latin-1 Supplement i Latin Extended-A skupova
 *                 (bez Æ, æ, Ĳ, ĳ, Œ, œ, Þ, ð); najmanje 2 znaka po
 *                 preporuci, a ime i prezime ZAJEDNO najvise 40 znakova
 *   born_on     - datum rodjenja
 *   phone_number- obavezno, E.164
 *
 * Vazna posledica: srpska slova (č, ć, ž, š, đ) SU u Latin Extended-A,
 * pa su dozvoljena. Cirilica nije. Zato poruka trazi latinicu, a ne
 * "bez dijakritike".
 */

const TITULE = ['mr', 'ms', 'mrs', 'miss', 'dr'];
const POLOVI = ['m', 'f'];

/** Najvise 40 znakova za ime i prezime zajedno (Duffel). */
const MAX_IME_PREZIME = 40;
const MIN_DEO_IMENA = 2;

/**
 * Dozvoljeni znakovi u imenu.
 *
 * ASCII slova, Latin-1 Supplement (U+00C0-U+00FF) i Latin Extended-A
 * (U+0100-U+017F), plus razmak, crtica i apostrof. Izuzeci koje Duffel
 * navodi se uklanjaju posebno, jer su rasuti po ta dva skupa.
 */
const DOZVOLJENI_ZNAKOVI = /^[A-Za-zÀ-ÿĀ-ſ '-]+$/;
const IZUZECI = /[ÆæĲĳŒœÞð]/;

/** E.164: + i 8-15 cifara; isto pravilo kao u user-service. */
const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Koliko je putniku godina na zadati datum. */
const godineNa = (bornOn, datum) => {
  const rodjen = new Date(`${bornOn}T00:00:00Z`);
  const kada = new Date(`${String(datum).slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(rodjen.getTime()) || Number.isNaN(kada.getTime())) return null;

  let godina = kada.getUTCFullYear() - rodjen.getUTCFullYear();
  const mesec = kada.getUTCMonth() - rodjen.getUTCMonth();

  if (mesec < 0 || (mesec === 0 && kada.getUTCDate() < rodjen.getUTCDate())) godina -= 1;

  return godina;
};

const proveriIme = (vrednost, oznaka, greske, prefiks) => {
  const tekst = String(vrednost || '').trim();

  if (!tekst) {
    greske.push(`${prefiks}: ${oznaka} je obavezno`);
    return '';
  }

  if (tekst.length < MIN_DEO_IMENA) {
    greske.push(`${prefiks}: ${oznaka} mora imati bar ${MIN_DEO_IMENA} znaka`);
  }

  if (!DOZVOLJENI_ZNAKOVI.test(tekst) || IZUZECI.test(tekst)) {
    greske.push(
      `${prefiks}: ${oznaka} unesite latinicom, kao u pasošu ` +
        '(dozvoljena su slova, razmak, crtica i apostrof)'
    );
  }

  return tekst;
};

/**
 * @param {Array} putnici
 * @param {object} p - { brojPutnika, datumPovratka }
 * @returns {string[]} sve greške odjednom; prazna lista znači ispravno
 */
const validirajPutnike = (putnici, { brojPutnika, datumPovratka } = {}) => {
  const greske = [];

  if (!Array.isArray(putnici) || putnici.length === 0) {
    return ['Obavezni su podaci o putnicima'];
  }

  if (Number.isFinite(brojPutnika) && putnici.length !== brojPutnika) {
    greske.push(
      `Putovanje ima ${brojPutnika} ${brojPutnika === 1 ? 'putnika' : 'putnika'}, ` +
        `a poslato je ${putnici.length}`
    );
  }

  putnici.forEach((p, i) => {
    const prefiks = `Putnik ${i + 1}`;

    const titula = String(p?.title || '').toLowerCase();
    if (!titula) greske.push(`${prefiks}: titula je obavezna`);
    else if (!TITULE.includes(titula)) {
      greske.push(`${prefiks}: titula mora biti jedna od: ${TITULE.join(', ')}`);
    }

    const ime = proveriIme(p?.givenName ?? p?.given_name, 'ime', greske, prefiks);
    const prezime = proveriIme(p?.familyName ?? p?.family_name, 'prezime', greske, prefiks);

    if (ime && prezime && `${ime}${prezime}`.length > MAX_IME_PREZIME) {
      greske.push(
        `${prefiks}: ime i prezime zajedno smeju imati najviše ${MAX_IME_PREZIME} znakova`
      );
    }

    // Bez podrazumevane vrednosti: pogrešan pol na karti je stvaran problem
    const pol = String(p?.gender || '').toLowerCase();
    if (!pol) greske.push(`${prefiks}: pol je obavezan`);
    else if (!POLOVI.includes(pol)) greske.push(`${prefiks}: pol mora biti "m" ili "f"`);

    const rodjen = String(p?.bornOn ?? p?.born_on ?? '').slice(0, 10);

    if (!rodjen) {
      greske.push(`${prefiks}: datum rođenja je obavezan`);
    } else if (!DATUM.test(rodjen) || Number.isNaN(new Date(rodjen).getTime())) {
      greske.push(`${prefiks}: datum rođenja mora biti oblika GGGG-MM-DD`);
    } else if (new Date(`${rodjen}T00:00:00Z`) >= new Date()) {
      greske.push(`${prefiks}: datum rođenja mora biti u prošlosti`);
    } else if (datumPovratka) {
      const godine = godineNa(rodjen, datumPovratka);

      // Pretraga je radjena za odrasle putnike (`type: adult`), pa
      // maloletnik ne sme da se posalje kao odrasla osoba
      if (godine !== null && godine < 18) {
        greske.push(
          `${prefiks}: rezervacija dece nije podržana u ovoj verziji — ` +
            'pretraga je rađena za odrasle putnike'
        );
      }
    }

    const email = String(p?.email || '').trim();
    if (!email) greske.push(`${prefiks}: email je obavezan`);
    else if (!EMAIL.test(email)) greske.push(`${prefiks}: email nije ispravan`);

    const telefon = String(p?.phoneNumber ?? p?.phone_number ?? '').trim();
    if (!telefon) greske.push(`${prefiks}: telefon je obavezan`);
    else if (!E164.test(telefon)) {
      greske.push(`${prefiks}: telefon mora biti u obliku +381641234567`);
    }
  });

  return greske;
};

module.exports = {
  validirajPutnike,
  godineNa,
  TITULE,
  POLOVI,
  MAX_IME_PREZIME,
  DOZVOLJENI_ZNAKOVI,
  E164
};
