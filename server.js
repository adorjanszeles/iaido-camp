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

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo-admin-123';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'replace-this-secret-in-production';
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;
const ADMIN_SESSION_COOKIE = 'admin_session';
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
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_REQUEST_TIMEOUT_MS = 8000;

const PRICE_OPTIONS = {
  campType: {
    iaido: { label: 'Iaido seminar', amountHuf: 149 },
    jodo: { label: 'Jodo seminar', amountHuf: 149 },
    both: { label: 'Iaido + Jodo seminar', amountHuf: 249 }
  },
  mealPlan: {
    none: { label: 'No meal', amountHuf: 0 },
    lunch: { label: 'Lunch package', amountHuf: 33 },
    full: { label: 'Full meal package', amountHuf: 60 }
  },
  accommodation: {
    none: { label: 'No accommodation', amountHuf: 0 },
    dojo: { label: 'Dojo accommodation', amountHuf: 73 },
    guesthouse: { label: 'Guesthouse', amountHuf: 135 }
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
    currency: 'EUR'
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

function buildRegistrationEmailContent(registration, pricing) {
  const participantName = escapeHtml(registration.fullName || '');
  const registrationId = escapeHtml(registration.id || '');
  const createdAt = escapeHtml(new Date(registration.createdAt).toLocaleString('en-GB'));
  const pricingRows = pricing.lineItems
    .map((item) => `<li>${escapeHtml(item.label)}: <strong>${escapeHtml(formatCurrency(item.amountHuf, pricing.currency))}</strong></li>`)
    .join('');
  const total = escapeHtml(formatCurrency(pricing.totalHuf, pricing.currency));
  const manageUrl = `${APP_BASE_URL}/admin`;

  const participantHtml = `
    <h2>Registration Received</h2>
    <p>Hello ${participantName},</p>
    <p>Thank you for your registration to the Ishido Sensei - Summer Seminar 2026.</p>
    <p><strong>Registration ID:</strong> ${registrationId}<br />
       <strong>Date:</strong> ${createdAt}</p>
    <h3>Selected options</h3>
    <ul>${pricingRows}</ul>
    <p><strong>Total:</strong> ${total}</p>
    <p>This is a confirmation from the demo system. Payment flow is currently in integration mode.</p>
  `;

  const participantText = [
    'Registration Received',
    '',
    `Hello ${registration.fullName},`,
    'Thank you for your registration to the Ishido Sensei - Summer Seminar 2026.',
    `Registration ID: ${registration.id}`,
    `Date: ${new Date(registration.createdAt).toLocaleString('en-GB')}`,
    'Selected options:',
    ...pricing.lineItems.map((item) => `- ${item.label}: ${formatCurrency(item.amountHuf, pricing.currency)}`),
    `Total: ${formatCurrency(pricing.totalHuf, pricing.currency)}`,
    'This is a confirmation from the demo system. Payment flow is currently in integration mode.'
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
    `Total: ${formatCurrency(pricing.totalHuf, pricing.currency)}`,
    `Open admin panel: ${manageUrl}`
  ].join('\n');

  return {
    participant: {
      subject: `Registration confirmation - ${registration.id}`,
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
      privacy_consent INTEGER NOT NULL,
      terms_consent INTEGER NOT NULL,
      privacy_policy_version TEXT NOT NULL DEFAULT '',
      terms_version TEXT NOT NULL DEFAULT '',
      privacy_consent_at TEXT NOT NULL DEFAULT '',
      terms_consent_at TEXT NOT NULL DEFAULT ''
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
        Number(item.amountHuf || pricing.totalHuf),
        item.currency || pricing.currency,
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
    amountHuf: row.amount_huf,
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
      food_notes, price_breakdown, privacy_consent, terms_consent,
      privacy_policy_version, terms_version, privacy_consent_at, terms_consent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    registration.privacyConsent ? 1 : 0,
    registration.termsConsent ? 1 : 0,
    registration.privacyPolicyVersion || '',
    registration.termsVersion || '',
    registration.privacyConsentAt || '',
    registration.termsConsentAt || ''
  );
}

function updateRegistrationStatus(db, registrationId, status) {
  const update = db.prepare('UPDATE registrations SET status = ? WHERE id = ?');
  const result = update.run(status, registrationId);
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
  const fallbackTargetGradeIaido = payload.targetGradeIaido ?? payload.targetGrade ?? '';
  const fallbackCurrentGradeIaido = payload.currentGradeIaido ?? payload.currentGrade ?? '';
  const wantsExamIaido = Boolean(payload.wantsExamIaido ?? payload.wantsExam);
  const wantsExamJodo = Boolean(payload.wantsExamJodo);
  const campType = toEnumValue(payload.campType, PRICE_OPTIONS.campType, 'iaido');
  const mealPlan = toEnumValue(payload.mealPlan, PRICE_OPTIONS.mealPlan, 'none');
  const accommodation = toEnumValue(payload.accommodation, PRICE_OPTIONS.accommodation, 'none');

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

function validateRegistration(data) {
  const errors = [];

  if (!isNonEmptyString(data.fullName)) errors.push('Full name is required.');
  if (!isValidEmail(data.email)) errors.push('A valid email address is required.');
  if (!isValidPhone(data.phone)) errors.push('A valid phone number is required.');
  if (!isNonEmptyString(data.city)) errors.push('City is required.');

  const needsIaidoGrade = data.campType === 'iaido' || data.campType === 'both' || data.wantsExamIaido;
  const needsJodoGrade = data.campType === 'jodo' || data.campType === 'both' || data.wantsExamJodo;
  if (needsIaidoGrade && !isNonEmptyString(data.currentGradeIaido)) {
    errors.push('Current Iaido grade is required for the selected option.');
  }
  if (needsJodoGrade && !isNonEmptyString(data.currentGradeJodo)) {
    errors.push('Current Jodo grade is required for the selected option.');
  }
  if (!Object.prototype.hasOwnProperty.call(PRICE_OPTIONS.campType, data.campType)) {
    errors.push('Invalid seminar selection.');
  }
  if (!Object.prototype.hasOwnProperty.call(PRICE_OPTIONS.mealPlan, data.mealPlan)) {
    errors.push('Invalid meal option.');
  }
  if (!Object.prototype.hasOwnProperty.call(PRICE_OPTIONS.accommodation, data.accommodation)) {
    errors.push('Invalid accommodation option.');
  }

  if (data.wantsExamIaido && !isNonEmptyString(data.targetGradeIaido)) {
    errors.push('Iaido target grade is required if Iaido exam is selected.');
  }

  if (data.wantsExamJodo && !isNonEmptyString(data.targetGradeJodo)) {
    errors.push('Jodo target grade is required if Jodo exam is selected.');
  }

  if (data.wantsExamIaido && data.campType === 'jodo') {
    errors.push('Iaido exam can only be selected with Iaido or Iaido + Jodo participation.');
  }
  if (data.wantsExamJodo && data.campType === 'iaido') {
    errors.push('Jodo exam can only be selected with Jodo or Iaido + Jodo participation.');
  }

  if (!isNonEmptyString(data.billingFullName)) errors.push('Billing full name is required.');
  if (!/^\d{4}$/.test(data.billingZip)) errors.push('Billing ZIP code must be 4 digits.');
  if (!isNonEmptyString(data.billingCity)) errors.push('Billing city is required.');
  if (!isNonEmptyString(data.billingAddress)) errors.push('Billing address is required.');
  if (!isNonEmptyString(data.billingCountry)) errors.push('Billing country is required.');
  if (String(data.foodNotes || '').length > 4000) errors.push('Note cannot exceed 4000 characters.');
  if (!data.privacyConsent) errors.push('Privacy consent is required.');
  if (!data.termsConsent) errors.push('Accepting participation terms is required.');

  return errors;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': MIME_TYPES['.json'] });
  res.end(JSON.stringify(payload));
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
    'camp_price_eur',
    'meal_price_eur',
    'accommodation_price_eur',
    'amount_eur',
    'currency',
    'billing_full_name',
    'billing_zip',
    'billing_city',
    'billing_address',
    'billing_country',
    'food_notes',
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

    const campPrice = lineItems.find((item) => item.key === 'campType')?.amountHuf ?? '';
    const mealPrice = lineItems.find((item) => item.key === 'mealPlan')?.amountHuf ?? '';
    const accommodationPrice = lineItems.find((item) => item.key === 'accommodation')?.amountHuf ?? '';

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
      registration.amountHuf,
      registration.currency,
      registration.billingFullName,
      registration.billingZip,
      registration.billingCity,
      registration.billingAddress,
      registration.billingCountry,
      registration.foodNotes,
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
  const activeRegistrations = registrations.filter((r) => r.status !== 'DELETED' && r.status !== 'ANONYMIZED');
  const deletedCount = registrations.filter((r) => r.status === 'DELETED').length;
  const anonymizedCount = registrations.filter((r) => r.status === 'ANONYMIZED').length;
  const total = activeRegistrations.length;
  const wantsExamIaido = activeRegistrations.filter((r) => r.wantsExamIaido).length;
  const wantsExamJodo = activeRegistrations.filter((r) => r.wantsExamJodo).length;
  const wantsExamTotal = activeRegistrations.filter((r) => r.wantsExamIaido || r.wantsExamJodo).length;
  const pendingPayment = activeRegistrations.filter((r) => r.status === 'PENDING_PAYMENT').length;
  const paid = activeRegistrations.filter((r) => r.status === 'PAID').length;
  const projectedRevenueHuf = activeRegistrations.reduce((sum, current) => sum + Number(current.amountHuf || 0), 0);

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
    projectedRevenueHuf,
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
    '/adatkezeles': 'adatkezeles.html',
    '/feltetelek': 'feltetelek.html',
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
          sendJson(res, 401, { error: 'Invalid username or password.' });
          return;
        }

        const token = buildAdminSessionToken();
        setAdminSessionCookie(res, token, ADMIN_SESSION_TTL_SECONDS);
        sendJson(res, 200, { message: 'Login successful.' });
      } catch (error) {
        sendJson(res, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      clearAdminSessionCookie(res);
      sendJson(res, 200, { message: 'Logout successful.' });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/stats') {
      if (!isAdminAuthenticated(req)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }
      const registrations = readRegistrations(db);
      sendJson(res, 200, { stats: getStats(registrations) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/registrations') {
      if (!isAdminAuthenticated(req)) {
        sendJson(res, 401, { error: 'Admin login required.' });
        return;
      }
      const registrations = readRegistrations(db);
      sendJson(res, 200, { registrations });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/export.csv') {
      if (!isAdminAuthenticated(req)) {
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

    if (req.method === 'POST' && pathname === '/api/admin/registrations/mark-deleted') {
      if (!isAdminAuthenticated(req)) {
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

    if (req.method === 'POST' && pathname === '/api/admin/registrations/anonymize') {
      if (!isAdminAuthenticated(req)) {
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

        sendJson(res, 201, {
          message: 'Registration saved. Next step: redirect to Stripe Checkout.',
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
            status: 'NOT_IMPLEMENTED',
            note: 'Redirect to Stripe page is not enabled in demo mode yet.',
            nextAction: 'REDIRECT_TO_STRIPE_CHECKOUT'
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
