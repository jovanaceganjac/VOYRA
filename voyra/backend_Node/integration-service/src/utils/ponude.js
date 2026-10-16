/**
 * Koliko ponuda mora da vazi da bi zapis iz kesa jos imao smisla.
 *
 * Duffel ponuda vazi 20-30 minuta, a kes letova 15. Ako ponuda istice za
 * manje od dva minuta, korisnik je prakticno ne moze iskoristiti: dok
 * prodje kroz proveru cene i unos putnika, vec je nestala. Zato se takav
 * zapis ne koristi, nego se radi nova pretraga.
 */
const MIN_PREOSTALO_MS =
  (parseInt(process.env.OFFER_MIN_VALID_SECONDS, 10) || 120) * 1000;

/**
 * Da li su SVE ponude u zapisu dovoljno "sveze".
 * Ponuda bez roka se racuna kao vazeca - mock podaci ga nemaju uvek.
 */
const ponudeSuUpotrebljive = (ponude) => {
  if (!Array.isArray(ponude) || ponude.length === 0) return true;

  const granica = Date.now() + MIN_PREOSTALO_MS;

  return ponude.every((p) => {
    if (!p?.expiresAt) return true;

    const istice = new Date(p.expiresAt).getTime();

    return Number.isNaN(istice) ? true : istice > granica;
  });
};

/** `?refresh=true` iz upita; vrednost stize kao tekst. */
const jeTacno = (v) => v === true || String(v).toLowerCase() === 'true';

module.exports = { ponudeSuUpotrebljive, jeTacno, MIN_PREOSTALO_MS };
