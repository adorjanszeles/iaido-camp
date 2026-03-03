# Admin Security Notes

## Authentication model
- Admin login is password-only.
- The initial password comes from `ADMIN_PASSWORD` (default fallback: `admin123`) on first boot only.
- Password is stored hashed in SQLite (`app_settings` table, key: `admin_auth_v1`).
- Hashing algorithm: `scrypt` with random salt.

## Login flow
- Endpoint: `POST /api/admin/login`
- Request body: `{ "password": "..." }`
- On success: HTTP-only session cookie (`admin_session`) is set.
- Session TTL: 12 hours.

## Brute-force protection
- Failed login attempts are tracked per client IP.
- After 5 failed attempts, login is blocked for 15 minutes.
- During block window: API returns `429` with `Retry-After` header.

## Password change
- Endpoint: `POST /api/admin/password`
- Requires active admin session.
- Required body:
  - `currentPassword`
  - `newPassword`
  - `confirmPassword`
- Password policy:
  - minimum 8 characters
  - must contain at least one letter
  - must contain at least one number
- After successful change:
  - password hash is updated in DB
  - a new session cookie is issued
  - previous sessions are invalidated

## Required environment variables
- `ADMIN_PASSWORD` (bootstrap password)
- `ADMIN_SESSION_SECRET` (session signing secret)

## Production checklist
1. Set a strong `ADMIN_PASSWORD` before first start.
2. Set a long random `ADMIN_SESSION_SECRET`.
3. Run behind HTTPS.
4. Keep SQLite backups enabled.
