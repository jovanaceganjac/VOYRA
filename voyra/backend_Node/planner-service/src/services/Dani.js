const {
  AKTIVNOSTI_PO_TEMPU,
  BRZINA_PREVOZA_DO_GRADA_KMH,
  RUCAK_MINUTA,
  RUCAK_NE_PRE,
  TRANSFER_PO_DOLASKU_MIN,
  REZERVA_PRE_POLETANJA_MIN,
  MIN_VREME_ZA_AKTIVNOST_MIN
} = require('../config/preferencije');
const { uMinute, uVreme, minutiIzIso, datumIzIso } = require('../utils/vreme');

/**
 * Raspolozivo vreme po danima putovanja (spec §6.2).
 *
 * Dan traje od `dayStart` do `dayEnd`, umanjeno za pauzu za rucak.
 * PRVI dan pocinje tek po dolasku leta (+ transfer i prijava u smestaj),
 * a POSLEDNJI se zavrsava pre nego sto treba krenuti na aerodrom.
 * Dan sa premalo vremena nema aktivnosti i nosi obrazlozenje u `note`.
 */

/**
 * Broj dana provedenih u gradu, ukljucujuci dan dolaska i dan povratka.
 *
 * checkIn 10. - checkOut 14. je 4 NOCI, ali 5 dana: putnik sleti 10. i
 * odlazi 14. Racun po nocima bi izostavio dan povratka, pa se pravilo
 * iz §6.2 (poslednji dan se zavrsava pre povratnog leta) nikada ne bi
 * ni primenilo.
 */
/**
 * Da li u prozor dana staje rucak.
 *
 * Rucak se ne racuna pre 12:30 (`RUCAK_NE_PRE`), pa dan koji se zavrsava
 * pre toga - ili posle toga nema 60 slobodnih minuta - prolazi bez njega.
 * Isto pravilo koristi i satnica u `FazaRedosled.js`, da se raspolozivo
 * vreme i stvarna satnica ne razidju.
 */
/** 135 -> "2 h 15 min"; za poruke u planu. */
const uTrajanje = (minuta) => {
  const sati = Math.floor(minuta / 60);
  const ostatak = Math.round(minuta % 60);

  if (sati === 0) return `${ostatak} min`;
  if (ostatak === 0) return `${sati} h`;

  return `${sati} h ${ostatak} min`;
};

const imaVremeZaRucak = (od, do_) => {
  const nePre = uMinute(RUCAK_NE_PRE) ?? 12 * 60 + 30;

  return do_ - Math.max(od, nePre) >= RUCAK_MINUTA;
};

const brojDana = (checkIn, checkOut) => {
  const od = new Date(checkIn);
  const do_ = new Date(checkOut);

  if (Number.isNaN(od.getTime()) || Number.isNaN(do_.getTime())) return 0;

  const noci = Math.round((do_ - od) / (1000 * 60 * 60 * 24));
  return noci > 0 ? noci + 1 : 0;
};

/** Broj nocenja - koristi ga racun cene smestaja. */
const brojNoci = (checkIn, checkOut) => Math.max(0, brojDana(checkIn, checkOut) - 1);

/**
 * @param {object} p
 * @param {string} p.checkIn
 * @param {number} p.numDays
 * @param {object} p.preferencije - { dayStart, dayEnd, pace }
 * @param {object|null} p.let_ - izabrani let (za skracivanje prvog i poslednjeg dana)
 * @returns {Array} [{ day, date, availableFrom, availableTo, availableMinutes,
 *                     targetCount, note }]
 */
/**
 * Vreme voznje od aerodroma do grada, u minutima.
 *
 * Grad bez sopstvenog aerodroma (Bled, Kotor, Brige...) trazi jos i put
 * od aerodroma do grada - to vreme se oduzima od prvog i poslednjeg dana,
 * inace bi plan pocinjao dok je putnik jos na aerodromu.
 */
const voznjaOdAerodroma = (udaljenostKm) => {
  const km = Number(udaljenostKm);

  if (!Number.isFinite(km) || km <= 0) return 0;

  return Math.round((km / BRZINA_PREVOZA_DO_GRADA_KMH) * 60);
};

/**
 * @param {object} p
 * @param {number} p.transferKm - udaljenost aerodroma od grada (0 kada je u gradu)
 */
const izracunajDane = ({ checkIn, numDays, preferencije, let_ = null, transferKm = 0 }) => {
  const pocetakDana = uMinute(preferencije.dayStart) ?? 9 * 60;
  const krajDana = uMinute(preferencije.dayEnd) ?? 20 * 60;
  const poTempu = AKTIVNOSTI_PO_TEMPU[preferencije.pace] ?? AKTIVNOSTI_PO_TEMPU.umeren;

  const start = new Date(checkIn);
  const dani = [];

  for (let i = 0; i < numDays; i++) {
    const datum = new Date(start);
    datum.setDate(datum.getDate() + i);

    let od = pocetakDana;
    let do_ = krajDana;
    let napomena = null;

    // --- Prvi dan: let sleti, pa transfer i prijava u smestaj ---
    if (i === 0 && let_?.outbound?.arrival) {
      const dolazak = minutiIzIso(let_.outbound.arrival);
      const istiDan = datumIzIso(let_.outbound.arrival) === datum.toISOString().slice(0, 10);

      if (dolazak !== null && istiDan) {
        const voznja = voznjaOdAerodroma(transferKm);
        const ukupanTransfer = TRANSFER_PO_DOLASKU_MIN + voznja;
        const spremno = dolazak + ukupanTransfer;

        if (spremno > od) {
          od = spremno;

          napomena = voznja
            ? `Dan počinje po sletanju u ${uVreme(dolazak)}, uz ${Math.round(transferKm)} km ` +
              `do grada — procenjen transfer ${uTrajanje(ukupanTransfer)}`
            : `Dan počinje po sletanju u ${uVreme(dolazak)} i ${TRANSFER_PO_DOLASKU_MIN} min ` +
              'za transfer i prijavu u smeštaj';
        }
      }
    }

    // --- Poslednji dan: polazak na aerodrom pre povratnog leta ---
    if (i === numDays - 1 && let_?.inbound?.departure) {
      const poletanje = minutiIzIso(let_.inbound.departure);
      const istiDan = datumIzIso(let_.inbound.departure) === datum.toISOString().slice(0, 10);

      if (poletanje !== null && istiDan) {
        const voznja = voznjaOdAerodroma(transferKm);
        const rezerva = REZERVA_PRE_POLETANJA_MIN + voznja;
        const kraj = poletanje - rezerva;

        if (kraj < do_) {
          do_ = kraj;

          napomena = voznja
            ? `Dan se završava ${uTrajanje(rezerva)} pre poletanja u ${uVreme(poletanje)} ` +
              `(uključen put od ${Math.round(transferKm)} km do aerodroma)`
            : `Dan se završava ${REZERVA_PRE_POLETANJA_MIN} min pre poletanja u ` +
              `${uVreme(poletanje)}`;
        }
      }
    }

    const sirovoVreme = Math.max(0, do_ - od);

    /*
     * RUCAK SE ODBIJA SAMO KADA DAN OBUHVATA VREME RUCKA.
     *
     * Ranije se odbijao kad god je prozor duzi od 60 min, pa je dan
     * 09:00-10:30 (90 min) ostajao sa 30 min i proglasavao se praznim -
     * iako u njega staje jedna kratka poseta. Pravilo je sada: dan mora
     * da ima bar `RUCAK_MINUTA` slobodnih OD `RUCAK_NE_PRE` (12:30)
     * nadalje, jer se pre toga ne rucava.
     */
    const rucak = imaVremeZaRucak(od, do_) ? RUCAK_MINUTA : 0;
    const raspolozivo = Math.max(0, sirovoVreme - rucak);

    const dovoljno = raspolozivo >= MIN_VREME_ZA_AKTIVNOST_MIN;

    /*
     * CILJNI BROJ PO DANU, SRAZMERAN RASPOLOZIVOM VREMENU (spec §6.2).
     *
     * §6.2 trazi "skracenje prvog i poslednjeg dana prema vremenu leta".
     * Ranije je svaki dan sa bar 60 minuta dobijao pun broj po tempu, pa
     * se skracenje nije ni desavalo: dan koji pocinje u 13:45 dobijao je
     * isti cilj kao pun dan od 09:00.
     *
     *   punDan = dayEnd - dayStart - rucak
     *   cilj   = round(poTempu * raspolozivo / punDan), najmanje 1
     */
    const punDan = Math.max(
      1,
      krajDana - pocetakDana - (imaVremeZaRucak(pocetakDana, krajDana) ? RUCAK_MINUTA : 0)
    );
    const srazmeran = Math.round((poTempu * raspolozivo) / punDan);
    const cilj = dovoljno ? Math.max(1, Math.min(poTempu, srazmeran)) : 0;

    if (!dovoljno && !napomena) {
      napomena = 'Nema dovoljno vremena za aktivnosti';
    } else if (!dovoljno && napomena) {
      napomena += ' — nema dovoljno vremena za aktivnosti';
    }

    dani.push({
      day: i + 1,
      date: datum.toISOString().split('T')[0],
      availableFrom: uVreme(od),
      availableTo: uVreme(do_),
      availableMinutes: raspolozivo,
      // Ciljni broj po tempu, skracen prema raspolozivom vremenu
      targetCount: cilj,
      note: napomena
    });
  }

  return dani;
};

/** Ukupan ciljni broj aktivnosti za ceo put. */
const ukupanCilj = (dani) => dani.reduce((zbir, d) => zbir + d.targetCount, 0);

/** Ukupno raspolozivo vreme za ceo put, u minutima. */
const ukupnoVreme = (dani) => dani.reduce((zbir, d) => zbir + d.availableMinutes, 0);

module.exports = {
  imaVremeZaRucak,
  voznjaOdAerodroma,
  uTrajanje,
  izracunajDane,
  brojDana,
  brojNoci,
  ukupanCilj,
  ukupnoVreme
};
