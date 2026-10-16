const PODRAZUMEVANI_REGEX = /^\+[0-9]{10,14}$/;

/** Regex iz .env-a ako postoji, inace podrazumevani. */
const regex = () => {
  const iz = process.env.PHONE_REGEX;
  try {
    return iz ? new RegExp(iz) : PODRAZUMEVANI_REGEX;
  } catch (err) {
    console.warn('[USER_SERVICE] PHONE_REGEX nije validan, koristim podrazumevani');
    return PODRAZUMEVANI_REGEX;
  }
};

/**
 * Normalizuje broj: uklanja razmake, crtice i zagrade,
 * a vodecu nulu posle pozivnog broja ("+381 060...") skida.
 */
const normalizuj = (broj) => {
  if (!broj) return broj;

  let t = String(broj).trim().replace(/[\s\-().]/g, '');

  // 00381... -> +381...
  if (t.startsWith('00')) t = `+${t.slice(2)}`;

  return t;
};

/**
 * @returns {{ valid: boolean, number?: string, error?: string }}
 */
const validiraj = (broj) => {
  const t = normalizuj(broj);

  if (!t) return { valid: false, error: 'Broj telefona je prazan' };

  if (!t.startsWith('+')) {
    return { valid: false, error: 'Invalid phone format: broj mora da pocinje sa + i pozivnim brojem' };
  }

  if (!regex().test(t)) {
    return {
      valid: false,
      error: 'Invalid phone format: ocekivano + i 10-14 cifara (npr. +381601234567)'
    };
  }

  return { valid: true, number: t };
};

/** "+381601234567" -> "+3816****567" za ispis u logu */
const maskiraj = (broj) => {
  if (!broj || broj.length < 8) return broj;
  return `${broj.slice(0, 5)}****${broj.slice(-3)}`;
};

module.exports = { validiraj, normalizuj, maskiraj };
