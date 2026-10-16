/**
 * Jedno mesto sa podacima o svim servisima: URL, timeout, retry i
 * da li je servis kritican za planiranje.
 *
 * Kriticni su planner i integration - bez njih plan ne postoji.
 * Ostali samo obogacuju odgovor, pa njihov pad daje upozorenje.
 */
const broj = (v, podrazumevano) => parseInt(v, 10) || podrazumevano;

const REGISTRY = {
  planner: {
    url: process.env.PLANNER_SERVICE_URL,
    timeout: broj(process.env.PLANNER_TIMEOUT_MS, 35000),
    retry: 0,
    critical: true
  },
  integration: {
    url: process.env.INTEGRATION_SERVICE_URL,
    timeout: broj(process.env.HEALTH_TIMEOUT_MS, 3000),
    retry: 0,
    critical: true // planner zavisi od njega
  },
  booking: {
    url: process.env.BOOKING_SERVICE_URL,
    timeout: broj(process.env.BOOKING_TIMEOUT_MS, 8000),
    retry: 1,
    critical: false
  },
  trip: {
    url: process.env.TRIP_SERVICE_URL,
    timeout: broj(process.env.TRIP_TIMEOUT_MS, 5000),
    retry: 1,
    critical: false
  },
  notification: {
    url: process.env.NOTIFICATION_SERVICE_URL,
    timeout: broj(process.env.NOTIFICATION_TIMEOUT_MS, 3000),
    retry: 0,
    critical: false
  },
  admin: {
    url: process.env.ADMIN_SERVICE_URL,
    timeout: broj(process.env.ADMIN_TIMEOUT_MS, 3000),
    retry: 0,
    critical: false
  },
  user: {
    url: process.env.USER_SERVICE_URL,
    timeout: broj(process.env.HEALTH_TIMEOUT_MS, 3000),
    retry: 0,
    critical: false // JWT se proverava lokalno, User Service se ne poziva
  }
};

/**
 * Servis odbija da se pokrene bez obaveznih promenljivih - bolje
 * odmah nego da prvi zahtev padne sa nejasnom greskom.
 */
const proveriKonfiguraciju = () => {
  const nedostaju = [];

  if (!process.env.JWT_SECRET) nedostaju.push('JWT_SECRET');
  if (!process.env.INTERNAL_API_KEY) nedostaju.push('INTERNAL_API_KEY');

  for (const [ime, s] of Object.entries(REGISTRY)) {
    if (!s.url) nedostaju.push(`${ime.toUpperCase()}_SERVICE_URL`);
  }

  if (nedostaju.length > 0) {
    throw new Error(`Nedostaju obavezne .env promenljive: ${nedostaju.join(', ')}`);
  }
};

module.exports = { REGISTRY, proveriKonfiguraciju };
