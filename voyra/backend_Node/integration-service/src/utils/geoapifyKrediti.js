/**
 * BROJANJE DNEVNOG LIMITA GEOAPIFY-A.
 *
 * Besplatni plan daje **3 000 kredita dnevno**, a po dokumentaciji
 * "every 20 places costing 1 credit" - jedan Places poziv sa `limit=60`
 * tako trosi 3 kredita.
 *
 * Brojac stoji u memoriji procesa i resetuje se svakog dana. To je
 * dovoljno: cilj nije precizno knjigovodstvo (pravo stanje zna Geoapify),
 * nego upozorenje u logu pre nego sto pozivi pocnu da se odbijaju. Posle
 * restarta servisa brojac krece od nule, sto je pesimisticnije po nas -
 * moze da propusti upozorenje, ali nikada nece lazno da ga digne.
 */

/** Koliko mesta stane u jedan kredit (Geoapify dokumentacija). */
const MESTA_PO_KREDITU = 20;

const DNEVNI_LIMIT = parseInt(process.env.GEOAPIFY_DAILY_CREDITS, 10) || 3000;

/** Iznad ovog udela dnevnog limita ide upozorenje u log. */
const PRAG_UPOZORENJA = 0.8;

let stanje = { datum: null, krediti: 0, poziva: 0, upozoreno: false };

const danas = () => new Date().toISOString().slice(0, 10);

const resetujAkoTreba = () => {
  const d = danas();

  if (stanje.datum !== d) stanje = { datum: d, krediti: 0, poziva: 0, upozoreno: false };
};

/** Koliko kredita trosi poziv koji trazi `limit` mesta. */
const kreditiZa = (limit) => Math.max(1, Math.ceil((Number(limit) || 1) / MESTA_PO_KREDITU));

/**
 * Belezi jedan Places poziv.
 *
 * @param {number} limit - vrednost parametra `limit` u pozivu
 * @returns {{krediti: number, poziva: number, udeo: number}}
 */
const zabelezi = (limit) => {
  resetujAkoTreba();

  stanje.krediti += kreditiZa(limit);
  stanje.poziva += 1;

  const udeo = stanje.krediti / DNEVNI_LIMIT;

  // Upozorenje ide jednom dnevno, da ne zatrpa log
  if (udeo >= PRAG_UPOZORENJA && !stanje.upozoreno) {
    stanje.upozoreno = true;
    console.warn(
      `[GEOAPIFY] Potroseno ${stanje.krediti} od ${DNEVNI_LIMIT} dnevnih kredita ` +
        `(${Math.round(udeo * 100)} %) u ${stanje.poziva} poziva - ` +
        'iznad limita Geoapify odbija zahteve, pa plan prelazi na rezervni izvor'
    );
  }

  return { krediti: stanje.krediti, poziva: stanje.poziva, udeo };
};

/** Trenutno stanje - cita ga `/cache/stats`. */
const stanjeKredita = () => {
  resetujAkoTreba();

  return {
    datum: stanje.datum,
    krediti: stanje.krediti,
    poziva: stanje.poziva,
    limit: DNEVNI_LIMIT,
    udeo: Math.round((stanje.krediti / DNEVNI_LIMIT) * 1000) / 1000
  };
};

/** Samo za testove. */
const ocisti = () => {
  stanje = { datum: null, krediti: 0, poziva: 0, upozoreno: false };
};

module.exports = {
  zabelezi,
  stanjeKredita,
  kreditiZa,
  ocisti,
  MESTA_PO_KREDITU,
  DNEVNI_LIMIT,
  PRAG_UPOZORENJA
};
