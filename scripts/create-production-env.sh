#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${1:-.env.production}"

if [[ -f "${TARGET_FILE}" ]]; then
  BACKUP_FILE="${TARGET_FILE}.$(date +%Y%m%d-%H%M%S).bak"
  cp "${TARGET_FILE}" "${BACKUP_FILE}"
  echo "Existing ${TARGET_FILE} backed up to ${BACKUP_FILE}"
fi

cat > "${TARGET_FILE}" <<'EOF'
# ------------------------------------------------------------
# Production environment template (generated)
# Domain target: summerseminar2026.hu
# ------------------------------------------------------------

NODE_ENV=production
PORT=3000
APP_BASE_URL=https://summerseminar2026.hu

# Set true when running behind a reverse proxy (Nginx/Traefik/Caddy/Cloudflare)
TRUST_PROXY=true

# -----------------------
# Admin auth
# -----------------------
ADMIN_PASSWORD=CHANGE_ME_STRONG_PASSWORD
# Recommended: long random secret (min 32 chars)
ADMIN_SESSION_SECRET=CHANGE_ME_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS

# -----------------------
# Stripe
# -----------------------
STRIPE_SECRET_KEY=sk_live_CHANGE_ME
STRIPE_WEBHOOK_SECRET=whsec_CHANGE_ME
# Optional overrides; leave empty to use APP_BASE_URL defaults
STRIPE_SUCCESS_URL=
STRIPE_CANCEL_URL=

# -----------------------
# SMTP mail sender
# -----------------------
EMAIL_PROVIDER=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_STARTTLS=true
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_HELO_NAME=summerseminar2026.hu
SMTP_TLS_REJECT_UNAUTHORIZED=true
EMAIL_FROM=no-reply@summerseminar2026.hu
EMAIL_FROM_NAME=Ishido Sensei - Summer Seminar
# Optional admin notification on each new registration
ADMIN_NOTIFY_EMAIL=

# -----------------------
# Szamlazz.hu
# -----------------------
SZAMLAZZ_ENABLED=true
SZAMLAZZ_AGENT_KEY=CHANGE_ME
SZAMLAZZ_API_URL=https://www.szamlazz.hu/szamla/
SZAMLAZZ_INVOICE_LANGUAGE=en
SZAMLAZZ_PAYMENT_METHOD=Bankkártya
SZAMLAZZ_AFAKULCS=AAM
SZAMLAZZ_AFAKULCS_OVER_LIMIT=27
SZAMLAZZ_ESZAMLA=true
SZAMLAZZ_SEND_EMAIL=true
SZAMLAZZ_SET_PAID=true
SZAMLAZZ_COMMENT=Ishido Sensei - Summer Seminar 2026
SZAMLAZZ_EXTERNAL_ID_PREFIX=camp-
SZAMLAZZ_REQUEST_TIMEOUT_MS=15000

# -----------------------
# Limits and retries
# -----------------------
REGISTRATION_RATE_LIMIT_COUNT=30
REGISTRATION_RATE_LIMIT_WINDOW_MS=600000
ADMIN_EMAIL_MAX_RECIPIENTS=500
ADMIN_EMAIL_RATE_LIMIT_COUNT=20
ADMIN_EMAIL_RATE_LIMIT_WINDOW_MS=600000
RETRY_PAYMENT_LINK_TTL_SECONDS=604800

# -----------------------
# SQLite backup
# -----------------------
DB_BACKUP_ENABLED=true
DB_BACKUP_INTERVAL_MINUTES=60
DB_BACKUP_DIR=./data/backups
DB_BACKUP_RETENTION_DAYS=30
EOF

chmod 600 "${TARGET_FILE}" || true

echo "Created ${TARGET_FILE}"
echo "Next:"
echo "1) Fill every CHANGE_ME value."
echo "2) Load and start:"
echo "   set -a; source ${TARGET_FILE}; set +a; npm run start"
