const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID, createHmac, timingSafeEqual } = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'camp.db');
const LEGACY_REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo-admin-123';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'replace-this-secret-in-production';
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;
const ADMIN_SESSION_COOKIE = 'admin_session';

const PRICE_OPTIONS = {
  campType: {
    iaido: { label: 'Iaidō tábor', amountHuf: 59000 },
    jodo: { label: 'Jōdō tábor', amountHuf: 59000 },
    both: { label: 'Iaidō + Jōdō tábor', amountHuf: 99000 }
  },
  mealPlan: {
    none: { label: 'Étkezés nélkül', amountHuf: 0 },
    lunch: { label: 'Ebéd csomag', amountHuf: 13000 },
    full: { label: 'Teljes étkezés', amountHuf: 24000 }
  },
  accommodation: {
    none: { label: 'Szállás nélkül', amountHuf: 0 },
    dojo: { label: 'Dojo szállás', amountHuf: 29000 },
    guesthouse: { label: 'Vendégház', amountHuf: 54000 }
  }
};

function toEnumValue(value, allowedValues, fallbackValue) {
  const normalized = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(allowedValues, normalized) ? normalized : fallbackValue;
}

function calculatePricing(selection) {
  const campType = toEnumValue(selection.campType, PRICE_OPTIONS.campType, 'iaido');
  const mealPlan = toEnumValue(selection.mealPlan, PRICE_OPTIONS.mealPlan, 'none');
  const accommodation = toEnumValue(selection.accommodation, PRICE_OPTIONS.accommodation, 'none');

  const lineItems = [
    { key: 'campType', code: campType, ...PRICE_OPTIONS.campType[campType] },
    { key: 'mealPlan', code: mealPlan, ...PRICE_OPTIONS.mealPlan[mealPlan] },
    { key: 'accommodation', code: accommodation, ...PRICE_OPTIONS.accommodation[accommodation] }
  ];

  const totalHuf = lineItems.reduce((sum, item) => sum + item.amountHuf, 0);

  return {
    selection: { campType, mealPlan, accommodation },
    lineItems,
    totalHuf,
    currency: 'HUF'
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initDatabase() {
  ensureDataDir();
  const db = new DatabaseSync(DB_FILE);

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_huf INTEGER NOT NULL,
      currency TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      date_of_birth TEXT,
      city TEXT NOT NULL,
      current_grade TEXT NOT NULL,
      camp_type TEXT NOT NULL,
      meal_plan TEXT NOT NULL,
      accommodation TEXT NOT NULL,
      wants_exam INTEGER NOT NULL,
      target_grade TEXT,
      billing_full_name TEXT NOT NULL,
      billing_zip TEXT NOT NULL,
      billing_city TEXT NOT NULL,
      billing_address TEXT NOT NULL,
      billing_country TEXT NOT NULL,
      food_notes TEXT,
      price_breakdown TEXT NOT NULL,
      privacy_consent INTEGER NOT NULL,
      terms_consent INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at);
    CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
  `);

  ensureRegistrationColumns(db);
  migrateLegacyJsonIfNeeded(db);
  return db;
}

function ensureRegistrationColumns(db) {
  const columns = db.prepare('PRAGMA table_info(registrations)').all();
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('camp_type')) {
    db.exec("ALTER TABLE registrations ADD COLUMN camp_type TEXT NOT NULL DEFAULT 'iaido';");
  }
  if (!columnNames.has('meal_plan')) {
    db.exec("ALTER TABLE registrations ADD COLUMN meal_plan TEXT NOT NULL DEFAULT 'none';");
  }
  if (!columnNames.has('accommodation')) {
    db.exec("ALTER TABLE registrations ADD COLUMN accommodation TEXT NOT NULL DEFAULT 'none';");
  }
  if (!columnNames.has('price_breakdown')) {
    db.exec("ALTER TABLE registrations ADD COLUMN price_breakdown TEXT NOT NULL DEFAULT '{}';");
  }
}

function migrateLegacyJsonIfNeeded(db) {
  if (!fs.existsSync(LEGACY_REGISTRATIONS_FILE)) {
    return;
  }

  const totalInDb = db.prepare('SELECT COUNT(1) AS count FROM registrations').get().count;
  if (totalInDb > 0) {
    return;
  }

  let legacy = [];
  try {
    const raw = fs.readFileSync(LEGACY_REGISTRATIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    legacy = Array.isArray(parsed) ? parsed : [];
  } catch {
    legacy = [];
  }

  if (legacy.length === 0) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO registrations (
      id, created_at, status, amount_huf, currency,
      full_name, email, phone, date_of_birth, city, current_grade,
      camp_type, meal_plan, accommodation,
      wants_exam, target_grade,
      billing_full_name, billing_zip, billing_city, billing_address, billing_country,
      food_notes, price_breakdown, privacy_consent, terms_consent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const item of legacy) {
      const pricing = calculatePricing({
        campType: item.campType || 'iaido',
        mealPlan: item.mealPlan || 'none',
        accommodation: item.accommodation || 'none'
      });

      insert.run(
        item.id || `reg_${randomUUID()}`,
        item.createdAt || new Date().toISOString(),
        item.status || 'PENDING_PAYMENT',
        Number(item.amountHuf || pricing.totalHuf),
        item.currency || pricing.currency,
        String(item.fullName || ''),
        String(item.email || ''),
        String(item.phone || ''),
        String(item.dateOfBirth || ''),
        String(item.city || ''),
        String(item.currentGrade || ''),
        pricing.selection.campType,
        pricing.selection.mealPlan,
        pricing.selection.accommodation,
        item.wantsExam ? 1 : 0,
        String(item.targetGrade || ''),
        String(item.billingFullName || ''),
        String(item.billingZip || ''),
        String(item.billingCity || ''),
        String(item.billingAddress || ''),
        String(item.billingCountry || 'Magyarország'),
        String(item.foodNotes || ''),
        JSON.stringify(pricing),
        item.privacyConsent ? 1 : 0,
        item.termsConsent ? 1 : 0
      );
    }
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    throw new Error('Legacy JSON migration failed.');
  }
}

function mapRegistrationRow(row) {
  let priceBreakdown;
  try {
    priceBreakdown = JSON.parse(row.price_breakdown || '{}');
  } catch {
    priceBreakdown = null;
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    amountHuf: row.amount_huf,
    currency: row.currency,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    dateOfBirth: row.date_of_birth || '',
    city: row.city,
    currentGrade: row.current_grade,
    campType: row.camp_type || 'iaido',
    mealPlan: row.meal_plan || 'none',
    accommodation: row.accommodation || 'none',
    wantsExam: row.wants_exam === 1,
    targetGrade: row.target_grade || '',
    billingFullName: row.billing_full_name,
    billingZip: row.billing_zip,
    billingCity: row.billing_city,
    billingAddress: row.billing_address,
    billingCountry: row.billing_country,
    foodNotes: row.food_notes || '',
    priceBreakdown,
    privacyConsent: row.privacy_consent === 1,
    termsConsent: row.terms_consent === 1
  };
}

function readRegistrations(db) {
  const rows = db
    .prepare('SELECT * FROM registrations ORDER BY datetime(created_at) ASC, rowid ASC')
    .all();

  return rows.map(mapRegistrationRow);
}

function insertRegistration(db, registration) {
  const insert = db.prepare(`
    INSERT INTO registrations (
      id, created_at, status, amount_huf, currency,
      full_name, email, phone, date_of_birth, city, current_grade,
      camp_type, meal_plan, accommodation,
      wants_exam, target_grade,
      billing_full_name, billing_zip, billing_city, billing_address, billing_country,
      food_notes, price_breakdown, privacy_consent, terms_consent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    registration.id,
    registration.createdAt,
    registration.status,
    registration.amountHuf,
    registration.currency,
    registration.fullName,
    registration.email,
    registration.phone,
    registration.dateOfBirth,
    registration.city,
    registration.currentGrade,
    registration.campType,
    registration.mealPlan,
    registration.accommodation,
    registration.wantsExam ? 1 : 0,
    registration.targetGrade,
    registration.billingFullName,
    registration.billingZip,
    registration.billingCity,
    registration.billingAddress,
    registration.billingCountry,
    registration.foodNotes,
    JSON.stringify(registration.priceBreakdown),
    registration.privacyConsent ? 1 : 0,
    registration.termsConsent ? 1 : 0
  );
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request too large'));
      }
    });

    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', () => reject(new Error('Request stream error')));
  });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  return typeof value === 'string' && /^[+()\-\s0-9]{7,20}$/.test(value.trim());
}

function sanitizePayload(payload) {
  const wantsExam = Boolean(payload.wantsExam);
  const campType = toEnumValue(payload.campType, PRICE_OPTIONS.campType, 'iaido');
  const mealPlan = toEnumValue(payload.mealPlan, PRICE_OPTIONS.mealPlan, 'none');
  const accommodation = toEnumValue(payload.accommodation, PRICE_OPTIONS.accommodation, 'none');

  return {
    fullName: String(payload.fullName || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: String(payload.phone || '').trim(),
    dateOfBirth: String(payload.dateOfBirth || '').trim(),
    city: String(payload.city || '').trim(),
    currentGrade: String(payload.currentGrade || '').trim(),
    campType,
    mealPlan,
    accommodation,
    wantsExam,
    targetGrade: wantsExam ? String(payload.targetGrade || '').trim() : '',
    billingFullName: String(payload.billingFullName || '').trim(),
    billingZip: String(payload.billingZip || '').trim(),
    billingCity: String(payload.billingCity || '').trim(),
    billingAddress: String(payload.billingAddress || '').trim(),
    billingCountry: String(payload.billingCountry || 'Magyarország').trim(),
    foodNotes: String(payload.foodNotes || '').trim(),
    privacyConsent: Boolean(payload.privacyConsent),
    termsConsent: Boolean(payload.termsConsent)
  };
}

function validateRegistration(data) {
  const errors = [];

  if (!isNonEmptyString(data.fullName)) errors.push('A teljes név kötelező.');
  if (!isValidEmail(data.email)) errors.push('Érvényes email cím kötelező.');
  if (!isValidPhone(data.phone)) errors.push('Érvényes telefonszám kötelező.');
  if (!isNonEmptyString(data.city)) errors.push('A lakóhely (város) kötelező.');
  if (!isNonEmptyString(data.currentGrade)) errors.push('A jelenlegi fokozat kötelező.');
  if (!Object.prototype.hasOwnProperty.call(PRICE_OPTIONS.campType, data.campType)) {
    errors.push('Érvénytelen táborválasztás.');
  }
  if (!Object.prototype.hasOwnProperty.call(PRICE_OPTIONS.mealPlan, data.mealPlan)) {
    errors.push('Érvénytelen étkezési opció.');
  }
  if (!Object.prototype.hasOwnProperty.call(PRICE_OPTIONS.accommodation, data.accommodation)) {
    errors.push('Érvénytelen szállás opció.');
  }

  if (data.wantsExam && !isNonEmptyString(data.targetGrade)) {
    errors.push('Vizsgajelentkezés esetén a célfokozat kötelező.');
  }

  if (!isNonEmptyString(data.billingFullName)) errors.push('A számlázási név kötelező.');
  if (!/^\d{4}$/.test(data.billingZip)) errors.push('A számlázási irányítószám 4 számjegy legyen.');
  if (!isNonEmptyString(data.billingCity)) errors.push('A számlázási város kötelező.');
  if (!isNonEmptyString(data.billingAddress)) errors.push('A számlázási cím kötelező.');
  if (!isNonEmptyString(data.billingCountry)) errors.push('A számlázási ország kötelező.');
  if (!data.privacyConsent) errors.push('Az adatkezelési hozzájárulás kötelező.');
  if (!data.termsConsent) errors.push('A részvételi feltételek elfogadása kötelező.');

  return errors;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': MIME_TYPES['.json'] });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return header.split(';').reduce((acc, part) => {
    const [rawKey, ...valueParts] = part.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(valueParts.join('=') || '');
    return acc;
  }, {});
}

function addSetCookieHeader(res, cookieValue) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookieValue]);
    return;
  }

  res.setHeader('Set-Cookie', [current, cookieValue]);
}

function setAdminSessionCookie(res, token, maxAgeSeconds) {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  addSetCookieHeader(res, parts.join('; '));
}

function clearAdminSessionCookie(res) {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  addSetCookieHeader(res, parts.join('; '));
}

function signSessionPayload(encodedPayload) {
  return createHmac('sha256', ADMIN_SESSION_SECRET).update(encodedPayload).digest('base64url');
}

function buildAdminSessionToken() {
  const payload = {
    username: ADMIN_USERNAME,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signSessionPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyAdminSessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;

  const [encodedPayload, signature, ...rest] = token.split('.');
  if (!encodedPayload || !signature || rest.length > 0) return false;

  const expected = signSessionPayload(encodedPayload);
  if (!safeEqualStrings(signature, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (payload.username !== ADMIN_USERNAME) return false;
    if (typeof payload.exp !== 'number') return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

function isAdminAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_SESSION_COOKIE];
  return verifyAdminSessionToken(token);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: 'Resource not found' });
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function getStats(registrations) {
  const total = registrations.length;
  const wantsExam = registrations.filter((r) => r.wantsExam).length;
  const pendingPayment = registrations.filter((r) => r.status === 'PENDING_PAYMENT').length;
  const paid = registrations.filter((r) => r.status === 'PAID').length;
  const projectedRevenueHuf = registrations.reduce((sum, current) => sum + Number(current.amountHuf || 0), 0);

  const byCampType = registrations.reduce((acc, current) => {
    acc[current.campType] = (acc[current.campType] || 0) + 1;
    return acc;
  }, {});

  const byCurrentGrade = registrations.reduce((acc, current) => {
    acc[current.currentGrade] = (acc[current.currentGrade] || 0) + 1;
    return acc;
  }, {});

  const byTargetGrade = registrations
    .filter((r) => r.wantsExam && r.targetGrade)
    .reduce((acc, current) => {
      acc[current.targetGrade] = (acc[current.targetGrade] || 0) + 1;
      return acc;
    }, {});

  const lastRegistrationAt = total > 0 ? registrations[total - 1].createdAt : null;

  return {
    total,
    wantsExam,
    pendingPayment,
    paid,
    projectedRevenueHuf,
    byCampType,
    byCurrentGrade,
    byTargetGrade,
    lastRegistrationAt
  };
}

function getStaticFilePath(urlPath) {
  const routeMap = {
    '/': 'index.html',
    '/program': 'program.html',
    '/faq': 'faq.html',
    '/info': 'info.html',
    '/jelentkezes': 'jelentkezes.html',
    '/admin': 'admin.html'
  };

  if (routeMap[urlPath]) {
    return path.join(PUBLIC_DIR, routeMap[urlPath]);
  }

  const normalizedPath = path.posix.normalize(urlPath);
  if (normalizedPath.includes('..')) {
    return null;
  }

  const relativePath = normalizedPath.replace(/^\/+/, '');
  return path.join(PUBLIC_DIR, relativePath);
}

function createServer(options = {}) {
  const db = options.db || initDatabase();

  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = reqUrl;

    if (req.method === 'GET' && pathname === '/api/pricing') {
      sendJson(res, 200, { pricing: PRICE_OPTIONS });
      return;
    }

    if (req.method === 'GET' && pathname === '/admin') {
      const fileName = isAdminAuthenticated(req) ? 'admin.html' : 'admin-login.html';
      serveFile(res, path.join(PUBLIC_DIR, fileName));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/session') {
      sendJson(res, 200, { authenticated: isAdminAuthenticated(req) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/login') {
      try {
        const body = await parseJsonBody(req);
        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!safeEqualStrings(username, ADMIN_USERNAME) || !safeEqualStrings(password, ADMIN_PASSWORD)) {
          sendJson(res, 401, { error: 'Hibás felhasználónév vagy jelszó.' });
          return;
        }

        const token = buildAdminSessionToken();
        setAdminSessionCookie(res, token, ADMIN_SESSION_TTL_SECONDS);
        sendJson(res, 200, { message: 'Sikeres bejelentkezés.' });
      } catch (error) {
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      clearAdminSessionCookie(res);
      sendJson(res, 200, { message: 'Sikeres kijelentkezés.' });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/stats') {
      if (!isAdminAuthenticated(req)) {
        sendJson(res, 401, { error: 'Admin bejelentkezés szükséges.' });
        return;
      }
      const registrations = readRegistrations(db);
      sendJson(res, 200, { stats: getStats(registrations) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/registrations') {
      if (!isAdminAuthenticated(req)) {
        sendJson(res, 401, { error: 'Admin bejelentkezés szükséges.' });
        return;
      }
      const registrations = readRegistrations(db);
      sendJson(res, 200, { registrations });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/register') {
      try {
        const body = await parseJsonBody(req);
        const cleanBody = sanitizePayload(body);
        const errors = validateRegistration(cleanBody);

        if (errors.length > 0) {
          sendJson(res, 400, { errors });
          return;
        }

        const pricing = calculatePricing({
          campType: cleanBody.campType,
          mealPlan: cleanBody.mealPlan,
          accommodation: cleanBody.accommodation
        });

        const newRegistration = {
          id: `reg_${randomUUID()}`,
          createdAt: new Date().toISOString(),
          status: 'PENDING_PAYMENT',
          amountHuf: pricing.totalHuf,
          currency: pricing.currency,
          priceBreakdown: pricing,
          ...cleanBody
        };

        insertRegistration(db, newRegistration);

        sendJson(res, 201, {
          message: 'Regisztráció rögzítve. Következő lépés: Stripe Checkout átirányítás.',
          registrationId: newRegistration.id,
          pricing,
          payment: {
            provider: 'stripe',
            status: 'NOT_IMPLEMENTED',
            note: 'Demo módban még nincs átirányítás a Stripe oldalra.',
            nextAction: 'REDIRECT_TO_STRIPE_CHECKOUT'
          }
        });
      } catch (error) {
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/payments/create-checkout-session') {
      sendJson(res, 501, {
        error: 'Stripe integration disabled in demo mode.',
        nextStep: 'Integrate Stripe Checkout and call this endpoint from /api/register flow.'
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/invoices/create') {
      sendJson(res, 501, {
        error: 'Szamlazz.hu integration disabled in demo mode.',
        nextStep: 'Trigger this endpoint after successful Stripe webhook processing.'
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/stripe/webhook') {
      sendJson(res, 501, {
        error: 'Stripe webhook disabled in demo mode.',
        nextStep: 'Validate signature and update payment status + invoice creation.'
      });
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const filePath = getStaticFilePath(pathname);
    if (!filePath || !path.resolve(filePath).startsWith(path.resolve(PUBLIC_DIR))) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    serveFile(res, filePath);
  });
}

if (require.main === module) {
  const db = initDatabase();
  const server = createServer({ db });

  server.listen(PORT, () => {
    console.log(`Iaido Camp demo running on http://localhost:${PORT}`);
  });

  process.on('exit', () => {
    db.close();
  });
}

module.exports = {
  createServer,
  initDatabase,
  readRegistrations,
  insertRegistration,
  calculatePricing,
  PRICE_OPTIONS,
  sanitizePayload,
  validateRegistration,
  getStats
};
