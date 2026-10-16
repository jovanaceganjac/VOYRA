const jwt = require('jsonwebtoken');

const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

/**
 * Izdaje JWT token za prijavljenog korisnika.
 *
 * Payload: { id, korisnickoIme, email, uloga, tv } - dovoljno da ostali
 * servisi znaju ko je poslao zahtev i sta sme, bez dodatnog poziva
 * ka User Service-u. Admin Service se oslanja bas na `uloga`.
 *
 * `tv` je verzija tokena: gateway je poredi sa trenutnom
 * verzijom korisnika, pa token izdat pre promene lozinke, blokiranja
 * ili promene uloge prestaje da vazi odmah, a ne tek po isteku.
 */
const generateToken = (userId, korisnickoIme, email, uloga = 'korisnik', tokenVersion = 0) => {
  return jwt.sign(
    { id: userId, korisnickoIme, email, uloga, tv: Number(tokenVersion) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
};

/**
 * Verifikuje token. Vraca dekodirani payload ili null ako je token
 * nevazeci / istekao.
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

module.exports = { generateToken, verifyToken };
