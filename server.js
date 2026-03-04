const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID, randomBytes, createHmac, timingSafeEqual, scryptSync } = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const NODE_ENV = String(process.env.NODE_ENV || 'development').trim().toLowerCase();
const IS_PRODUCTION = NODE_ENV === 'production';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'camp.db');
const DB_BACKUP_DIR = (() => {
  const raw = String(process.env.DB_BACKUP_DIR || '').trim();
  if (!raw) return path.join(DATA_DIR, 'backups');
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, raw);
})();
const DB_BACKUP_ENABLED = String(process.env.DB_BACKUP_ENABLED || 'true').trim().toLowerCase() !== 'false';
const DB_BACKUP_RETENTION_DAYS = (() => {
  const raw = Number(process.env.DB_BACKUP_RETENTION_DAYS || 30);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 30;
})();
const LEGACY_REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_SESSION_SECRET_FROM_ENV = String(process.env.ADMIN_SESSION_SECRET || '').trim();
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;
const ADMIN_SESSION_COOKIE = 'admin_session';
const ADMIN_PASSWORD_MIN_LENGTH = 8;
const ADMIN_LOGIN_MAX_FAILURES = 5;
const ADMIN_LOGIN_BLOCK_MS = 15 * 60 * 1000;
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'false').trim().toLowerCase() === 'true';
const REGISTRATION_RATE_LIMIT_COUNT = (() => {
  const raw = Number(process.env.REGISTRATION_RATE_LIMIT_COUNT || 30);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 30;
})();
const REGISTRATION_RATE_LIMIT_WINDOW_MS = (() => {
  const raw = Number(process.env.REGISTRATION_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
  return Number.isFinite(raw) && raw >= 1000 ? Math.floor(raw) : 10 * 60 * 1000;
})();
const ADMIN_EMAIL_RATE_LIMIT_COUNT = (() => {
  const raw = Number(process.env.ADMIN_EMAIL_RATE_LIMIT_COUNT || 20);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 20;
})();
const ADMIN_EMAIL_RATE_LIMIT_WINDOW_MS = (() => {
  const raw = Number(process.env.ADMIN_EMAIL_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
  return Number.isFinite(raw) && raw >= 1000 ? Math.floor(raw) : 10 * 60 * 1000;
})();
const RETRY_PAYMENT_LINK_TTL_SECONDS = (() => {
  const raw = Number(process.env.RETRY_PAYMENT_LINK_TTL_SECONDS || 60 * 60 * 24 * 7);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60 * 60 * 24 * 7;
})();
const PRIVACY_POLICY_VERSION = '2026-02-26';
const TERMS_VERSION = '2026-02-26';
const SQLITE_BUSY_TIMEOUT_MS = 5000;
const SQLITE_RETRY_MAX_ATTEMPTS = 5;
const SQLITE_RETRY_BASE_DELAY_MS = 120;
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
const BREVO_API_KEY = String(process.env.BREVO_API_KEY || '').trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || '').trim();
const EMAIL_FROM_NAME = String(process.env.EMAIL_FROM_NAME || 'Ishido Sensei - Summer Seminar').trim();
const ADMIN_NOTIFY_EMAIL = String(process.env.ADMIN_NOTIFY_EMAIL || '').trim();
const ADMIN_EMAIL_MAX_RECIPIENTS = (() => {
  const raw = Number(process.env.ADMIN_EMAIL_MAX_RECIPIENTS || 500);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 500;
})();
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_REQUEST_TIMEOUT_MS = 8000;
const APP_SETTING_KEY_PRICING = 'pricing_settings_v1';
const APP_SETTING_KEY_ADMIN_AUTH = 'admin_auth_v1';
const APP_SETTING_KEY_ADMIN_SESSION_SECRET = 'admin_session_secret_v1';
const ADMIN_EMAIL_TEMPLATES = [
  {
    key: 'important_update',
    label: 'Important update',
    subject: 'Important update - Ishido Sensei - Summer Seminar 2026',
    body: [
      'Hello {{fullName}},',
      '',
      'We would like to share an important update regarding the seminar.',
      '',
      'Please read this message carefully and contact us if you have any questions.',
      '',
      'Best regards,',
      'Organizing Team'
    ].join('\n')
  },
  {
    key: 'program_update',
    label: 'Program update',
    subject: 'Program update - Ishido Sensei - Summer Seminar 2026',
    body: [
      'Hello {{fullName}},',
      '',
      'The seminar program has been updated.',
      '',
      'Please check the latest details on the Program page.',
      '',
      'Best regards,',
      'Organizing Team'
    ].join('\n')
  },
  {
    key: 'final_reminder',
    label: 'Final reminder (1 week)',
    subject: 'Reminder: See you next week at Ludovika Arena!',
    body: [
      'Dear {{fullName}},',
      '',
      'Only one week left until the Ishido Sensei Summer Seminar 2026 starts. We are really looking forward to practicing together.',
      '',
      'Important reminders:',
      '- Venue: Ludovika Arena (1083 Budapest, Ludovika ter 2.)',
      '- Start: Please arrive at least 30 minutes before your first training session for on-site registration.',
      '- What to bring: your registration confirmation email (digital), proper training attire (nafuda is required), and the appropriate equipment for your discipline, including koryu practice.',
      '- Parking: paid parking in the surrounding streets on Friday, free on the weekend.',
      '',
      'If you have any questions, feel free to contact us.',
      'We wish you a safe trip to Budapest.',
      '',
      'Best regards,',
      'The Organizing Team'
    ].join('\n')
  }
];
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1';
const STRIPE_REQUEST_TIMEOUT_MS = 10000;
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;
const STRIPE_SUCCESS_URL = String(process.env.STRIPE_SUCCESS_URL || `${APP_BASE_URL}/payment-success`).trim();
const STRIPE_CANCEL_URL = String(process.env.STRIPE_CANCEL_URL || `${APP_BASE_URL}/payment-cancel`).trim();
const SZAMLAZZ_ENABLED = String(process.env.SZAMLAZZ_ENABLED || 'false').trim().toLowerCase() === 'true';
const SZAMLAZZ_API_URL = String(process.env.SZAMLAZZ_API_URL || 'https://www.szamlazz.hu/szamla/').trim();
const SZAMLAZZ_AGENT_KEY = String(process.env.SZAMLAZZ_AGENT_KEY || '').trim();
const SZAMLAZZ_REQUEST_TIMEOUT_MS = (() => {
  const raw = Number(process.env.SZAMLAZZ_REQUEST_TIMEOUT_MS || 15000);
  return Number.isFinite(raw) && raw >= 1000 ? Math.floor(raw) : 15000;
})();
const SZAMLAZZ_INVOICE_LANGUAGE = String(process.env.SZAMLAZZ_INVOICE_LANGUAGE || 'en').trim() || 'en';
const SZAMLAZZ_PAYMENT_METHOD = String(process.env.SZAMLAZZ_PAYMENT_METHOD || 'Bankkártya').trim() || 'Bankkártya';
const SZAMLAZZ_AFAKULCS = String(process.env.SZAMLAZZ_AFAKULCS || '0').trim() || '0';
const SZAMLAZZ_ESZAMLA = String(process.env.SZAMLAZZ_ESZAMLA || 'false').trim().toLowerCase() === 'true';
const SZAMLAZZ_SEND_EMAIL = String(process.env.SZAMLAZZ_SEND_EMAIL || 'false').trim().toLowerCase() === 'true';
const SZAMLAZZ_SET_PAID = String(process.env.SZAMLAZZ_SET_PAID || 'true').trim().toLowerCase() !== 'false';
const SZAMLAZZ_COMMENT = String(process.env.SZAMLAZZ_COMMENT || 'Ishido Sensei - Summer Seminar 2026').trim();
const SZAMLAZZ_EXTERNAL_ID_PREFIX = String(process.env.SZAMLAZZ_EXTERNAL_ID_PREFIX || 'camp-').trim();
const PRICE_CATALOG = {
  campType: {
    iaido: { label: 'Iaido seminar', defaultAmount: 149 },
    jodo: { label: 'Jodo seminar', defaultAmount: 149 },
    both: { label: 'Iaido + Jodo seminar', defaultAmount: 249 }
  },
  mealPlan: {
    none: { label: 'No meal', defaultAmount: 0 },
    lunch: { label: 'Lunch package', defaultAmount: 33 },
    full: { label: 'Full meal package', defaultAmount: 60 }
  },
  accommodation: {
    none: { label: 'No accommodation', defaultAmount: 0 },
    dojo: { label: 'Dojo accommodation', defaultAmount: 73 },
    guesthouse: { label: 'Guesthouse', defaultAmount: 135 }
  }
};
const adminLoginFailures = new Map();
const rateLimitBuckets = new Map();
let ADMIN_SESSION_SECRET_RUNTIME = '';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDefaultPricingSettings() {
  const prices = {};
  for (const [groupName, options] of Object.entries(PRICE_CATALOG)) {
    prices[groupName] = {};
    for (const [optionCode, option] of Object.entries(options)) {
      prices[groupName][optionCode] = Number(option.defaultAmount);
    }
  }

  return { prices };
}

const DEFAULT_PRICING_SETTINGS = buildDefaultPricingSettings();

function normalizeMoneyAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error('Invalid amount for EUR.');
  }
  return Math.round(num * 100) / 100;
}

function normalizePricingSettings(rawSettings, fallbackSettings = DEFAULT_PRICING_SETTINGS) {
  const fallback = deepClone(fallbackSettings);
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};

  const normalized = {
    prices: {}
  };

  for (const [groupName, options] of Object.entries(PRICE_CATALOG)) {
    normalized.prices[groupName] = {};
    const rawGroup = raw.prices && typeof raw.prices[groupName] === 'object' ? raw.prices[groupName] : {};
    for (const optionCode of Object.keys(options)) {
      const rawOption = rawGroup[optionCode];
      const fallbackOption = fallback.prices[groupName][optionCode];
      const fromLegacyObject = rawOption && typeof rawOption === 'object' ? rawOption.EUR : undefined;
      normalized.prices[groupName][optionCode] = normalizeMoneyAmount(rawOption ?? fromLegacyObject ?? fallbackOption);
    }
  }
  return normalized;
}

function buildPublicPricingConfig(pricingSettings) {
  const config = {};
  for (const [groupName, options] of Object.entries(PRICE_CATALOG)) {
    config[groupName] = {};
    for (const [optionCode, option] of Object.entries(options)) {
      const amounts = pricingSettings.prices[groupName][optionCode];
      config[groupName][optionCode] = {
        label: option.label,
        amount: Number(amounts)
      };
    }
  }
  return config;
}

const PRICE_OPTIONS = buildPublicPricingConfig(DEFAULT_PRICING_SETTINGS);

function loadPricingSettings(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const select = db.prepare('SELECT value FROM app_settings WHERE key = ?');
  const row = select.get(APP_SETTING_KEY_PRICING);
  if (!row || !row.value) {
    const defaults = deepClone(DEFAULT_PRICING_SETTINGS);
    savePricingSettings(db, defaults);
    return defaults;
  }

  try {
    const parsed = JSON.parse(String(row.value));
    return normalizePricingSettings(parsed, DEFAULT_PRICING_SETTINGS);
  } catch {
    const defaults = deepClone(DEFAULT_PRICING_SETTINGS);
    savePricingSettings(db, defaults);
    return defaults;
  }
}

function savePricingSettings(db, nextSettings) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const normalized = normalizePricingSettings(nextSettings, DEFAULT_PRICING_SETTINGS);
  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  upsert.run(
    APP_SETTING_KEY_PRICING,
    JSON.stringify(normalized),
    new Date().toISOString()
  );

  return normalized;
}

function getAppSettingValue(db, key) {
  const select = db.prepare('SELECT value FROM app_settings WHERE key = ?');
  const row = select.get(String(key || ''));
  return row && typeof row.value === 'string' ? row.value : null;
}

function setAppSettingValue(db, key, value) {
  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  upsert.run(
    String(key || ''),
    String(value ?? ''),
    new Date().toISOString()
  );
}

function createPasswordHash(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(String(password || ''), salt, 64);
  return {
    algo: 'scrypt',
    salt: salt.toString('base64'),
    hash: derived.toString('base64'),
    changedAt: new Date().toISOString()
  };
}

function readAdminAuth(db) {
  const rawValue = getAppSettingValue(db, APP_SETTING_KEY_ADMIN_AUTH);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    const salt = String(parsed?.salt || '').trim();
    const hash = String(parsed?.hash || '').trim();
    const changedAt = String(parsed?.changedAt || '').trim();
    if (!salt || !hash || !changedAt) {
      return null;
    }
    return {
      algo: 'scrypt',
      salt,
      hash,
      changedAt
    };
  } catch {
    return null;
  }
}

function saveAdminAuth(db, authPayload) {
  const payload = {
    algo: 'scrypt',
    salt: String(authPayload?.salt || ''),
    hash: String(authPayload?.hash || ''),
    changedAt: String(authPayload?.changedAt || new Date().toISOString())
  };
  setAppSettingValue(db, APP_SETTING_KEY_ADMIN_AUTH, JSON.stringify(payload));
  return payload;
}

function ensureAdminAuth(db) {
  const existing = readAdminAuth(db);
  if (existing) {
    return existing;
  }

  if (IS_PRODUCTION && !isValidAdminPassword(ADMIN_PASSWORD)) {
    throw new Error('ADMIN_PASSWORD must be a strong password in production (min 8 chars, letters and numbers).');
  }

  const initial = createPasswordHash(ADMIN_PASSWORD);
  return saveAdminAuth(db, initial);
}

function verifyPasswordHash(password, authPayload) {
  if (!authPayload || authPayload.algo !== 'scrypt') {
    return false;
  }

  const saltBuffer = Buffer.from(String(authPayload.salt || ''), 'base64');
  const expectedBuffer = Buffer.from(String(authPayload.hash || ''), 'base64');
  if (!saltBuffer.length || !expectedBuffer.length) {
    return false;
  }

  const actualBuffer = scryptSync(String(password || ''), saltBuffer, expectedBuffer.length);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function isValidAdminPassword(password) {
  const value = String(password || '');
  if (value.length < ADMIN_PASSWORD_MIN_LENGTH || value.length > 128) {
    return false;
  }

  const hasLetter = /[A-Za-z]/.test(value);
  const hasDigit = /\d/.test(value);
  return hasLetter && hasDigit;
}

function isValidAdminSessionSecret(secret) {
  return String(secret || '').trim().length >= 32;
}

function resolveAdminSessionSecret(db) {
  if (ADMIN_SESSION_SECRET_FROM_ENV) {
    if (!isValidAdminSessionSecret(ADMIN_SESSION_SECRET_FROM_ENV)) {
      throw new Error('Invalid ADMIN_SESSION_SECRET. Use a long random secret (min 32 chars).');
    }
    return {
      secret: ADMIN_SESSION_SECRET_FROM_ENV,
      source: 'env'
    };
  }

  const stored = String(getAppSettingValue(db, APP_SETTING_KEY_ADMIN_SESSION_SECRET) || '').trim();
  if (isValidAdminSessionSecret(stored)) {
    return {
      secret: stored,
      source: 'db'
    };
  }

  const generated = randomBytes(48).toString('base64url');
  setAppSettingValue(db, APP_SETTING_KEY_ADMIN_SESSION_SECRET, generated);
  return {
    secret: generated,
    source: 'generated'
  };
}

function initializeAdminSessionSecret(db) {
  const resolved = resolveAdminSessionSecret(db);
  ADMIN_SESSION_SECRET_RUNTIME = resolved.secret;
  return resolved;
}

function getAdminSessionSecretOrThrow() {
  if (!isValidAdminSessionSecret(ADMIN_SESSION_SECRET_RUNTIME)) {
    throw new Error('Admin session secret is not initialized.');
  }
  return ADMIN_SESSION_SECRET_RUNTIME;
}

function toEnumValue(value, allowedValues, fallbackValue) {
  const normalized = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(allowedValues, normalized) ? normalized : fallbackValue;
}

function calculatePricing(selection, pricingSettings = DEFAULT_PRICING_SETTINGS) {
  const campType = toEnumValue(selection.campType, pricingSettings.prices.campType, 'iaido');
  const mealPlan = toEnumValue(selection.mealPlan, pricingSettings.prices.mealPlan, 'none');
  const accommodation = toEnumValue(selection.accommodation, pricingSettings.prices.accommodation, 'none');
  const currency = 'EUR';

  const lineItems = [
    {
      key: 'campType',
      code: campType,
      label: PRICE_CATALOG.campType[campType].label,
      amount: pricingSettings.prices.campType[campType]
    }
  ];

  const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return {
    selection: { campType, mealPlan, accommodation },
    lineItems: lineItems.map((item) => ({ ...item, amountHuf: item.amount })),
    total: totalAmount,
    totalAmount,
    totalHuf: totalAmount,
    currency
  };
}

function formatCurrency(value, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isStripeEnabled() {
  return STRIPE_SECRET_KEY.length > 0;
}

function toStripeMinorUnits(amount, currency = 'EUR') {
  const normalizedCurrency = String(currency || 'EUR').trim().toUpperCase();
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('Invalid payment amount.');
  }

  if (normalizedCurrency === 'EUR') {
    return Math.round(numeric * 100);
  }

  throw new Error(`Unsupported Stripe currency: ${normalizedCurrency}`);
}

function createStripeFormBody(fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, String(value));
  }
  return body;
}

function addQueryParamsToUrl(baseUrl, queryParts) {
  const value = String(baseUrl || '').trim();
  if (!value) return value;
  const parts = Array.isArray(queryParts) ? queryParts.filter(Boolean) : [];
  if (parts.length === 0) return value;

  const hashIndex = value.indexOf('#');
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const separator = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${separator}${parts.join('&')}${hash}`;
}

function buildStripeSuccessUrl(baseUrl, registrationId) {
  const raw = String(baseUrl || '').trim();
  const extra = [];
  if (!/(?:\?|&)session_id=/.test(raw)) {
    extra.push('session_id={CHECKOUT_SESSION_ID}');
  }
  if (registrationId && !/(?:\?|&)registration_id=/.test(raw)) {
    extra.push(`registration_id=${encodeURIComponent(String(registrationId))}`);
  }
  return addQueryParamsToUrl(raw, extra);
}

function getStripeStringId(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.id === 'string') return String(value.id).trim();
  return '';
}

function extractRegistrationIdFromStripeSession(session) {
  const metadataRegistrationId = String(session?.metadata?.registration_id || '').trim();
  const clientReferenceId = String(session?.client_reference_id || '').trim();
  return metadataRegistrationId || clientReferenceId;
}

function extractStripeSessionIdentifiers(session) {
  return {
    checkoutSessionId: getStripeStringId(session?.id),
    paymentIntentId: getStripeStringId(session?.payment_intent),
    customerId: getStripeStringId(session?.customer)
  };
}

function stripeUnixToIso(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return new Date(numeric * 1000).toISOString();
}

function isStripeSessionPaid(session, eventType) {
  const paymentStatus = String(session?.payment_status || '').trim().toLowerCase();
  if (paymentStatus === 'paid') return true;

  const normalizedEventType = String(eventType || '').trim();
  return normalizedEventType === 'checkout.session.async_payment_succeeded';
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = Number(statusCode) || 500;
  return error;
}

async function createStripeCheckoutSession(registration, options = {}) {
  if (!isStripeEnabled()) {
    throw createError(503, 'Stripe is not configured. Missing STRIPE_SECRET_KEY.');
  }

  const currency = String(registration.currency || 'EUR').toLowerCase();
  const amountMinor = toStripeMinorUnits(registration.amount ?? registration.amountHuf ?? 0, registration.currency || 'EUR');
  const packageLabel = PRICE_CATALOG.campType?.[registration.campType]?.label || 'Seminar package';
  const successUrl = buildStripeSuccessUrl(String(options.successUrl || STRIPE_SUCCESS_URL).trim(), registration.id);
  const cancelUrl = String(options.cancelUrl || STRIPE_CANCEL_URL).trim();

  const formBody = createStripeFormBody({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: registration.email,
    client_reference_id: registration.id,
    'metadata[registration_id]': registration.id,
    'metadata[source]': options.source || 'registration',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][unit_amount]': amountMinor,
    'line_items[0][price_data][product_data][name]': packageLabel,
    'line_items[0][price_data][product_data][description]': 'Ishido Sensei - Summer Seminar 2026'
  });

  const response = await fetch(`${STRIPE_API_BASE_URL}/checkout/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody,
    signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS)
  });

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const stripeMessage = payload?.error?.message || raw || 'Stripe API request failed.';
    throw createError(response.status >= 400 && response.status < 500 ? 400 : 502, `Stripe session creation failed: ${stripeMessage}`);
  }

  const checkoutUrl = String(payload?.url || '').trim();
  const sessionId = String(payload?.id || '').trim();
  if (!checkoutUrl || !sessionId) {
    throw createError(502, 'Stripe response did not include checkout URL.');
  }

  return {
    id: sessionId,
    url: checkoutUrl
  };
}

async function getStripeCheckoutSession(sessionId) {
  if (!isStripeEnabled()) {
    throw createError(503, 'Stripe is not configured. Missing STRIPE_SECRET_KEY.');
  }

  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) {
    throw createError(400, 'Stripe session ID is required.');
  }

  const response = await fetch(
    `${STRIPE_API_BASE_URL}/checkout/sessions/${encodeURIComponent(safeSessionId)}?expand[]=payment_intent`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${STRIPE_SECRET_KEY}`
      },
      signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS)
    }
  );

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const stripeMessage = payload?.error?.message || raw || 'Stripe API request failed.';
    throw createError(response.status >= 400 && response.status < 500 ? 400 : 502, `Stripe session query failed: ${stripeMessage}`);
  }

  if (!payload || payload.object !== 'checkout.session') {
    throw createError(502, 'Stripe session query returned an unexpected payload.');
  }

  return payload;
}

function isBrevoEnabled() {
  return EMAIL_PROVIDER === 'brevo' && BREVO_API_KEY.length > 0 && EMAIL_FROM.length > 0;
}

async function sendBrevoEmail({ toEmail, toName, subject, htmlContent, textContent }) {
  const payload = {
    sender: {
      email: EMAIL_FROM,
      name: EMAIL_FROM_NAME
    },
    to: [
      {
        email: toEmail,
        name: toName || ''
      }
    ],
    subject,
    htmlContent,
    textContent
  };

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    let details = '';
    try {
      details = await response.text();
    } catch {
      details = '';
    }
    throw new Error(`Brevo send failed (${response.status}): ${details}`);
  }

  return response.json().catch(() => ({}));
}

function listAdminEmailTemplates() {
  return ADMIN_EMAIL_TEMPLATES.map((item) => ({
    key: item.key,
    label: item.label,
    subject: item.subject,
    body: item.body
  }));
}

function resolveAdminEmailTemplate(templateKey) {
  const key = String(templateKey || '').trim();
  return ADMIN_EMAIL_TEMPLATES.find((item) => item.key === key) || null;
}

function getCampTypeLabel(code) {
  const key = String(code || '').trim();
  return PRICE_CATALOG.campType?.[key]?.label || key || '-';
}

function applyEmailTemplateVariables(text, registration) {
  const input = String(text || '');
  const fullName = String(registration?.fullName || '').trim();
  const firstName = fullName ? fullName.split(/\s+/)[0] : '';
  const mapping = {
    fullName,
    firstName,
    email: String(registration?.email || ''),
    registrationId: String(registration?.id || ''),
    campType: getCampTypeLabel(registration?.campType),
    status: String(registration?.status || ''),
    amount: formatCurrency(Number(registration?.amount ?? registration?.amountHuf ?? 0), registration?.currency || 'EUR'),
    currency: String(registration?.currency || 'EUR')
  };

  return input.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, token) => {
    const key = String(token || '');
    return Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : '';
  });
}

function plainTextToHtml(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '<p></p>';

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br />')}</p>`);

  return paragraphs.join('\n');
}

function getEligibleEmailRecipients(registrations) {
  return registrations.filter((item) => {
    const status = String(item?.status || '');
    const email = String(item?.email || '').trim();
    return status !== 'DELETED' && status !== 'ANONYMIZED' && email.length > 0;
  });
}

function selectEmailRecipients(registrations, mode, selectedIds) {
  const eligible = getEligibleEmailRecipients(registrations);
  const normalizedMode = String(mode || 'selected').trim();

  if (normalizedMode === 'all_active') {
    return eligible;
  }

  if (normalizedMode === 'paid') {
    return eligible.filter((item) => item.status === 'PAID');
  }

  if (normalizedMode === 'pending_payment') {
    return eligible.filter((item) => item.status === 'PENDING_PAYMENT');
  }

  const idSet = new Set(
    Array.isArray(selectedIds)
      ? selectedIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []
  );

  return eligible.filter((item) => idSet.has(String(item.id || '').trim()));
}

function insertAdminEmailLog(db, logEntry) {
  const insert = db.prepare(`
    INSERT INTO admin_email_logs (
      id,
      created_at,
      requested_by_ip,
      recipient_mode,
      recipient_count,
      success_count,
      failed_count,
      template_key,
      subject,
      failures_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    `mail_${randomUUID()}`,
    new Date().toISOString(),
    String(logEntry?.requestedByIp || ''),
    String(logEntry?.recipientMode || ''),
    Number(logEntry?.recipientCount || 0),
    Number(logEntry?.successCount || 0),
    Number(logEntry?.failedCount || 0),
    String(logEntry?.templateKey || ''),
    String(logEntry?.subject || ''),
    JSON.stringify(Array.isArray(logEntry?.failures) ? logEntry.failures : [])
  );
}

function isSzamlazzEnabled() {
  return SZAMLAZZ_ENABLED && SZAMLAZZ_AGENT_KEY.length > 0;
}

function toBooleanXml(value) {
  return value ? 'true' : 'false';
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function roundMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function formatMoneyXml(value) {
  return roundMoney(value).toFixed(2);
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function buildSzamlazzExternalId(registrationId) {
  const safeId = String(registrationId || '').trim();
  return `${SZAMLAZZ_EXTERNAL_ID_PREFIX}${safeId}`;
}

function calculateVatBreakdown(grossAmount, vatKey) {
  const gross = roundMoney(grossAmount);
  const rate = Number(String(vatKey || '').replace(',', '.'));
  if (Number.isFinite(rate) && rate > 0) {
    const net = roundMoney(gross / (1 + rate / 100));
    const vat = roundMoney(gross - net);
    return { net, vat, gross };
  }

  return { net: gross, vat: 0, gross };
}

function getRegistrationPackageLabel(registration) {
  const key = String(registration?.campType || '').trim();
  const base = PRICE_CATALOG.campType?.[key]?.label || 'Seminar package';
  return base;
}

function buildSzamlazzInvoiceXml(registration, options = {}) {
  const externalId = String(options.externalId || buildSzamlazzExternalId(registration.id)).trim();
  const invoiceDate = String(options.invoiceDate || getTodayDateString()).trim() || getTodayDateString();
  const dueDate = String(options.dueDate || invoiceDate).trim() || invoiceDate;
  const amount = Number(registration.amount ?? registration.amountHuf ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError(400, 'Invalid registration amount for invoice creation.');
  }

  const vatKey = String(options.vatKey || SZAMLAZZ_AFAKULCS).trim() || '0';
  const breakdown = calculateVatBreakdown(amount, vatKey);
  const description = String(options.description || getRegistrationPackageLabel(registration)).trim();

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">
  <beallitasok>
    <szamlaagentkulcs>${escapeXml(SZAMLAZZ_AGENT_KEY)}</szamlaagentkulcs>
    <eszamla>${toBooleanXml(SZAMLAZZ_ESZAMLA)}</eszamla>
    <szamlaLetoltes>false</szamlaLetoltes>
    <valaszVerzio>2</valaszVerzio>
    <szamlaKulsoAzon>${escapeXml(externalId)}</szamlaKulsoAzon>
  </beallitasok>
  <fejlec>
    <keltDatum>${escapeXml(invoiceDate)}</keltDatum>
    <teljesitesDatum>${escapeXml(invoiceDate)}</teljesitesDatum>
    <fizetesiHataridoDatum>${escapeXml(dueDate)}</fizetesiHataridoDatum>
    <fizmod>${escapeXml(SZAMLAZZ_PAYMENT_METHOD)}</fizmod>
    <penznem>${escapeXml(String(registration.currency || 'EUR').toUpperCase())}</penznem>
    <szamlaNyelve>${escapeXml(SZAMLAZZ_INVOICE_LANGUAGE)}</szamlaNyelve>
    <megjegyzes>${escapeXml(SZAMLAZZ_COMMENT)}</megjegyzes>
    <rendelesSzam>${escapeXml(registration.id)}</rendelesSzam>
    <fizetve>${toBooleanXml(SZAMLAZZ_SET_PAID)}</fizetve>
  </fejlec>
  <elado />
  <vevo>
    <nev>${escapeXml(registration.billingFullName || registration.fullName || '')}</nev>
    <irsz>${escapeXml(registration.billingZip || '')}</irsz>
    <telepules>${escapeXml(registration.billingCity || '')}</telepules>
    <cim>${escapeXml(registration.billingAddress || '')}</cim>
    <orszag>${escapeXml(registration.billingCountry || '')}</orszag>
    <email>${escapeXml(registration.email || '')}</email>
    <sendEmail>${toBooleanXml(SZAMLAZZ_SEND_EMAIL)}</sendEmail>
  </vevo>
  <tetelek>
    <tetel>
      <megnevezes>${escapeXml(description)}</megnevezes>
      <mennyiseg>1</mennyiseg>
      <mennyisegiEgyseg>db</mennyisegiEgyseg>
      <nettoEgysegar>${formatMoneyXml(breakdown.net)}</nettoEgysegar>
      <afakulcs>${escapeXml(vatKey)}</afakulcs>
      <nettoErtek>${formatMoneyXml(breakdown.net)}</nettoErtek>
      <afaErtek>${formatMoneyXml(breakdown.vat)}</afaErtek>
      <bruttoErtek>${formatMoneyXml(breakdown.gross)}</bruttoErtek>
    </tetel>
  </tetelek>
</xmlszamla>`;
}

function decodeBasicXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractXmlTag(xml, tagName) {
  const safeTag = String(tagName || '').replace(/[^\w:-]/g, '');
  if (!safeTag) return '';
  const regex = new RegExp(`<${safeTag}>([\\s\\S]*?)<\\/${safeTag}>`, 'i');
  const match = String(xml || '').match(regex);
  if (!match) return '';
  const raw = String(match[1] || '').trim();
  const cdataMatch = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  const normalized = cdataMatch ? cdataMatch[1] : raw;
  return decodeBasicXmlEntities(normalized.trim());
}

function parseSzamlazzResponse(xmlText) {
  const xml = String(xmlText || '').trim();
  const successToken = extractXmlTag(xml, 'sikeres').toLowerCase();
  const success = successToken === 'true' || successToken === '1';
  return {
    success,
    invoiceNumber: extractXmlTag(xml, 'szamlaszam') || extractXmlTag(xml, 'szamlaSorszam'),
    errorCode: extractXmlTag(xml, 'hibakod'),
    errorMessage: extractXmlTag(xml, 'hibauzenet') || extractXmlTag(xml, 'uzenet'),
    raw: xml
  };
}

function upsertInvoiceRecord(db, payload) {
  const upsert = db.prepare(`
    INSERT INTO invoice_records (
      id,
      registration_id,
      provider,
      status,
      trigger_source,
      invoice_number,
      external_id,
      net_amount,
      gross_amount,
      currency,
      request_xml,
      raw_response,
      error_code,
      error_message,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(registration_id) DO UPDATE SET
      status = excluded.status,
      trigger_source = excluded.trigger_source,
      invoice_number = excluded.invoice_number,
      external_id = excluded.external_id,
      net_amount = excluded.net_amount,
      gross_amount = excluded.gross_amount,
      currency = excluded.currency,
      request_xml = excluded.request_xml,
      raw_response = excluded.raw_response,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at
  `);

  const now = new Date().toISOString();
  upsert.run(
    `inv_${randomUUID()}`,
    String(payload.registrationId || '').trim(),
    'szamlazz_hu',
    String(payload.status || 'FAILED'),
    String(payload.triggerSource || 'manual'),
    String(payload.invoiceNumber || ''),
    String(payload.externalId || ''),
    roundMoney(payload.netAmount),
    roundMoney(payload.grossAmount),
    String(payload.currency || 'EUR'),
    String(payload.requestXml || ''),
    String(payload.rawResponse || ''),
    String(payload.errorCode || ''),
    String(payload.errorMessage || ''),
    now,
    now
  );
}

function getInvoiceRecordByRegistrationId(db, registrationId) {
  const row = db.prepare('SELECT * FROM invoice_records WHERE registration_id = ?').get(String(registrationId || '').trim());
  if (!row) return null;
  return {
    id: row.id,
    registrationId: row.registration_id,
    provider: row.provider,
    status: row.status,
    triggerSource: row.trigger_source,
    invoiceNumber: row.invoice_number || '',
    externalId: row.external_id || '',
    netAmount: Number(row.net_amount || 0),
    grossAmount: Number(row.gross_amount || 0),
    currency: row.currency || 'EUR',
    requestXml: row.request_xml || '',
    errorCode: row.error_code || '',
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function readInvoiceRecords(db, options = {}) {
  const rawLimit = Number(options.limit || 200);
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(Math.floor(rawLimit), 1000) : 200;

  const rows = db
    .prepare(`
      SELECT
        i.*,
        r.full_name AS registration_full_name,
        r.email AS registration_email
      FROM invoice_records i
      LEFT JOIN registrations r ON r.id = i.registration_id
      ORDER BY datetime(i.updated_at) DESC, i.rowid DESC
      LIMIT ?
    `)
    .all(limit);

  return rows.map((row) => ({
    id: row.id,
    registrationId: row.registration_id,
    registrationFullName: row.registration_full_name || '',
    registrationEmail: row.registration_email || '',
    provider: row.provider,
    status: row.status,
    triggerSource: row.trigger_source,
    invoiceNumber: row.invoice_number || '',
    externalId: row.external_id || '',
    netAmount: Number(row.net_amount || 0),
    grossAmount: Number(row.gross_amount || 0),
    currency: row.currency || 'EUR',
    requestXml: row.request_xml || '',
    rawResponse: row.raw_response || '',
    errorCode: row.error_code || '',
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function sendSzamlazzInvoice(xml) {
  const form = new FormData();
  form.append(
    'action-xmlagentxmlfile',
    new Blob([String(xml || '')], { type: 'application/xml; charset=UTF-8' }),
    'invoice.xml'
  );

  const response = await fetch(SZAMLAZZ_API_URL, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(SZAMLAZZ_REQUEST_TIMEOUT_MS)
  });

  const raw = await response.text();
  if (!response.ok) {
    throw createError(502, `Szamlazz.hu request failed (${response.status}).`);
  }

  return raw;
}

async function createInvoiceForRegistration(db, registrationId, options = {}) {
  if (!isSzamlazzEnabled()) {
    throw createError(503, 'Szamlazz.hu integration is not configured.');
  }

  const registration = getRegistrationById(db, registrationId);
  if (!registration) {
    throw createError(404, 'Registration not found.');
  }

  if (registration.status !== 'PAID') {
    throw createError(400, `Invoice can only be created for PAID registrations. Current status: ${registration.status}.`);
  }

  const existing = getInvoiceRecordByRegistrationId(db, registration.id);
  if (existing && existing.status === 'SUCCESS' && existing.invoiceNumber) {
    return {
      created: false,
      reused: true,
      invoice: existing
    };
  }

  const triggerSource = String(options.triggerSource || 'manual');
  const externalId = String(existing?.externalId || buildSzamlazzExternalId(registration.id)).trim();
  const invoiceXml = buildSzamlazzInvoiceXml(registration, {
    externalId,
    invoiceDate: options.invoiceDate,
    dueDate: options.dueDate
  });

  try {
    const rawResponse = await sendSzamlazzInvoice(invoiceXml);
    const parsed = parseSzamlazzResponse(rawResponse);
    if (!parsed.success) {
      const message = parsed.errorMessage || 'Szamlazz.hu returned an unsuccessful response.';
      await runWithSqliteRetry(() => upsertInvoiceRecord(db, {
        registrationId: registration.id,
        status: 'FAILED',
        triggerSource,
        invoiceNumber: parsed.invoiceNumber,
        externalId,
        netAmount: registration.amount,
        grossAmount: registration.amount,
        currency: registration.currency || 'EUR',
        requestXml: invoiceXml,
        rawResponse,
        errorCode: parsed.errorCode,
        errorMessage: message
      }));
      const error = createError(502, `Szamlazz.hu invoice creation failed: ${message}`);
      error.alreadyStored = true;
      throw error;
    }

    if (!parsed.invoiceNumber) {
      await runWithSqliteRetry(() => upsertInvoiceRecord(db, {
        registrationId: registration.id,
        status: 'FAILED',
        triggerSource,
        invoiceNumber: '',
        externalId,
        netAmount: registration.amount,
        grossAmount: registration.amount,
        currency: registration.currency || 'EUR',
        requestXml: invoiceXml,
        rawResponse,
        errorCode: parsed.errorCode || 'missing_invoice_number',
        errorMessage: 'Missing invoice number in Szamlazz.hu response.'
      }));
      const error = createError(502, 'Szamlazz.hu did not return an invoice number.');
      error.alreadyStored = true;
      throw error;
    }

    const breakdown = calculateVatBreakdown(Number(registration.amount ?? registration.amountHuf ?? 0), SZAMLAZZ_AFAKULCS);
    await runWithSqliteRetry(() => upsertInvoiceRecord(db, {
      registrationId: registration.id,
      status: 'SUCCESS',
      triggerSource,
      invoiceNumber: parsed.invoiceNumber,
      externalId,
      netAmount: breakdown.net,
      grossAmount: breakdown.gross,
      currency: registration.currency || 'EUR',
      requestXml: invoiceXml,
      rawResponse,
      errorCode: '',
      errorMessage: ''
    }));

    const stored = getInvoiceRecordByRegistrationId(db, registration.id);
    return {
      created: true,
      reused: false,
      invoice: stored
    };
  } catch (error) {
    if (isSqliteBusyError(error)) {
      throw createError(503, 'Database is currently busy. Please try again in a few seconds.');
    }

    if (!error?.alreadyStored) {
      try {
        await runWithSqliteRetry(() => upsertInvoiceRecord(db, {
          registrationId: registration.id,
          status: 'FAILED',
          triggerSource,
          invoiceNumber: '',
          externalId,
          netAmount: registration.amount,
          grossAmount: registration.amount,
          currency: registration.currency || 'EUR',
          requestXml: invoiceXml,
          rawResponse: '',
          errorCode: '',
          errorMessage: error.message || 'Unknown invoice error'
        }));
      } catch (storeError) {
        console.error(`Invoice failure log write failed for ${registration.id}: ${storeError.message}`);
      }
    }

    if (Number(error.statusCode)) {
      throw error;
    }

    throw createError(502, `Szamlazz.hu invoice request failed: ${error.message || 'Unknown error'}`);
  }
}

function buildRegistrationEmailContent(registration, pricing) {
  const participantNamePlain = String(registration.fullName || '').trim() || 'Participant';
  const participantName = escapeHtml(participantNamePlain);
  const registrationId = escapeHtml(registration.id || '');
  const totalRaw = Number(pricing.total ?? pricing.totalAmount ?? pricing.totalHuf ?? 0);
  const total = escapeHtml(formatCurrency(totalRaw, pricing.currency));
  const manageUrl = `${APP_BASE_URL}/admin`;
  const seminarDateLabel = '30 July - 3 August 2026 (Iaido & Jodo)';

  const participantHtml = `
    <h2>Successful Registration</h2>
    <p>Dear ${participantName},</p>
    <p>Thank you for registering for the Ishido Sensei Summer Seminar 2026. We are pleased to inform you that your registration and payment have been successfully processed.</p>
    <h3>Event Details</h3>
    <ul>
      <li><strong>Venue:</strong> Ludovika Arena, Budapest</li>
      <li><strong>Date:</strong> ${escapeHtml(seminarDateLabel)}</li>
      <li><strong>Registration ID:</strong> #${registrationId}</li>
    </ul>
    <p>Please have this email ready (digital or printed) upon arrival for a smooth check-in process. We will soon send out the detailed schedule and further practical information.</p>
    <p>We look forward to seeing you in the dojo.</p>
    <p>Best regards,<br />The Organizing Team</p>
  `;

  const participantText = [
    'Successful Registration',
    '',
    `Dear ${participantNamePlain},`,
    'Thank you for registering for the Ishido Sensei Summer Seminar 2026. We are pleased to inform you that your registration and payment have been successfully processed.',
    '',
    'Event Details:',
    '- Venue: Ludovika Arena, Budapest',
    `- Date: ${seminarDateLabel}`,
    `- Registration ID: #${registration.id}`,
    '',
    'Please have this email ready (digital or printed) upon arrival for a smooth check-in process. We will soon send out the detailed schedule and further practical information.',
    'We look forward to seeing you in the dojo.',
    '',
    'Best regards,',
    'The Organizing Team'
  ].join('\n');

  const adminHtml = `
    <h2>New Registration</h2>
    <p><strong>Name:</strong> ${participantName}<br />
       <strong>Email:</strong> ${escapeHtml(registration.email)}<br />
       <strong>Registration ID:</strong> ${registrationId}<br />
       <strong>Total:</strong> ${total}</p>
    <p><a href="${escapeHtml(manageUrl)}">Open admin panel</a></p>
  `;

  const adminText = [
    'New Registration',
    `Name: ${registration.fullName}`,
    `Email: ${registration.email}`,
    `Registration ID: ${registration.id}`,
    `Total: ${formatCurrency(totalRaw, pricing.currency)}`,
    `Open admin panel: ${manageUrl}`
  ].join('\n');

  return {
    participant: {
      subject: 'Confirmation: Successful Registration - Ishido Sensei Summer Seminar 2026',
      html: participantHtml,
      text: participantText
    },
    admin: {
      subject: `New registration - ${registration.id}`,
      html: adminHtml,
      text: adminText
    }
  };
}

async function sendRegistrationEmails(registration, pricing) {
  if (!isBrevoEnabled()) {
    return { enabled: false, sent: 0 };
  }

  const messages = buildRegistrationEmailContent(registration, pricing);
  const tasks = [
    sendBrevoEmail({
      toEmail: registration.email,
      toName: registration.fullName,
      subject: messages.participant.subject,
      htmlContent: messages.participant.html,
      textContent: messages.participant.text
    })
  ];

  if (ADMIN_NOTIFY_EMAIL) {
    tasks.push(
      sendBrevoEmail({
        toEmail: ADMIN_NOTIFY_EMAIL,
        toName: 'Admin',
        subject: messages.admin.subject,
        htmlContent: messages.admin.html,
        textContent: messages.admin.text
      })
    );
  }

  const settled = await Promise.allSettled(tasks);
  const rejected = settled.filter((result) => result.status === 'rejected');
  if (rejected.length > 0) {
    const reason = rejected.map((item) => String(item.reason?.message || item.reason || 'Unknown email error')).join(' | ');
    throw new Error(reason);
  }

  return { enabled: true, sent: settled.length };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureBackupDir() {
  if (!fs.existsSync(DB_BACKUP_DIR)) {
    fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
  }
}

function formatBackupTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function toSqliteStringLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function cleanupOldBackups() {
  ensureBackupDir();
  const entries = fs.readdirSync(DB_BACKUP_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^camp-backup-\d{8}-\d{6}\.db$/.test(entry.name))
    .map((entry) => path.join(DB_BACKUP_DIR, entry.name));

  if (files.length === 0) return;

  const cutoffMs = Date.now() - DB_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const filePath of files) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < cutoffMs) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors to avoid breaking the backup cycle.
    }
  }
}

function createDatabaseBackup(db) {
  ensureBackupDir();
  const timestamp = formatBackupTimestamp(new Date());
  const backupFile = path.join(DB_BACKUP_DIR, `camp-backup-${timestamp}.db`);
  const escapedBackupPath = toSqliteStringLiteral(backupFile);
  db.exec(`VACUUM INTO '${escapedBackupPath}'`);
  cleanupOldBackups();
  return backupFile;
}

function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function scheduleDailyBackups(db) {
  if (!DB_BACKUP_ENABLED) {
    console.log('SQLite backup scheduler disabled (DB_BACKUP_ENABLED=false).');
    return () => {};
  }

  let timer = null;

  const scheduleNext = () => {
    const delayMs = msUntilNextMidnight();
    timer = setTimeout(async () => {
      try {
        const backupFile = await runWithSqliteRetry(() => createDatabaseBackup(db));
        console.log(`SQLite backup created: ${backupFile}`);
      } catch (error) {
        console.error(`SQLite backup failed: ${error.message}`);
      } finally {
        scheduleNext();
      }
    }, delayMs);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  };

  scheduleNext();
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
  };
}

function initDatabase() {
  ensureDataDir();
  const db = new DatabaseSync(DB_FILE);

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);

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
      current_grade_iaido TEXT NOT NULL DEFAULT '',
      current_grade_jodo TEXT NOT NULL DEFAULT '',
      camp_type TEXT NOT NULL,
      meal_plan TEXT NOT NULL,
      accommodation TEXT NOT NULL,
      wants_exam INTEGER NOT NULL,
      target_grade TEXT,
      wants_exam_iaido INTEGER NOT NULL DEFAULT 0,
      target_grade_iaido TEXT,
      wants_exam_jodo INTEGER NOT NULL DEFAULT 0,
      target_grade_jodo TEXT,
      billing_full_name TEXT NOT NULL,
      billing_zip TEXT NOT NULL,
      billing_city TEXT NOT NULL,
      billing_address TEXT NOT NULL,
      billing_country TEXT NOT NULL,
      food_notes TEXT,
      price_breakdown TEXT NOT NULL,
      stripe_checkout_session_id TEXT NOT NULL DEFAULT '',
      stripe_payment_intent_id TEXT NOT NULL DEFAULT '',
      stripe_customer_id TEXT NOT NULL DEFAULT '',
      stripe_last_event_type TEXT NOT NULL DEFAULT '',
      stripe_last_event_at TEXT NOT NULL DEFAULT '',
      paid_at TEXT NOT NULL DEFAULT '',
      privacy_consent INTEGER NOT NULL,
      terms_consent INTEGER NOT NULL,
      privacy_policy_version TEXT NOT NULL DEFAULT '',
      terms_version TEXT NOT NULL DEFAULT '',
      privacy_consent_at TEXT NOT NULL DEFAULT '',
      terms_consent_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at);
    CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_records (
      id TEXT PRIMARY KEY,
      registration_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger_source TEXT NOT NULL,
      invoice_number TEXT,
      external_id TEXT,
      net_amount REAL,
      gross_amount REAL,
      currency TEXT NOT NULL,
      request_xml TEXT NOT NULL DEFAULT '',
      raw_response TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_records_status ON invoice_records(status);
    CREATE INDEX IF NOT EXISTS idx_invoice_records_registration ON invoice_records(registration_id);

    CREATE TABLE IF NOT EXISTS admin_email_logs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      requested_by_ip TEXT NOT NULL,
      recipient_mode TEXT NOT NULL,
      recipient_count INTEGER NOT NULL,
      success_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      template_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      failures_json TEXT NOT NULL
    );
  `);

  ensureRegistrationColumns(db);
  ensureInvoiceRecordColumns(db);
  migrateLegacyJsonIfNeeded(db);
  ensureAdminAuth(db);
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
  if (!columnNames.has('current_grade_iaido')) {
    db.exec("ALTER TABLE registrations ADD COLUMN current_grade_iaido TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('current_grade_jodo')) {
    db.exec("ALTER TABLE registrations ADD COLUMN current_grade_jodo TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('wants_exam_iaido')) {
    db.exec("ALTER TABLE registrations ADD COLUMN wants_exam_iaido INTEGER NOT NULL DEFAULT 0;");
  }
  if (!columnNames.has('target_grade_iaido')) {
    db.exec("ALTER TABLE registrations ADD COLUMN target_grade_iaido TEXT;");
  }
  if (!columnNames.has('wants_exam_jodo')) {
    db.exec("ALTER TABLE registrations ADD COLUMN wants_exam_jodo INTEGER NOT NULL DEFAULT 0;");
  }
  if (!columnNames.has('target_grade_jodo')) {
    db.exec("ALTER TABLE registrations ADD COLUMN target_grade_jodo TEXT;");
  }
  if (!columnNames.has('privacy_policy_version')) {
    db.exec("ALTER TABLE registrations ADD COLUMN privacy_policy_version TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('terms_version')) {
    db.exec("ALTER TABLE registrations ADD COLUMN terms_version TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('privacy_consent_at')) {
    db.exec("ALTER TABLE registrations ADD COLUMN privacy_consent_at TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('terms_consent_at')) {
    db.exec("ALTER TABLE registrations ADD COLUMN terms_consent_at TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('stripe_checkout_session_id')) {
    db.exec("ALTER TABLE registrations ADD COLUMN stripe_checkout_session_id TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('stripe_payment_intent_id')) {
    db.exec("ALTER TABLE registrations ADD COLUMN stripe_payment_intent_id TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('stripe_customer_id')) {
    db.exec("ALTER TABLE registrations ADD COLUMN stripe_customer_id TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('stripe_last_event_type')) {
    db.exec("ALTER TABLE registrations ADD COLUMN stripe_last_event_type TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('stripe_last_event_at')) {
    db.exec("ALTER TABLE registrations ADD COLUMN stripe_last_event_at TEXT NOT NULL DEFAULT '';");
  }
  if (!columnNames.has('paid_at')) {
    db.exec("ALTER TABLE registrations ADD COLUMN paid_at TEXT NOT NULL DEFAULT '';");
  }

  db.exec(`
    UPDATE registrations
    SET
      wants_exam_iaido = CASE WHEN wants_exam = 1 THEN 1 ELSE wants_exam_iaido END,
      target_grade_iaido = CASE
        WHEN wants_exam = 1 AND COALESCE(target_grade_iaido, '') = '' THEN COALESCE(target_grade, '')
        ELSE target_grade_iaido
      END
    WHERE wants_exam = 1 AND wants_exam_iaido = 0 AND wants_exam_jodo = 0
  `);

  db.exec(`
    UPDATE registrations
    SET
      current_grade_iaido = CASE
        WHEN COALESCE(current_grade_iaido, '') = '' THEN COALESCE(current_grade, '')
        ELSE current_grade_iaido
      END
    WHERE COALESCE(current_grade_iaido, '') = ''
  `);
}

function ensureInvoiceRecordColumns(db) {
  const columns = db.prepare('PRAGMA table_info(invoice_records)').all();
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('request_xml')) {
    db.exec("ALTER TABLE invoice_records ADD COLUMN request_xml TEXT NOT NULL DEFAULT '';");
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
      full_name, email, phone, date_of_birth, city, current_grade, current_grade_iaido, current_grade_jodo,
      camp_type, meal_plan, accommodation,
      wants_exam, target_grade, wants_exam_iaido, target_grade_iaido, wants_exam_jodo, target_grade_jodo,
      billing_full_name, billing_zip, billing_city, billing_address, billing_country,
      food_notes, price_breakdown, privacy_consent, terms_consent,
      privacy_policy_version, terms_version, privacy_consent_at, terms_consent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const item of legacy) {
      const pricing = calculatePricing({
        campType: item.campType || 'iaido',
        mealPlan: item.mealPlan || 'none',
        accommodation: item.accommodation || 'none'
      });
      const wantsExamIaido = Boolean(item.wantsExamIaido ?? item.wantsExam);
      const wantsExamJodo = Boolean(item.wantsExamJodo);
      const currentGradeIaido = String(item.currentGradeIaido || item.currentGrade || '');
      const currentGradeJodo = String(item.currentGradeJodo || '');
      const currentGradeLegacy = currentGradeIaido || currentGradeJodo;
      const targetGradeIaido = wantsExamIaido ? String(item.targetGradeIaido || item.targetGrade || '') : '';
      const targetGradeJodo = wantsExamJodo ? String(item.targetGradeJodo || '') : '';
      const wantsExamCombined = wantsExamIaido || wantsExamJodo;
      const targetGradeCombined = targetGradeIaido || targetGradeJodo;

      insert.run(
        item.id || `reg_${randomUUID()}`,
        item.createdAt || new Date().toISOString(),
        item.status || 'PENDING_PAYMENT',
        Number(item.amount ?? item.amountHuf ?? pricing.totalAmount ?? pricing.totalHuf),
        'EUR',
        String(item.fullName || ''),
        String(item.email || ''),
        String(item.phone || ''),
        String(item.dateOfBirth || ''),
        String(item.city || ''),
        currentGradeLegacy,
        currentGradeIaido,
        currentGradeJodo,
        pricing.selection.campType,
        pricing.selection.mealPlan,
        pricing.selection.accommodation,
        wantsExamCombined ? 1 : 0,
        targetGradeCombined,
        wantsExamIaido ? 1 : 0,
        targetGradeIaido,
        wantsExamJodo ? 1 : 0,
        targetGradeJodo,
        String(item.billingFullName || ''),
        String(item.billingZip || ''),
        String(item.billingCity || ''),
        String(item.billingAddress || ''),
        String(item.billingCountry || 'Hungary'),
        String(item.foodNotes || ''),
        JSON.stringify(pricing),
        item.privacyConsent ? 1 : 0,
        item.termsConsent ? 1 : 0,
        String(item.privacyPolicyVersion || ''),
        String(item.termsVersion || ''),
        String(item.privacyConsentAt || ''),
        String(item.termsConsentAt || '')
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

  const currentGradeIaido = row.current_grade_iaido || row.current_grade || '';
  const currentGradeJodo = row.current_grade_jodo || '';
  const wantsExamIaido = row.wants_exam_iaido === 1 || (row.wants_exam === 1 && row.wants_exam_jodo !== 1);
  const wantsExamJodo = row.wants_exam_jodo === 1;
  const targetGradeIaido = wantsExamIaido ? row.target_grade_iaido || row.target_grade || '' : row.target_grade_iaido || '';
  const targetGradeJodo = wantsExamJodo ? row.target_grade_jodo || '' : row.target_grade_jodo || '';

  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    amount: Number(row.amount_huf || 0),
    amountHuf: Number(row.amount_huf || 0),
    currency: row.currency,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    dateOfBirth: row.date_of_birth || '',
    city: row.city,
    currentGradeIaido,
    currentGradeJodo,
    currentGrade: currentGradeIaido || currentGradeJodo || row.current_grade || '',
    campType: row.camp_type || 'iaido',
    mealPlan: row.meal_plan || 'none',
    accommodation: row.accommodation || 'none',
    wantsExamIaido,
    targetGradeIaido,
    wantsExamJodo,
    targetGradeJodo,
    wantsExam: wantsExamIaido || wantsExamJodo || row.wants_exam === 1,
    targetGrade: targetGradeIaido || targetGradeJodo || row.target_grade || '',
    billingFullName: row.billing_full_name,
    billingZip: row.billing_zip,
    billingCity: row.billing_city,
    billingAddress: row.billing_address,
    billingCountry: row.billing_country,
    foodNotes: row.food_notes || '',
    priceBreakdown,
    stripeCheckoutSessionId: row.stripe_checkout_session_id || '',
    stripePaymentIntentId: row.stripe_payment_intent_id || '',
    stripeCustomerId: row.stripe_customer_id || '',
    stripeLastEventType: row.stripe_last_event_type || '',
    stripeLastEventAt: row.stripe_last_event_at || '',
    paidAt: row.paid_at || '',
    privacyConsent: row.privacy_consent === 1,
    termsConsent: row.terms_consent === 1,
    privacyPolicyVersion: row.privacy_policy_version || '',
    termsVersion: row.terms_version || '',
    privacyConsentAt: row.privacy_consent_at || '',
    termsConsentAt: row.terms_consent_at || ''
  };
}

function readRegistrations(db) {
  const rows = db
    .prepare('SELECT * FROM registrations ORDER BY datetime(created_at) ASC, rowid ASC')
    .all();

  return rows.map(mapRegistrationRow);
}

function getRegistrationById(db, registrationId) {
  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(String(registrationId || '').trim());
  if (!row) return null;
  return mapRegistrationRow(row);
}

function getRegistrationByStripeCheckoutSessionId(db, sessionId) {
  const row = db
    .prepare('SELECT * FROM registrations WHERE stripe_checkout_session_id = ?')
    .get(String(sessionId || '').trim());
  if (!row) return null;
  return mapRegistrationRow(row);
}

function updateRegistrationStripeTracking(db, registrationId, tracking = {}) {
  const current = getRegistrationById(db, registrationId);
  if (!current) return 0;

  const nextCheckoutSessionId = String(tracking.checkoutSessionId || current.stripeCheckoutSessionId || '').trim();
  const nextPaymentIntentId = String(tracking.paymentIntentId || current.stripePaymentIntentId || '').trim();
  const nextCustomerId = String(tracking.customerId || current.stripeCustomerId || '').trim();
  const nextEventType = String(tracking.lastEventType || current.stripeLastEventType || '').trim();
  const nextEventAt = String(tracking.lastEventAt || current.stripeLastEventAt || '').trim();
  const nextPaidAt = String(tracking.paidAt || current.paidAt || '').trim();

  const update = db.prepare(`
    UPDATE registrations
    SET
      stripe_checkout_session_id = ?,
      stripe_payment_intent_id = ?,
      stripe_customer_id = ?,
      stripe_last_event_type = ?,
      stripe_last_event_at = ?,
      paid_at = ?
    WHERE id = ?
  `);

  const result = update.run(
    nextCheckoutSessionId,
    nextPaymentIntentId,
    nextCustomerId,
    nextEventType,
    nextEventAt,
    nextPaidAt,
    String(registrationId || '').trim()
  );

  return Number(result.changes || 0);
}

function syncRegistrationFromStripeSession(db, session, options = {}) {
  const eventType = String(options.eventType || '').trim();
  const eventCreatedAt = String(options.eventCreatedAt || '').trim() || new Date().toISOString();
  const identifiers = extractStripeSessionIdentifiers(session);

  let registrationId = extractRegistrationIdFromStripeSession(session);
  if (!registrationId && identifiers.checkoutSessionId) {
    const bySession = getRegistrationByStripeCheckoutSessionId(db, identifiers.checkoutSessionId);
    registrationId = bySession?.id || '';
  }
  if (!registrationId) {
    return {
      registrationId: '',
      found: false,
      paid: isStripeSessionPaid(session, eventType),
      statusChanged: false
    };
  }

  const existing = getRegistrationById(db, registrationId);
  if (!existing) {
    return {
      registrationId: '',
      found: false,
      paid: isStripeSessionPaid(session, eventType),
      statusChanged: false
    };
  }

  updateRegistrationStripeTracking(db, registrationId, {
    checkoutSessionId: identifiers.checkoutSessionId,
    paymentIntentId: identifiers.paymentIntentId,
    customerId: identifiers.customerId,
    lastEventType: eventType,
    lastEventAt: eventCreatedAt,
    paidAt: isStripeSessionPaid(session, eventType) ? eventCreatedAt : ''
  });

  const paid = isStripeSessionPaid(session, eventType);
  let statusChanged = false;
  if (paid) {
    statusChanged = updateRegistrationStatus(db, registrationId, 'PAID', { paidAt: eventCreatedAt }) > 0;
  }

  return {
    registrationId,
    found: true,
    paid,
    statusChanged,
    checkoutSessionId: identifiers.checkoutSessionId,
    paymentIntentId: identifiers.paymentIntentId,
    customerId: identifiers.customerId
  };
}

async function createCheckoutSessionForRegistration(db, registrationId, options = {}) {
  const registration = getRegistrationById(db, registrationId);
  if (!registration) {
    throw createError(404, 'Registration not found.');
  }

  if (registration.status === 'PAID') {
    throw createError(400, 'Registration is already paid.');
  }
  if (registration.status === 'DELETED' || registration.status === 'ANONYMIZED') {
    throw createError(400, `Cannot create payment session for status: ${registration.status}.`);
  }

  const successUrl = options.successUrl || STRIPE_SUCCESS_URL;
  const cancelUrl = options.cancelUrl || STRIPE_CANCEL_URL;

  const session = await createStripeCheckoutSession(registration, {
    ...options,
    successUrl,
    cancelUrl
  });

  try {
    await runWithSqliteRetry(() => updateRegistrationStripeTracking(db, registration.id, {
      checkoutSessionId: session.id,
      lastEventType: 'checkout.session.created',
      lastEventAt: new Date().toISOString()
    }));
  } catch (error) {
    console.error(`Stripe session tracking update failed for ${registration.id}: ${error.message}`);
  }

  return {
    registration,
    session
  };
}

function insertRegistration(db, registration) {
  const currentGradeIaido = String(registration.currentGradeIaido || '').trim();
  const currentGradeJodo = String(registration.currentGradeJodo || '').trim();
  const currentGradeLegacy = currentGradeIaido || currentGradeJodo || String(registration.currentGrade || '').trim();
  const wantsExamCombined = registration.wantsExamIaido || registration.wantsExamJodo;
  const targetGradeCombined = registration.targetGradeIaido || registration.targetGradeJodo || '';

  const insert = db.prepare(`
    INSERT INTO registrations (
      id, created_at, status, amount_huf, currency,
      full_name, email, phone, date_of_birth, city, current_grade, current_grade_iaido, current_grade_jodo,
      camp_type, meal_plan, accommodation,
      wants_exam, target_grade, wants_exam_iaido, target_grade_iaido, wants_exam_jodo, target_grade_jodo,
      billing_full_name, billing_zip, billing_city, billing_address, billing_country,
      food_notes, price_breakdown,
      stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id, stripe_last_event_type, stripe_last_event_at, paid_at,
      privacy_consent, terms_consent,
      privacy_policy_version, terms_version, privacy_consent_at, terms_consent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    registration.id,
    registration.createdAt,
    registration.status,
    Number(registration.amount ?? registration.amountHuf ?? 0),
    registration.currency,
    registration.fullName,
    registration.email,
    registration.phone,
    registration.dateOfBirth,
    registration.city,
    currentGradeLegacy,
    currentGradeIaido,
    currentGradeJodo,
    registration.campType,
    registration.mealPlan,
    registration.accommodation,
    wantsExamCombined ? 1 : 0,
    targetGradeCombined,
    registration.wantsExamIaido ? 1 : 0,
    registration.targetGradeIaido,
    registration.wantsExamJodo ? 1 : 0,
    registration.targetGradeJodo,
    registration.billingFullName,
    registration.billingZip,
    registration.billingCity,
    registration.billingAddress,
    registration.billingCountry,
    registration.foodNotes,
    JSON.stringify(registration.priceBreakdown),
    String(registration.stripeCheckoutSessionId || ''),
    String(registration.stripePaymentIntentId || ''),
    String(registration.stripeCustomerId || ''),
    String(registration.stripeLastEventType || ''),
    String(registration.stripeLastEventAt || ''),
    String(registration.paidAt || ''),
    registration.privacyConsent ? 1 : 0,
    registration.termsConsent ? 1 : 0,
    registration.privacyPolicyVersion || '',
    registration.termsVersion || '',
    registration.privacyConsentAt || '',
    registration.termsConsentAt || ''
  );
}

function updateRegistrationStatus(db, registrationId, status, options = {}) {
  const normalizedStatus = String(status || '').trim();
  const safeRegistrationId = String(registrationId || '').trim();

  if (normalizedStatus === 'PAID') {
    const paidAt = String(options.paidAt || new Date().toISOString()).trim();
    const updatePaid = db.prepare(`
      UPDATE registrations
      SET
        status = ?,
        paid_at = CASE
          WHEN COALESCE(paid_at, '') = '' THEN ?
          ELSE paid_at
        END
      WHERE id = ?
    `);
    const result = updatePaid.run(normalizedStatus, paidAt, safeRegistrationId);
    return Number(result.changes || 0);
  }

  const update = db.prepare('UPDATE registrations SET status = ? WHERE id = ?');
  const result = update.run(normalizedStatus, safeRegistrationId);
  return Number(result.changes || 0);
}

function anonymizeRegistration(db, registrationId) {
  const anonymizedEmail = `anonymized-${registrationId}@example.invalid`;
  const update = db.prepare(`
    UPDATE registrations
    SET
      status = 'ANONYMIZED',
      full_name = 'ANONYMIZED',
      email = ?,
      phone = '',
      date_of_birth = '',
      city = '',
      billing_full_name = '',
      billing_zip = '',
      billing_city = '',
      billing_address = '',
      billing_country = '',
      food_notes = ''
    WHERE id = ?
  `);

  const result = update.run(anonymizedEmail, registrationId);
  return Number(result.changes || 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSqliteBusyError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === 'SQLITE_BUSY' ||
    code === 'SQLITE_LOCKED' ||
    /database is locked/i.test(message) ||
    /database is busy/i.test(message)
  );
}

async function runWithSqliteRetry(operation) {
  for (let attempt = 1; attempt <= SQLITE_RETRY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      const shouldRetry = isSqliteBusyError(error) && attempt < SQLITE_RETRY_MAX_ATTEMPTS;
      if (!shouldRetry) {
        throw error;
      }

      const delay = SQLITE_RETRY_BASE_DELAY_MS * attempt;
      await sleep(delay);
    }
  }

  throw new Error('SQLite retry exhausted.');
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

function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
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

function isValidPostalCode(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 16) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9\s-]*$/.test(normalized)) return false;
  return /[A-Za-z0-9]/.test(normalized);
}

function isValidDateOfBirth(value) {
  if (!value) return true;
  if (typeof value !== 'string') return false;

  const normalized = value.trim();
  const match = normalized.match(/^(\d{4})[.-](\d{2})[.-](\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    Number.isInteger(year) &&
    year >= 1900 &&
    year <= 2100 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const GRADE_ORDER = [
  'Mukyu',
  '2. kyu',
  '1. kyu',
  '1. dan',
  '2. dan',
  '3. dan',
  '4. dan',
  '5. dan',
  '6. dan',
  '7. dan',
  '8. dan'
];

const EXAM_ALLOWED_TARGET_GRADES = new Set(['2. kyu', '1. kyu', '1. dan', '2. dan', '3. dan', '4. dan', '5. dan']);

function getNextGrade(currentGrade) {
  const normalized = String(currentGrade || '').trim();
  const index = GRADE_ORDER.indexOf(normalized);
  if (index < 0) return '';
  return GRADE_ORDER[index + 1] || '';
}

function isValidNextExamTarget(currentGrade, targetGrade) {
  const normalizedTarget = String(targetGrade || '').trim();
  const nextGrade = getNextGrade(currentGrade);
  if (!nextGrade) return false;
  if (!EXAM_ALLOWED_TARGET_GRADES.has(nextGrade)) return false;
  return normalizedTarget === nextGrade;
}

function sanitizePayload(payload, pricingSettings = DEFAULT_PRICING_SETTINGS) {
  const fallbackTargetGradeIaido = payload.targetGradeIaido ?? payload.targetGrade ?? '';
  const fallbackCurrentGradeIaido = payload.currentGradeIaido ?? payload.currentGrade ?? '';
  const wantsExamIaido = Boolean(payload.wantsExamIaido ?? payload.wantsExam);
  const wantsExamJodo = Boolean(payload.wantsExamJodo);
  const campType = toEnumValue(payload.campType, pricingSettings.prices.campType, 'iaido');
  const mealPlan = toEnumValue(payload.mealPlan, pricingSettings.prices.mealPlan, 'none');
  const accommodation = toEnumValue(payload.accommodation, pricingSettings.prices.accommodation, 'none');

  return {
    fullName: String(payload.fullName || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: String(payload.phone || '').trim(),
    dateOfBirth: String(payload.dateOfBirth || '').trim(),
    city: String(payload.city || '').trim(),
    currentGradeIaido: String(fallbackCurrentGradeIaido).trim(),
    currentGradeJodo: String(payload.currentGradeJodo || '').trim(),
    campType,
    mealPlan,
    accommodation,
    wantsExamIaido,
    targetGradeIaido: wantsExamIaido ? String(fallbackTargetGradeIaido).trim() : '',
    wantsExamJodo,
    targetGradeJodo: wantsExamJodo ? String(payload.targetGradeJodo || '').trim() : '',
    billingFullName: String(payload.billingFullName || '').trim(),
    billingZip: String(payload.billingZip || '').trim(),
    billingCity: String(payload.billingCity || '').trim(),
    billingAddress: String(payload.billingAddress || '').trim(),
    billingCountry: String(payload.billingCountry || 'Hungary').trim(),
    foodNotes: String(payload.foodNotes || '').trim(),
    privacyConsent: Boolean(payload.privacyConsent),
    termsConsent: Boolean(payload.termsConsent)
  };
}

function validateRegistration(data, pricingSettings = DEFAULT_PRICING_SETTINGS) {
  const errors = [];

  if (!isNonEmptyString(data.fullName)) errors.push('Full name is required.');
  if (!isValidEmail(data.email)) errors.push('A valid email address is required.');
  if (!isValidPhone(data.phone)) errors.push('A valid phone number is required.');
  if (!isValidDateOfBirth(data.dateOfBirth)) errors.push('Date of birth format is invalid.');
  if (!isNonEmptyString(data.city)) errors.push('City is required.');

  const needsIaidoGrade = data.campType === 'iaido' || data.campType === 'both' || data.wantsExamIaido;
  const needsJodoGrade = data.campType === 'jodo' || data.campType === 'both' || data.wantsExamJodo;
  if (needsIaidoGrade && !isNonEmptyString(data.currentGradeIaido)) {
    errors.push('Current Iaido grade is required for the selected option.');
  }
  if (needsJodoGrade && !isNonEmptyString(data.currentGradeJodo)) {
    errors.push('Current Jodo grade is required for the selected option.');
  }
  if (!Object.prototype.hasOwnProperty.call(pricingSettings.prices.campType, data.campType)) {
    errors.push('Invalid seminar selection.');
  }
  if (!Object.prototype.hasOwnProperty.call(pricingSettings.prices.mealPlan, data.mealPlan)) {
    errors.push('Invalid meal option.');
  }
  if (!Object.prototype.hasOwnProperty.call(pricingSettings.prices.accommodation, data.accommodation)) {
    errors.push('Invalid accommodation option.');
  }

  if (data.wantsExamIaido && !isNonEmptyString(data.targetGradeIaido)) {
    errors.push('Iaido target grade is required if Iaido exam is selected.');
  }
  if (
    data.wantsExamIaido &&
    isNonEmptyString(data.currentGradeIaido) &&
    isNonEmptyString(data.targetGradeIaido) &&
    !isValidNextExamTarget(data.currentGradeIaido, data.targetGradeIaido)
  ) {
    errors.push('Iaido exam target grade must be exactly one level above the current Iaido grade.');
  }

  if (data.wantsExamJodo && !isNonEmptyString(data.targetGradeJodo)) {
    errors.push('Jodo target grade is required if Jodo exam is selected.');
  }
  if (
    data.wantsExamJodo &&
    isNonEmptyString(data.currentGradeJodo) &&
    isNonEmptyString(data.targetGradeJodo) &&
    !isValidNextExamTarget(data.currentGradeJodo, data.targetGradeJodo)
  ) {
    errors.push('Jodo exam target grade must be exactly one level above the current Jodo grade.');
  }

  if (data.wantsExamIaido && data.campType === 'jodo') {
    errors.push('Iaido exam can only be selected with Iaido or Iaido + Jodo participation.');
  }
  if (data.wantsExamJodo && data.campType === 'iaido') {
    errors.push('Jodo exam can only be selected with Jodo or Iaido + Jodo participation.');
  }

  if (!isNonEmptyString(data.billingFullName)) errors.push('Billing full name is required.');
  if (!isValidPostalCode(data.billingZip)) errors.push('Billing postal code format is invalid.');
  if (!isNonEmptyString(data.billingCity)) errors.push('Billing city is required.');
  if (!isNonEmptyString(data.billingAddress)) errors.push('Billing address is required.');
  if (!isNonEmptyString(data.billingCountry)) errors.push('Billing country is required.');
  if (String(data.foodNotes || '').length > 4000) errors.push('Note cannot exceed 4000 characters.');
  if (!data.privacyConsent) errors.push('Privacy consent is required.');
  if (!data.termsConsent) errors.push('Accepting participation terms is required.');

  return errors;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function buildRetryPaymentPage({ title, message, registration }) {
  const safeTitle = escapeHtml(title || 'Retry Payment');
  const safeMessage = escapeHtml(message || '');
  const details = registration
    ? `
      <div class="box">
        <p><strong>Name:</strong> ${escapeHtml(registration.fullName || '-')}</p>
        <p><strong>Email:</strong> ${escapeHtml(registration.email || '-')}</p>
        <p><strong>Registration ID:</strong> ${escapeHtml(registration.id || '-')}</p>
        <p><strong>Amount:</strong> ${escapeHtml(formatCurrency(registration.amount ?? registration.amountHuf ?? 0, registration.currency || 'EUR'))}</p>
        <p><strong>Status:</strong> ${escapeHtml(registration.status || '-')}</p>
      </div>
    `
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: "Trebuchet MS", sans-serif; margin: 0; padding: 2rem 1rem; background: #eef4fb; color: #18344f; }
      .wrap { max-width: 760px; margin: 0 auto; }
      .card { background: #fff; border: 1px solid #c8d9eb; border-radius: 14px; padding: 1.2rem; }
      h1 { margin-top: 0; font-family: "Palatino Linotype", serif; }
      .box { margin-top: 1rem; padding: 0.8rem; border: 1px solid #d7e5f3; border-radius: 10px; background: #f8fbff; }
      p { margin: 0.35rem 0; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${safeTitle}</h1>
        <p>${safeMessage}</p>
        ${details}
      </div>
    </div>
  </body>
</html>`;
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? '');
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildCsvExport(registrations) {
  const headers = [
    'id',
    'created_at',
    'status',
    'full_name',
    'email',
    'phone',
    'city',
    'current_grade_iaido',
    'current_grade_jodo',
    'camp_type',
    'meal_plan',
    'accommodation',
    'wants_exam_iaido',
    'target_grade_iaido',
    'wants_exam_jodo',
    'target_grade_jodo',
    'camp_price',
    'meal_price',
    'accommodation_price',
    'amount',
    'currency',
    'billing_full_name',
    'billing_zip',
    'billing_city',
    'billing_address',
    'billing_country',
    'food_notes',
    'stripe_checkout_session_id',
    'stripe_payment_intent_id',
    'stripe_customer_id',
    'stripe_last_event_type',
    'stripe_last_event_at',
    'paid_at',
    'privacy_consent',
    'terms_consent',
    'privacy_policy_version',
    'terms_version',
    'privacy_consent_at',
    'terms_consent_at'
  ];

  const csvRows = [headers.map(escapeCsvValue).join(',')];

  for (const registration of registrations) {
    const lineItems = Array.isArray(registration.priceBreakdown?.lineItems)
      ? registration.priceBreakdown.lineItems
      : [];

    const campItem = lineItems.find((item) => item.key === 'campType');
    const mealItem = lineItems.find((item) => item.key === 'mealPlan');
    const accommodationItem = lineItems.find((item) => item.key === 'accommodation');
    const campPrice = campItem?.amount ?? campItem?.amountHuf ?? '';
    const mealPrice = mealItem?.amount ?? mealItem?.amountHuf ?? '';
    const accommodationPrice = accommodationItem?.amount ?? accommodationItem?.amountHuf ?? '';

    const row = [
      registration.id,
      registration.createdAt,
      registration.status,
      registration.fullName,
      registration.email,
      registration.phone,
      registration.city,
      registration.currentGradeIaido,
      registration.currentGradeJodo,
      registration.campType,
      registration.mealPlan,
      registration.accommodation,
      registration.wantsExamIaido ? 'true' : 'false',
      registration.targetGradeIaido,
      registration.wantsExamJodo ? 'true' : 'false',
      registration.targetGradeJodo,
      campPrice,
      mealPrice,
      accommodationPrice,
      registration.amount ?? registration.amountHuf,
      registration.currency,
      registration.billingFullName,
      registration.billingZip,
      registration.billingCity,
      registration.billingAddress,
      registration.billingCountry,
      registration.foodNotes,
      registration.stripeCheckoutSessionId,
      registration.stripePaymentIntentId,
      registration.stripeCustomerId,
      registration.stripeLastEventType,
      registration.stripeLastEventAt,
      registration.paidAt,
      registration.privacyConsent ? 'true' : 'false',
      registration.termsConsent ? 'true' : 'false',
      registration.privacyPolicyVersion,
      registration.termsVersion,
      registration.privacyConsentAt,
      registration.termsConsentAt
    ];

    csvRows.push(row.map(escapeCsvValue).join(','));
  }

  return `\uFEFF${csvRows.join('\n')}\n`;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return header.split(';').reduce((acc, part) => {
    const [rawKey, ...valueParts] = part.trim().split('=');
    if (!rawKey) return acc;
    try {
      acc[rawKey] = decodeURIComponent(valueParts.join('=') || '');
    } catch {
      acc[rawKey] = valueParts.join('=') || '';
    }
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
  if (IS_PRODUCTION) {
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
  if (IS_PRODUCTION) {
    parts.push('Secure');
  }
  addSetCookieHeader(res, parts.join('; '));
}

function signSessionPayload(encodedPayload) {
  return createHmac('sha256', getAdminSessionSecretOrThrow()).update(encodedPayload).digest('base64url');
}

function signRetryPaymentPayload(encodedPayload) {
  return createHmac('sha256', getAdminSessionSecretOrThrow()).update(`retry-payment:${encodedPayload}`).digest('base64url');
}

function buildAdminSessionToken(passwordChangedAt) {
  const payload = {
    role: 'admin',
    passwordChangedAt: String(passwordChangedAt || ''),
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signSessionPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function buildRetryPaymentToken(registrationId) {
  const exp = Math.floor(Date.now() / 1000) + RETRY_PAYMENT_LINK_TTL_SECONDS;
  const payload = {
    purpose: 'retry_payment',
    registrationId: String(registrationId || '').trim(),
    exp,
    nonce: randomUUID()
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signRetryPaymentPayload(encodedPayload);
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString()
  };
}

function buildRetryPaymentUrl(token) {
  const safeToken = String(token || '').trim();
  return `${APP_BASE_URL}/retry-payment?token=${encodeURIComponent(safeToken)}`;
}

function buildRetryPaymentEmailMessage(registration, retryUrl, expiresAtIso) {
  const fullName = String(registration?.fullName || '').trim() || 'Participant';
  const registrationId = String(registration?.id || '').trim();
  const expiresAtText = expiresAtIso ? new Date(expiresAtIso).toLocaleString('en-GB') : '';
  const amount = formatCurrency(registration?.amount ?? registration?.amountHuf ?? 0, registration?.currency || 'EUR');
  const packageLabel = getCampTypeLabel(registration?.campType);

  const subject = `Payment link - ${registrationId}`;
  const textLines = [
    `Hello ${fullName},`,
    '',
    'Your previous payment was not completed.',
    'Please use the link below to complete your payment:',
    retryUrl,
    '',
    `Registration ID: ${registrationId}`,
    `Package: ${packageLabel}`,
    `Amount: ${amount}`
  ];

  if (expiresAtText) {
    textLines.push(`Link expires at: ${expiresAtText}`);
  }

  textLines.push('', 'If you have any issue, please contact the Organizing Team using the email address on the Contact page.', '', 'Best regards,', 'Organizing Team');

  const text = textLines.join('\n');
  const html = `
    <h2>Payment link</h2>
    <p>Hello ${escapeHtml(fullName)},</p>
    <p>Your previous payment was not completed.</p>
    <p>Please use this secure payment link to continue:</p>
    <p><a href="${escapeHtml(retryUrl)}">${escapeHtml(retryUrl)}</a></p>
    <p><strong>Registration ID:</strong> ${escapeHtml(registrationId)}<br />
       <strong>Package:</strong> ${escapeHtml(packageLabel)}<br />
       <strong>Amount:</strong> ${escapeHtml(amount)}${expiresAtText ? `<br /><strong>Link expires at:</strong> ${escapeHtml(expiresAtText)}` : ''}</p>
    <p>If you have any issue, please contact the Organizing Team using the email address on the Contact page.</p>
    <p>Best regards,<br />Organizing Team</p>
  `;

  return { subject, text, html };
}

async function sendRetryPaymentEmail(registration) {
  if (!isBrevoEnabled()) {
    throw createError(503, 'Email sending is not configured. Set Brevo env values first.');
  }

  const retry = buildRetryPaymentToken(registration.id);
  const retryUrl = buildRetryPaymentUrl(retry.token);
  const message = buildRetryPaymentEmailMessage(registration, retryUrl, retry.expiresAt);

  await sendBrevoEmail({
    toEmail: registration.email,
    toName: registration.fullName,
    subject: message.subject,
    textContent: message.text,
    htmlContent: message.html
  });

  return {
    expiresAt: retry.expiresAt
  };
}

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''));
  const rightBuffer = Buffer.from(String(right ?? ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyAdminSessionToken(token, db) {
  if (typeof token !== 'string' || !token.includes('.')) return false;

  const [encodedPayload, signature, ...rest] = token.split('.');
  if (!encodedPayload || !signature || rest.length > 0) return false;

  const expected = signSessionPayload(encodedPayload);
  if (!safeEqualStrings(signature, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (payload.role !== 'admin') return false;
    const passwordChangedAt = String(payload.passwordChangedAt || '');
    let adminAuth = null;
    try {
      adminAuth = readAdminAuth(db);
    } catch {
      return false;
    }
    if (!adminAuth || !safeEqualStrings(passwordChangedAt, adminAuth.changedAt)) return false;
    if (typeof payload.exp !== 'number') return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

function verifyRetryPaymentToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [encodedPayload, signature, ...rest] = token.split('.');
  if (!encodedPayload || !signature || rest.length > 0) return null;

  const expected = signRetryPaymentPayload(encodedPayload);
  if (!safeEqualStrings(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (payload.purpose !== 'retry_payment') return null;
    if (typeof payload.registrationId !== 'string' || payload.registrationId.trim().length === 0) return null;
    if (typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function verifyStripeWebhookSignature(rawBodyBuffer, stripeSignatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw createError(503, 'Stripe webhook secret is not configured.');
  }

  const header = String(stripeSignatureHeader || '').trim();
  if (!header) {
    throw createError(400, 'Missing Stripe-Signature header.');
  }

  const parts = header.split(',').map((part) => part.trim()).filter(Boolean);
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const v1Parts = parts.filter((part) => part.startsWith('v1='));

  if (!timestampPart || v1Parts.length === 0) {
    throw createError(400, 'Invalid Stripe-Signature header format.');
  }

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) {
    throw createError(400, 'Invalid Stripe webhook signature timestamp.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
    throw createError(400, 'Stripe webhook signature timestamp is outside tolerance.');
  }

  const signedPayload = `${timestamp}.${rawBodyBuffer.toString('utf8')}`;
  const expectedSignature = createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
  const anyMatch = v1Parts.some((part) => safeEqualStrings(part.slice(3), expectedSignature));

  if (!anyMatch) {
    throw createError(400, 'Stripe webhook signature verification failed.');
  }
}

function getSecurityHeadersForRequest(pathname) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');

  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': csp
  };

  if (
    pathname === '/admin' ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/stats') ||
    pathname.startsWith('/api/registrations')
  ) {
    headers['Cache-Control'] = 'no-store';
  }

  const isHttpsBaseUrl = String(APP_BASE_URL || '').toLowerCase().startsWith('https://');
  if (IS_PRODUCTION && isHttpsBaseUrl) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  return headers;
}

function applySecurityHeaders(res, pathname) {
  const headers = getSecurityHeadersForRequest(pathname);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

function getAllowedOrigins(host) {
  const safeHost = String(host || '').trim();
  const origins = new Set();
  if (safeHost) {
    origins.add(`http://${safeHost}`);
    origins.add(`https://${safeHost}`);
  }

  try {
    const appOrigin = new URL(APP_BASE_URL).origin;
    origins.add(appOrigin);
  } catch {
    // Ignore invalid APP_BASE_URL during local development.
  }

  return origins;
}

function isSameOriginRequest(req, reqUrl) {
  const originHeader = String(req.headers.origin || '').trim();
  if (!originHeader) return true;
  const allowed = getAllowedOrigins(reqUrl.host);
  return allowed.has(originHeader);
}

function isStateChangingMethod(method) {
  const normalized = String(method || '').toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
}

function sanitizeClientAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'unknown';

  const bracketed = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) {
    return bracketed[1];
  }

  // Remove :port suffix only for IPv4-like values.
  if (raw.includes('.') && /:\d+$/.test(raw)) {
    return raw.replace(/:\d+$/, '');
  }

  return raw;
}

function getClientIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').trim();
  if (TRUST_PROXY && forwardedFor) {
    const first = forwardedFor.split(',')[0].trim();
    if (first) {
      return sanitizeClientAddress(first);
    }
  }
  return sanitizeClientAddress(req.socket?.remoteAddress || 'unknown');
}

function getRateLimitBucket(name) {
  const key = String(name || 'default');
  if (!rateLimitBuckets.has(key)) {
    rateLimitBuckets.set(key, new Map());
  }
  return rateLimitBuckets.get(key);
}

function checkRateLimit({ bucketName, key, limit, windowMs }) {
  const bucket = getRateLimitBucket(bucketName);
  const now = Date.now();
  const entryKey = String(key || 'unknown');
  const current = bucket.get(entryKey);

  if (!current || now - current.windowStart >= windowMs) {
    bucket.set(entryKey, { count: 1, windowStart: now });
  } else {
    current.count += 1;
    bucket.set(entryKey, current);
  }

  if (bucket.size > 5000) {
    for (const [storedKey, value] of bucket.entries()) {
      if (now - Number(value?.windowStart || 0) >= windowMs) {
        bucket.delete(storedKey);
      }
    }
  }

  const updated = bucket.get(entryKey);
  const remaining = Math.max(0, limit - Number(updated?.count || 0));
  const retryAfterMs = Math.max(0, windowMs - (now - Number(updated?.windowStart || now)));
  const allowed = Number(updated?.count || 0) <= limit;

  return {
    allowed,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
  };
}

function registerAdminLoginFailure(ip) {
  const key = String(ip || 'unknown');
  const current = adminLoginFailures.get(key);
  const now = Date.now();
  const lastFailedAt = Number(current?.lastFailedAt || 0);
  const previousCount = now - lastFailedAt <= ADMIN_LOGIN_BLOCK_MS ? Number(current?.count || 0) : 0;
  const count = previousCount + 1;
  const blockedUntil = count >= ADMIN_LOGIN_MAX_FAILURES ? now + ADMIN_LOGIN_BLOCK_MS : 0;
  adminLoginFailures.set(key, { count, blockedUntil, lastFailedAt: now });
}

function clearAdminLoginFailures(ip) {
  adminLoginFailures.delete(String(ip || 'unknown'));
}

function getAdminLoginBlockRemainingMs(ip) {
  const key = String(ip || 'unknown');
  const current = adminLoginFailures.get(key);
  if (!current) return 0;
  const remaining = Number(current.blockedUntil || 0) - Date.now();
  if (remaining <= 0) {
    adminLoginFailures.delete(key);
    return 0;
  }
  return remaining;
}

function isAdminAuthenticated(req, db) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_SESSION_COOKIE];
  return verifyAdminSessionToken(token, db);
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
  const activeRegistrations = registrations.filter((r) => r.status !== 'DELETED' && r.status !== 'ANONYMIZED');
  const deletedCount = registrations.filter((r) => r.status === 'DELETED').length;
  const anonymizedCount = registrations.filter((r) => r.status === 'ANONYMIZED').length;
  const total = activeRegistrations.length;
  const wantsExamIaido = activeRegistrations.filter((r) => r.wantsExamIaido).length;
  const wantsExamJodo = activeRegistrations.filter((r) => r.wantsExamJodo).length;
  const wantsExamTotal = activeRegistrations.filter((r) => r.wantsExamIaido || r.wantsExamJodo).length;
  const pendingPayment = activeRegistrations.filter((r) => r.status === 'PENDING_PAYMENT').length;
  const paid = activeRegistrations.filter((r) => r.status === 'PAID').length;
  const projectedRevenueEur = activeRegistrations
    .filter((r) => !r.currency || String(r.currency).toUpperCase() === 'EUR')
    .reduce((sum, current) => sum + Number(current.amount ?? current.amountHuf ?? 0), 0);

  const byCampType = activeRegistrations.reduce((acc, current) => {
    acc[current.campType] = (acc[current.campType] || 0) + 1;
    return acc;
  }, {});

  const iaidoApplicants = (byCampType.iaido || 0) + (byCampType.both || 0);
  const jodoApplicants = (byCampType.jodo || 0) + (byCampType.both || 0);

  const byCurrentGradeIaido = activeRegistrations.reduce((acc, current) => {
    if (!current.currentGradeIaido) return acc;
    acc[current.currentGradeIaido] = (acc[current.currentGradeIaido] || 0) + 1;
    return acc;
  }, {});

  const byCurrentGradeJodo = activeRegistrations.reduce((acc, current) => {
    if (!current.currentGradeJodo) return acc;
    acc[current.currentGradeJodo] = (acc[current.currentGradeJodo] || 0) + 1;
    return acc;
  }, {});
  const byCurrentGrade = byCurrentGradeIaido;

  const byTargetGradeIaido = activeRegistrations
    .filter((r) => r.wantsExamIaido && r.targetGradeIaido)
    .reduce((acc, current) => {
      acc[current.targetGradeIaido] = (acc[current.targetGradeIaido] || 0) + 1;
      return acc;
    }, {});

  const byTargetGradeJodo = activeRegistrations
    .filter((r) => r.wantsExamJodo && r.targetGradeJodo)
    .reduce((acc, current) => {
      acc[current.targetGradeJodo] = (acc[current.targetGradeJodo] || 0) + 1;
      return acc;
    }, {});

  const lastRegistrationAt = activeRegistrations.length > 0 ? activeRegistrations[activeRegistrations.length - 1].createdAt : null;

  return {
    total,
    deletedCount,
    anonymizedCount,
    wantsExamIaido,
    wantsExamJodo,
    wantsExamTotal,
    pendingPayment,
    paid,
    projectedRevenueByCurrency: { EUR: projectedRevenueEur },
    projectedRevenueHuf: 0,
    projectedRevenueEur,
    byCampType,
    iaidoApplicants,
    jodoApplicants,
    byCurrentGrade,
    byCurrentGradeIaido,
    byCurrentGradeJodo,
    byTargetGradeIaido,
    byTargetGradeJodo,
    lastRegistrationAt
  };
}

function getStaticFilePath(urlPath) {
  const routeMap = {
    '/': 'index.html',
    '/program': 'program.html',
    '/faq': 'faq.html',
    '/info': 'info.html',
    '/payment-success': 'payment-success.html',
    '/payment-cancel': 'payment-cancel.html',
    '/privacy': 'privacy.html',
    '/terms': 'terms.html',
    '/registration': 'registration.html',
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

function validateRuntimeConfigForProduction() {
  if (!IS_PRODUCTION) {
    return;
  }

  if (ADMIN_SESSION_SECRET_FROM_ENV && !isValidAdminSessionSecret(ADMIN_SESSION_SECRET_FROM_ENV)) {
    throw new Error('Invalid ADMIN_SESSION_SECRET for production. Use a long random secret (min 32 chars).');
  }

  if (!String(APP_BASE_URL || '').toLowerCase().startsWith('https://')) {
    throw new Error('APP_BASE_URL must use https:// in production.');
  }

  if (STRIPE_SECRET_KEY && !STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required in production when Stripe is enabled.');
  }
}

function createServer(options = {}) {
  const db = options.db || initDatabase();
  validateRuntimeConfigForProduction();
  const sessionSecret = initializeAdminSessionSecret(db);
  if (IS_PRODUCTION && sessionSecret.source !== 'env') {
    console.warn('ADMIN_SESSION_SECRET is not set. Generated secret is stored in SQLite app_settings and reused on restart.');
  }
  let pricingSettings = loadPricingSettings(db);

  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = reqUrl;
    applySecurityHeaders(res, pathname);

    if (isStateChangingMethod(req.method) && pathname !== '/api/stripe/webhook' && !isSameOriginRequest(req, reqUrl)) {
      sendJson(res, 403, { error: 'Forbidden origin.' });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/pricing') {
      sendJson(res, 200, {
        pricing: buildPublicPricingConfig(pricingSettings),
        currency: 'EUR'
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/retry-payment') {
      const token = String(reqUrl.searchParams.get('token') || '').trim();
      const payload = verifyRetryPaymentToken(token);
      if (!payload) {
        sendHtml(res, 400, buildRetryPaymentPage({
          title: 'Invalid Payment Link',
          message: 'This retry payment link is invalid or expired. Please request a new link from the organizer.'
        }));
        return;
      }

      try {
        const result = await createCheckoutSessionForRegistration(db, payload.registrationId, { source: 'retry_link' });
        res.writeHead(302, { Location: result.session.url });
        res.end();
        return;
      } catch (error) {
        const registration = getRegistrationById(db, payload.registrationId);
        const status = Number(error.statusCode) || 400;
        sendHtml(res, status, buildRetryPaymentPage({
          title: 'Retry Payment Unavailable',
          message: error.message || 'Could not restart payment. Please request a new payment link from the organizer.',
          registration
        }));
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/admin') {
      const fileName = isAdminAuthenticated(req, db) ? 'admin.html' : 'admin-login.html';
      serveFile(res, path.join(PUBLIC_DIR, fileName));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/session') {
      sendJson(res, 200, { authenticated: isAdminAuthenticated(req, db) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/email/templates') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      sendJson(res, 200, {
        templates: listAdminEmailTemplates(),
        capabilities: {
          provider: isBrevoEnabled() ? 'brevo' : 'disabled',
          maxRecipients: ADMIN_EMAIL_MAX_RECIPIENTS
        }
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/email/send') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }
      if (!isBrevoEnabled()) {
        sendJson(res, 503, { error: 'Email sending is not configured. Set Brevo env values first.' });
        return;
      }

      const adminEmailRateLimit = checkRateLimit({
        bucketName: 'admin_email_send',
        key: getClientIp(req),
        limit: ADMIN_EMAIL_RATE_LIMIT_COUNT,
        windowMs: ADMIN_EMAIL_RATE_LIMIT_WINDOW_MS
      });
      if (!adminEmailRateLimit.allowed) {
        res.setHeader('Retry-After', String(adminEmailRateLimit.retryAfterSeconds));
        sendJson(res, 429, { error: `Email send rate limit exceeded. Try again in ${adminEmailRateLimit.retryAfterSeconds} seconds.` });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const templateKeyRaw = String(body?.templateKey || 'custom').trim();
        const templateKey = templateKeyRaw || 'custom';
        const template = templateKey !== 'custom' ? resolveAdminEmailTemplate(templateKey) : null;
        if (templateKey !== 'custom' && !template) {
          sendJson(res, 400, { error: 'Invalid template key.' });
          return;
        }

        let subject = String(body?.subject || '').trim();
        let content = String(body?.body || '');
        if (!subject && template) {
          subject = template.subject;
        }
        if (!content.trim() && template) {
          content = template.body;
        }

        content = content.trim();
        if (!subject) {
          sendJson(res, 400, { error: 'Email subject is required.' });
          return;
        }
        if (!content) {
          sendJson(res, 400, { error: 'Email body is required.' });
          return;
        }
        if (subject.length > 180) {
          sendJson(res, 400, { error: 'Email subject is too long (max 180 characters).' });
          return;
        }
        if (content.length > 20000) {
          sendJson(res, 400, { error: 'Email body is too long (max 20000 characters).' });
          return;
        }

        const recipientMode = String(body?.recipientMode || 'selected').trim() || 'selected';
        const selectedIds = Array.isArray(body?.recipientIds) ? body.recipientIds : [];
        const registrations = readRegistrations(db);
        const recipients = selectEmailRecipients(registrations, recipientMode, selectedIds);

        if (recipients.length === 0) {
          sendJson(res, 400, { error: 'No eligible recipients found for the selected recipient mode.' });
          return;
        }
        if (recipients.length > ADMIN_EMAIL_MAX_RECIPIENTS) {
          sendJson(res, 400, {
            error: `Too many recipients in one send operation. Limit: ${ADMIN_EMAIL_MAX_RECIPIENTS}.`
          });
          return;
        }

        const failures = [];
        let successCount = 0;
        for (const registration of recipients) {
          const renderedSubject = applyEmailTemplateVariables(subject, registration).trim();
          const renderedText = applyEmailTemplateVariables(content, registration).trim();
          if (!renderedSubject || !renderedText) {
            failures.push({
              registrationId: registration.id,
              email: registration.email,
              error: 'Rendered message is empty.'
            });
            continue;
          }

          try {
            await sendBrevoEmail({
              toEmail: registration.email,
              toName: registration.fullName,
              subject: renderedSubject,
              textContent: renderedText,
              htmlContent: plainTextToHtml(renderedText)
            });
            successCount += 1;
          } catch (error) {
            failures.push({
              registrationId: registration.id,
              email: registration.email,
              error: error.message
            });
          }
        }

        const failedCount = failures.length;
        try {
          await runWithSqliteRetry(() => insertAdminEmailLog(db, {
            requestedByIp: getClientIp(req),
            recipientMode,
            recipientCount: recipients.length,
            successCount,
            failedCount,
            templateKey,
            subject,
            failures: failures.slice(0, 50)
          }));
        } catch (logError) {
          console.error(`Admin email log write failed: ${logError.message}`);
        }

        const statusCode = failedCount === 0 ? 200 : successCount > 0 ? 207 : 502;
        sendJson(res, statusCode, {
          message: failedCount === 0
            ? `Email sent successfully to ${successCount} recipient(s).`
            : `Email sending completed with failures. Success: ${successCount}, Failed: ${failedCount}.`,
          recipientMode,
          totalRecipients: recipients.length,
          successCount,
          failedCount,
          failures: failures.slice(0, 20)
        });
      } catch (error) {
        if (isSqliteBusyError(error)) {
          sendJson(res, 503, { error: 'Database is currently busy. Please try again in a few seconds.' });
          return;
        }
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/pricing') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      sendJson(res, 200, {
        settings: pricingSettings,
        pricing: buildPublicPricingConfig(pricingSettings)
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/pricing') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const incomingSettings = body?.settings && typeof body.settings === 'object' ? body.settings : body;
        const nextPricingSettings = normalizePricingSettings(incomingSettings, pricingSettings);

        await runWithSqliteRetry(() => {
          savePricingSettings(db, nextPricingSettings);
          return true;
        });

        pricingSettings = nextPricingSettings;
        sendJson(res, 200, {
          message: 'Pricing settings saved.',
          settings: pricingSettings,
          pricing: buildPublicPricingConfig(pricingSettings)
        });
      } catch (error) {
        if (isSqliteBusyError(error)) {
          sendJson(res, 503, { error: 'Database is currently busy. Please try again in a few seconds.' });
          return;
        }
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/login') {
      try {
        const body = await parseJsonBody(req);
        const password = String(body.password || '');
        const ip = getClientIp(req);
        const remainingBlockMs = getAdminLoginBlockRemainingMs(ip);

        if (remainingBlockMs > 0) {
          const retryAfterSeconds = Math.max(1, Math.ceil(remainingBlockMs / 1000));
          res.setHeader('Retry-After', String(retryAfterSeconds));
          sendJson(res, 429, { error: `Too many failed login attempts. Try again in ${retryAfterSeconds} seconds.` });
          return;
        }

        const adminAuth = await runWithSqliteRetry(() => ensureAdminAuth(db));
        if (!verifyPasswordHash(password, adminAuth)) {
          registerAdminLoginFailure(ip);
          sendJson(res, 401, { error: 'Invalid password.' });
          return;
        }

        clearAdminLoginFailures(ip);
        const token = buildAdminSessionToken(adminAuth.changedAt);
        setAdminSessionCookie(res, token, ADMIN_SESSION_TTL_SECONDS);
        sendJson(res, 200, { message: 'Login successful.' });
      } catch (error) {
        if (isSqliteBusyError(error)) {
          sendJson(res, 503, { error: 'Database is currently busy. Please try again in a few seconds.' });
          return;
        }
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      clearAdminSessionCookie(res);
      sendJson(res, 200, { message: 'Logout successful.' });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/password') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const currentPassword = String(body.currentPassword || '');
        const nextPassword = String(body.newPassword || '');
        const confirmPassword = String(body.confirmPassword || '');

        if (!currentPassword || !nextPassword || !confirmPassword) {
          sendJson(res, 400, { error: 'All password fields are required.' });
          return;
        }

        if (!safeEqualStrings(nextPassword, confirmPassword)) {
          sendJson(res, 400, { error: 'New password and confirmation do not match.' });
          return;
        }

        if (!isValidAdminPassword(nextPassword)) {
          sendJson(
            res,
            400,
            { error: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters and include letters and numbers.` }
          );
          return;
        }

        const currentAuth = await runWithSqliteRetry(() => ensureAdminAuth(db));
        if (!verifyPasswordHash(currentPassword, currentAuth)) {
          sendJson(res, 401, { error: 'Current password is incorrect.' });
          return;
        }

        if (verifyPasswordHash(nextPassword, currentAuth)) {
          sendJson(res, 400, { error: 'New password must be different from the current password.' });
          return;
        }

        const updatedAuth = createPasswordHash(nextPassword);
        await runWithSqliteRetry(() => saveAdminAuth(db, updatedAuth));

        const token = buildAdminSessionToken(updatedAuth.changedAt);
        setAdminSessionCookie(res, token, ADMIN_SESSION_TTL_SECONDS);
        sendJson(res, 200, {
          message: 'Admin password updated successfully.',
          changedAt: updatedAuth.changedAt
        });
      } catch (error) {
        if (isSqliteBusyError(error)) {
          sendJson(res, 503, { error: 'Database is currently busy. Please try again in a few seconds.' });
          return;
        }
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/stats') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }
      const registrations = readRegistrations(db);
      sendJson(res, 200, { stats: getStats(registrations) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/registrations') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }
      const registrations = readRegistrations(db);
      sendJson(res, 200, { registrations });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/invoices') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      const limitParam = Number(reqUrl.searchParams.get('limit') || 200);
      const limit = Number.isFinite(limitParam) && limitParam >= 1 ? Math.min(Math.floor(limitParam), 1000) : 200;
      const invoices = readInvoiceRecords(db, { limit });
      sendJson(res, 200, { invoices, limit });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/export.csv') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      const registrations = readRegistrations(db);
      const csv = buildCsvExport(registrations);
      const exportDate = new Date().toISOString().slice(0, 10);

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=\"registrations-${exportDate}.csv\"`,
        'Cache-Control': 'no-store'
      });
      res.end(csv);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/backup') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      try {
        const backupFile = await runWithSqliteRetry(() => createDatabaseBackup(db));
        sendJson(res, 200, {
          message: 'Database backup created.',
          file: path.basename(backupFile),
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        if (isSqliteBusyError(error)) {
          sendJson(res, 503, { error: 'Database is currently busy. Please try again in a few seconds.' });
          return;
        }
        sendJson(res, 500, { error: error.message || 'Failed to create backup.' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/registrations/mark-deleted') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const registrationId = String(body.registrationId || '').trim();

        if (!registrationId) {
          sendJson(res, 400, { error: 'registrationId is required.' });
          return;
        }

        const changedRows = await runWithSqliteRetry(() => updateRegistrationStatus(db, registrationId, 'DELETED'));
        if (changedRows === 0) {
          sendJson(res, 404, { error: 'Registration not found.' });
          return;
        }

        sendJson(res, 200, { message: 'Registration status was set to DELETED.' });
      } catch (error) {
        if (isSqliteBusyError(error)) {
          sendJson(res, 503, { error: 'Database is currently busy. Please try again in a few seconds.' });
          return;
        }
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/registrations/send-retry-payment-email') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }
      if (!isStripeEnabled()) {
        sendJson(res, 503, { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY first.' });
        return;
      }
      if (!isBrevoEnabled()) {
        sendJson(res, 503, { error: 'Email sending is not configured. Set Brevo env values first.' });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const registrationId = String(body.registrationId || '').trim();
        if (!registrationId) {
          sendJson(res, 400, { error: 'registrationId is required.' });
          return;
        }

        const registration = getRegistrationById(db, registrationId);
        if (!registration) {
          sendJson(res, 404, { error: 'Registration not found.' });
          return;
        }

        if (registration.status === 'PAID') {
          sendJson(res, 400, { error: 'Registration is already paid.' });
          return;
        }
        if (registration.status === 'DELETED' || registration.status === 'ANONYMIZED') {
          sendJson(res, 400, { error: `Cannot send retry payment email for status: ${registration.status}.` });
          return;
        }
        if (!registration.email) {
          sendJson(res, 400, { error: 'Registration has no email address.' });
          return;
        }

        const sent = await sendRetryPaymentEmail(registration);

        try {
          await runWithSqliteRetry(() => insertAdminEmailLog(db, {
            requestedByIp: getClientIp(req),
            recipientMode: 'selected',
            recipientCount: 1,
            successCount: 1,
            failedCount: 0,
            templateKey: 'retry_payment_link',
            subject: `Payment link - ${registration.id}`,
            failures: []
          }));
        } catch (logError) {
          console.error(`Admin email log write failed: ${logError.message}`);
        }

        sendJson(res, 200, {
          message: `Payment link email sent to ${registration.email}.`,
          registrationId: registration.id,
          email: registration.email,
          expiresAt: sent.expiresAt
        });
      } catch (error) {
        const statusCode = Number(error.statusCode) || 400;
        sendJson(res, statusCode, { error: error.message || 'Could not send retry payment email.' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/registrations/anonymize') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const registrationId = String(body.registrationId || '').trim();

        if (!registrationId) {
          sendJson(res, 400, { error: 'registrationId is required.' });
          return;
        }

        const changedRows = await runWithSqliteRetry(() => anonymizeRegistration(db, registrationId));
        if (changedRows === 0) {
          sendJson(res, 404, { error: 'Registration not found.' });
          return;
        }

        sendJson(res, 200, { message: 'Registration was anonymized.' });
      } catch (error) {
        if (isSqliteBusyError(error)) {
          sendJson(res, 503, { error: 'Database is currently busy. Please try again in a few seconds.' });
          return;
        }
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/register') {
      const registerRateLimit = checkRateLimit({
        bucketName: 'registration_submit',
        key: getClientIp(req),
        limit: REGISTRATION_RATE_LIMIT_COUNT,
        windowMs: REGISTRATION_RATE_LIMIT_WINDOW_MS
      });
      if (!registerRateLimit.allowed) {
        res.setHeader('Retry-After', String(registerRateLimit.retryAfterSeconds));
        sendJson(res, 429, { error: `Too many registration attempts. Try again in ${registerRateLimit.retryAfterSeconds} seconds.` });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const cleanBody = sanitizePayload(body, pricingSettings);
        const errors = validateRegistration(cleanBody, pricingSettings);

        if (errors.length > 0) {
          sendJson(res, 400, { errors });
          return;
        }

        const pricing = calculatePricing({
          campType: cleanBody.campType,
          mealPlan: cleanBody.mealPlan,
          accommodation: cleanBody.accommodation
        }, pricingSettings);

        const newRegistration = {
          id: `reg_${randomUUID()}`,
          createdAt: new Date().toISOString(),
          status: 'PENDING_PAYMENT',
          amount: pricing.totalAmount,
          amountHuf: pricing.totalAmount,
          currency: 'EUR',
          priceBreakdown: pricing,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          termsVersion: TERMS_VERSION,
          privacyConsentAt: cleanBody.privacyConsent ? new Date().toISOString() : '',
          termsConsentAt: cleanBody.termsConsent ? new Date().toISOString() : '',
          ...cleanBody
        };

        await runWithSqliteRetry(() => insertRegistration(db, newRegistration));

        // Email sending is non-blocking for registration success.
        sendRegistrationEmails(newRegistration, pricing).catch((error) => {
          console.error(`Email send failed for ${newRegistration.id}: ${error.message}`);
        });

        let checkoutSession = null;
        let paymentError = null;
        try {
          const checkoutResult = await createCheckoutSessionForRegistration(db, newRegistration.id, { source: 'registration_submit' });
          checkoutSession = checkoutResult.session;
        } catch (error) {
          paymentError = error;
          console.error(`Stripe session creation failed for ${newRegistration.id}: ${error.message}`);
        }

        sendJson(res, 201, {
          message: checkoutSession
            ? 'Registration saved. Redirect to Stripe Checkout.'
            : 'Registration saved, but payment session could not be created. Please try payment again.',
          registrationId: newRegistration.id,
          pricing,
          email: {
            provider: isBrevoEnabled() ? 'brevo' : 'disabled',
            status: isBrevoEnabled() ? 'QUEUED' : 'DISABLED'
          },
          compliance: {
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
            termsVersion: TERMS_VERSION
          },
          payment: {
            provider: 'stripe',
            status: checkoutSession ? 'CHECKOUT_READY' : 'CHECKOUT_FAILED',
            checkoutSessionId: checkoutSession?.id || null,
            checkoutUrl: checkoutSession?.url || null,
            error: paymentError ? 'Checkout session creation failed.' : null
          }
        });
      } catch (error) {
        if (isSqliteBusyError(error)) {
          sendJson(res, 503, { error: 'Saving failed due to high load. Please try again.' });
          return;
        }
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/payments/create-checkout-session') {
      try {
        const body = await parseJsonBody(req);
        const providedRegistrationId = String(body?.registrationId || '').trim();
        const retryToken = String(body?.retryToken || '').trim();

        let registrationId = providedRegistrationId;
        const retryPayload = retryToken ? verifyRetryPaymentToken(retryToken) : null;

        if (retryToken && !retryPayload) {
          sendJson(res, 400, { error: 'Invalid or expired retry token.' });
          return;
        }

        if (retryPayload) {
          registrationId = retryPayload.registrationId;
        } else if (!isAdminAuthenticated(req, db)) {
          sendJson(res, 401, { error: 'Admin login required.' });
          return;
        }

        if (!registrationId) {
          sendJson(res, 400, { error: 'registrationId is required.' });
          return;
        }

        const result = await createCheckoutSessionForRegistration(db, registrationId, {
          source: retryPayload ? 'retry_token' : 'admin_manual'
        });

        sendJson(res, 200, {
          registrationId: result.registration.id,
          checkoutSessionId: result.session.id,
          checkoutUrl: result.session.url
        });
      } catch (error) {
        const statusCode = Number(error.statusCode) || 400;
        sendJson(res, statusCode, { error: error.message || 'Could not create checkout session.' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/payments/confirm') {
      try {
        const body = await parseJsonBody(req);
        const sessionId = String(body?.sessionId || '').trim();
        if (!sessionId) {
          sendJson(res, 400, { error: 'sessionId is required.' });
          return;
        }

        const session = await getStripeCheckoutSession(sessionId);
        const eventCreatedAt = stripeUnixToIso(session?.created) || new Date().toISOString();
        const syncResult = await runWithSqliteRetry(() => syncRegistrationFromStripeSession(db, session, {
          eventType: 'checkout.session.confirm_lookup',
          eventCreatedAt
        }));

        if (!syncResult.registrationId) {
          sendJson(res, 404, { error: 'Could not match this Stripe session to any registration.' });
          return;
        }

        if (syncResult.paid && isSzamlazzEnabled()) {
          try {
            await createInvoiceForRegistration(db, syncResult.registrationId, { triggerSource: 'stripe_confirm' });
          } catch (invoiceError) {
            console.error(`Invoice creation failed for ${syncResult.registrationId}: ${invoiceError.message}`);
          }
        }

        const registration = getRegistrationById(db, syncResult.registrationId);
        sendJson(res, 200, {
          registrationId: syncResult.registrationId,
          registrationStatus: registration?.status || 'UNKNOWN',
          paid: Boolean(syncResult.paid),
          stripe: {
            sessionId: getStripeStringId(session?.id),
            paymentStatus: String(session?.payment_status || '').trim().toLowerCase(),
            checkoutStatus: String(session?.status || '').trim().toLowerCase(),
            paymentIntentId: getStripeStringId(session?.payment_intent),
            customerId: getStripeStringId(session?.customer)
          }
        });
      } catch (error) {
        const statusCode = Number(error.statusCode) || 400;
        sendJson(res, statusCode, { error: error.message || 'Could not confirm payment.' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/invoices/create') {
      if (!isAdminAuthenticated(req, db)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const registrationId = String(body?.registrationId || '').trim();
        if (!registrationId) {
          sendJson(res, 400, { error: 'registrationId is required.' });
          return;
        }

        const result = await createInvoiceForRegistration(db, registrationId, {
          triggerSource: 'admin_manual'
        });

        sendJson(res, result.created ? 201 : 200, {
          message: result.created ? 'Invoice created successfully.' : 'Invoice already exists for this registration.',
          invoice: result.invoice,
          created: result.created,
          reused: result.reused
        });
      } catch (error) {
        const statusCode = Number(error.statusCode) || 400;
        sendJson(res, statusCode, { error: error.message || 'Invoice creation failed.' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/stripe/webhook') {
      try {
        const rawBody = await parseRawBody(req);
        verifyStripeWebhookSignature(rawBody, req.headers['stripe-signature']);

        let event;
        try {
          event = JSON.parse(rawBody.toString('utf8'));
        } catch {
          sendJson(res, 400, { error: 'Invalid Stripe webhook payload JSON.' });
          return;
        }

        const eventType = String(event?.type || '');
        if (eventType.startsWith('checkout.session.')) {
          const session = event?.data?.object || {};
          const eventCreatedAt = stripeUnixToIso(event?.created) || new Date().toISOString();
          const syncResult = await runWithSqliteRetry(() => syncRegistrationFromStripeSession(db, session, {
            eventType,
            eventCreatedAt
          }));

          if (!syncResult.registrationId) {
            console.warn(`Stripe webhook ${eventType}: registration could not be resolved.`);
          } else if (syncResult.paid && isSzamlazzEnabled()) {
            try {
              await createInvoiceForRegistration(db, syncResult.registrationId, { triggerSource: 'stripe_webhook' });
            } catch (invoiceError) {
              console.error(`Invoice creation failed for ${syncResult.registrationId}: ${invoiceError.message}`);
            }
          }
        }

        sendJson(res, 200, { received: true });
      } catch (error) {
        console.error(`Stripe webhook error: ${error.message}`);
        const statusCode = Number(error.statusCode) || 400;
        sendJson(res, statusCode, { error: error.message || 'Webhook processing failed.' });
      }
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
  const stopBackupScheduler = scheduleDailyBackups(db);
  const server = createServer({ db });

  server.listen(PORT, () => {
    console.log(`Iaido Camp server running on http://localhost:${PORT}`);
  });

  process.on('exit', () => {
    stopBackupScheduler();
    db.close();
  });
}

module.exports = {
  createServer,
  initDatabase,
  readRegistrations,
  insertRegistration,
  updateRegistrationStatus,
  anonymizeRegistration,
  calculatePricing,
  PRICE_OPTIONS,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  buildCsvExport,
  sanitizePayload,
  validateRegistration,
  getStats
};
