/**
 * Opis ODREDISTA koji Planner dobija od orchestratora.
 *
 * Ranije je Planner iz IATA koda pogadjao naziv grada preko rucno
 * napisanog spiska (`cityCodes.js`). Od sada orchestrator salje ceo opis
 * iz sopstvene baze gradova - naziv, drzavu i KOORDINATE - pa se nista
 * ne pogadja. Time nestaje i klasa gresaka tipa "Athens u Dzordziji".
 *
 * Oblik:
 *   { id, naziv, nazivEn, drzava, lat, lon,
 *     aerodrom: { iata, udaljenostKm } }
 */

/** Opis odredista iz tela zahteva; `to` ostaje kao rezerva. */
const procitajOdrediste = (telo = {}) => {
  const d = telo.destination || telo.odrediste || null;

  if (d && (d.naziv || d.nazivEn)) {
    return {
      id: d.id || null,
      naziv: d.naziv || d.nazivEn,
      nazivEn: d.nazivEn || d.naziv,
      drzava: (d.drzava || '').toUpperCase() || null,
      lat: Number.isFinite(Number(d.lat)) ? Number(d.lat) : null,
      lon: Number.isFinite(Number(d.lon)) ? Number(d.lon) : null,
      aerodrom: d.aerodrom || null,
      aerodromi: Array.isArray(d.aerodromi) ? d.aerodromi : d.aerodrom ? [d.aerodrom] : []
    };
  }

  /*
   * Rezerva: stari zahtevi koji salju samo IATA kod. Tada se kao naziv
   * grada koristi sam kod - spoljni izvori ga uglavnom prepoznaju, a
   * orchestrator ionako uvek salje pun opis.
   */
  const kod = String(telo.to || '').toUpperCase();

  return kod
    ? {
        id: null,
        naziv: kod,
        nazivEn: kod,
        drzava: null,
        lat: null,
        lon: null,
        aerodrom: null,
        aerodromi: []
      }
    : null;
};

/**
 * Aerodrom na kom se STVARNO slece.
 *
 * Grad sa kodom grada (Istanbul IST, London LON) trazi let preko svih
 * svojih aerodroma odjednom, pa se do izbora ponude ne zna gde se slece:
 * za Istanbul je najblizi SAW (33 km), ali ponuda moze da bude za IST
 * (34 km). Transfer i upozorenje moraju da prate izabranu ponudu, inace
 * bi plan pisao jedan aerodrom, a karta glasila na drugi.
 *
 * Bez leta ostaje najblizi aerodrom - to je i procena koju korisnik vidi
 * pre izbora.
 */
const aerodromDolaska = (odrediste, let_ = null) => {
  if (!odrediste) return null;

  const lista = odrediste.aerodromi?.length
    ? odrediste.aerodromi
    : odrediste.aerodrom
      ? [odrediste.aerodrom]
      : [];

  if (lista.length === 0) return null;

  const segmenti = let_?.outbound?.segments || [];
  const kod = String(segmenti[segmenti.length - 1]?.to || let_?.to || '').toUpperCase();

  return lista.find((a) => String(a.iata).toUpperCase() === kod) || odrediste.aerodrom || lista[0];
};

/** Isto, za POLAZISTE - koristi se samo za koordinate u demo letovima. */
const procitajPolaziste = (telo = {}) => {
  const o = telo.origin || telo.polaziste || null;

  if (!o) return null;

  return {
    id: o.id || null,
    naziv: o.naziv || o.nazivEn || null,
    drzava: (o.drzava || '').toUpperCase() || null,
    lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : null,
    lon: Number.isFinite(Number(o.lon)) ? Number(o.lon) : null
  };
};

/** Sta se salje Integration Service-u za smestaj i atrakcije. */
const zaIzvor = (odrediste, dodatno = {}) => ({
  city: odrediste?.nazivEn || odrediste?.naziv || null,
  countryCode: odrediste?.drzava || undefined,
  lat: odrediste?.lat ?? undefined,
  lon: odrediste?.lon ?? undefined,
  ...dodatno
});

module.exports = { procitajOdrediste, procitajPolaziste, zaIzvor, aerodromDolaska };
