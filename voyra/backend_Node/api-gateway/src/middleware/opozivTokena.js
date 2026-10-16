const axios = require('axios');
const jwt = require('jsonwebtoken');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:4001';
const TIMEOUT = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 5000;

/**
 * Koliko dugo vazi zapamcena verzija tokena.
 *
 * KOMPROMIS: gateway ne sme da pita User Service za svaki zahtev - to bi
 * svakoj ruti dodalo mrezni poziv i bazu, a planiranje ume da napravi i
 * desetak zahteva. S druge strane, kes ne sme da bude dug, jer se
 * blokiranje odlaze za toliko.
 *
 * 30 s je izabrano tako da: blokiran korisnik izgubi pristup najkasnije
 * za pola minuta, a gateway pri normalnom radu (nekoliko zahteva u
 * sekundi po korisniku) pita User Service najvise dvaput u minutu po
 * korisniku. Vrednost se menja preko `TOKEN_VERSION_CACHE_MS`, a u
 * probama se postavlja na 0 da bi provera bila trenutna.
 */
/*
 * `0` mora da znaci „bez kesa", kako i pise iznad. Sa `|| 30_000` je nula
 * padala na podrazumevanu vrednost, pa je test stek iz Dela 5 svejedno
 * cekao pola minuta - greska nadjena.
 */
const KES_MS = (() => {
  const iz = parseInt(process.env.TOKEN_VERSION_CACHE_MS, 10);

  return Number.isFinite(iz) && iz >= 0 ? iz : 30_000;
})();

/** userId -> { tokenVersion, status, vaziDo } */
const kes = new Map();

/** Da kes ne raste bez granice na dugom radu. */
const MAX_KESA = 5000;

const odgovor = (res, status, kod, poruka) =>
  res.status(status).json({ success: false, error: kod, message: poruka, statusCode: status });

/** Cisti zapamcenu verziju - koristi se u probama. */
const ocistiKes = (userId = null) => {
  if (userId) kes.delete(String(userId));
  else kes.clear();
};

/**
 * Trenutna verzija tokena korisnika, sa kesom.
 *
 * @throws kada User Service ne odgovori - pozivalac tada odbija zahtev
 */
const verzijaKorisnika = async (userId, { osvezi = false } = {}) => {
  const kljuc = String(userId);
  const zapamceno = kes.get(kljuc);

  if (!osvezi && zapamceno && Date.now() < zapamceno.vaziDo) return zapamceno;

  const { data } = await axios.get(
    `${USER_SERVICE_URL}/api/users/internal/${encodeURIComponent(kljuc)}/token-version`,
    {
      headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY || '' },
      timeout: TIMEOUT,
      validateStatus: (s) => s === 200 || s === 404
    }
  );

  const zapis = data?.success
    ? {
        tokenVersion: Number(data.data?.tokenVersion) || 0,
        status: data.data?.status || null,
        postoji: true
      }
    : { tokenVersion: null, status: null, postoji: false };

  if (kes.size >= MAX_KESA) kes.clear();
  kes.set(kljuc, { ...zapis, vaziDo: Date.now() + KES_MS });

  return zapis;
};

/**
 * OPOZIV TOKENA.
 *
 * Potpis tokena kaze samo da ga je izdao ovaj sistem, ne i da i dalje
 * vazi. Zato se uz potpis proverava i verzija: token nosi claim `tv`, a
 * korisnik u bazi `tokenVersion`. Promena lozinke, blokiranje, odbijanje
 * i promena uloge uvecavaju verziju, pa svi raniji tokeni odjednom
 * prestaju da vaze - bez cekanja da isteknu (do 24 h).
 *
 * Middleware stoji PRE svih ruta i radi za SVAKI zahtev koji nosi
 * `Authorization`, i na javnim rutama gde je token opcion (npr.
 * `/v1/plan` za gosta koji je ipak prijavljen).
 *
 * Zahtev BEZ tokena prolazi nepromenjen.
 */
const opozivTokena = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.slice(7).trim();
  if (!token) return next();

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    /*
     * Nevazeci ili istekao token se NE odbija ovde: javne rute ga
     * tretiraju kao "nema tokena", a zasticene ga i inace odbijaju u
     * `verifyToken`. Ovaj middleware se bavi samo opozivom.
     */
    return next();
  }

  if (!payload?.id) return next();

  try {
    const korisnik = await verzijaKorisnika(payload.id);

    if (!korisnik.postoji) {
      return odgovor(res, 401, 'TOKEN_REVOKED', 'Nalog vise ne postoji. Prijavite se ponovo.');
    }

    // Tokeni izdati ranije nemaju `tv`; racunaju se kao 0
    const uTokenu = Number(payload.tv) || 0;

    let trenutna = korisnik.tokenVersion;

    /*
     * Token NOVIJI od zapamcene verzije znaci da je kes zastareo, ne da
     * je token opozvan: verzija se uvecava samo u User Service-u, a
     * token je potpisan. Tipicno se desi odmah posle promene lozinke -
     * korisnik dobije nov token, a gateway jos pamti staru verziju.
     * Tada se pita servis, bez cekanja da kes istekne.
     *
     * Token STARIJI od zapamcene verzije je opozvan i odbija se odmah,
     * bez poziva - inace bi gomila starih tokena mogla da zatrpa User
     * Service pitanjima.
     */
    if (uTokenu > trenutna) {
      trenutna = (await verzijaKorisnika(payload.id, { osvezi: true })).tokenVersion;
    }

    if (uTokenu !== trenutna) {
      return odgovor(
        res,
        401,
        'TOKEN_REVOKED',
        'Sesija je istekla ili je nalog promenjen. Prijavite se ponovo.'
      );
    }

    if (korisnik.status && korisnik.status !== 'odobren') {
      return odgovor(res, 401, 'TOKEN_REVOKED', 'Nalog nije aktivan. Prijavite se ponovo.');
    }

    return next();
  } catch (err) {
    /*
     * User Service ne odgovara.
     *
     * Zahtev sa tokenom se ODBIJA (503), a ne propusta. Propustanje bi
     * znacilo da pad jednog servisa vraca sve blokirane naloge u igru -
     * a to je upravo trenutak kada je sistem najranjiviji. Zahtevi bez
     * tokena nastavljaju da rade, pa gost i dalje moze da planira.
     */
    console.error('[API_GATEWAY] Provera opoziva tokena nije uspela:', err.message);

    return odgovor(
      res,
      503,
      'AUTH_UNAVAILABLE',
      'Provera naloga trenutno nije moguca. Pokusajte ponovo za koji trenutak.'
    );
  }
};

module.exports = { opozivTokena, ocistiKes, KES_MS };
