# Iaido Nyári Tábor - Webalkalmazás

Ez a projekt egy nyári tábori weboldal:
- welcome oldal (`/`)
- program oldal (`/program`)
- FAQ oldal (`/faq`)
- info oldal (`/info`)
- adatkezelési tájékoztató (`/privacy`)
- részvételi feltételek (`/terms`)
- jelentkezési oldal (`/registration`)
- admin oldal (`/admin`)

## Mi működik most
- Regisztrációs űrlap a kért mezőkkel
- Csomagválasztás: `Iaido` / `Jodo` / `Iaido + Jodo`
- Fizetés kizárólag EUR pénznemben
- Élő árkalkuláció a jelentkezési oldalon (EUR)
- Magánszemély számlázási adatok bekérése
- Külön Iaido/Jodo fokozat + külön Iaido/Jodo vizsgaszándék + célfokozat
- Szerveroldali validáció
- Mentés lokális SQLite adatbázisba (`data/camp.db`)
- SQLite terheléskezelés: `busy_timeout` + automatikus retry íráskor
- Admin felület bejelentkezéssel védve (`/admin`)
- Admin statok Iaido/Jodo bontással
- Admin árbeállítások (EUR árak)
- Admin email-küldés template vagy egyéni tartalommal
- Admin email-küldés címzett csoportokra: kiválasztott / összes aktív / csak fizetett / csak függő fizetés
- Jelentkezői opciók részletes megjelenítése az admin táblában
- Jelentkezés státusz alapú törlése (`DELETED`, sor megtartásával)
- GDPR anonimizálás adminból (`ANONYMIZED`, személyes adatok tisztítása)
- Hozzájárulás verzió és időbélyeg mentése minden regisztrációnál
- CSV export az admin felületről
- Egyszerű statisztika API és admin lista
- Stripe Checkout session létrehozás regisztráció után
- Stripe webhook alapú státuszfrissítés (`PAID`)
- Adminból egyedi újrafizetési link generálás és másolás
- Automatikus SQLite backup minden nap éjfélkor (`data/backups`)
- Kézi SQLite backup indítás adminból

## Adattárolás
- Aktív adattár: `data/camp.db` (SQLite)
- Egyszeri automatikus migráció: ha létezik `data/registrations.json` és a DB még üres, a rendszer áthozza az adatokat SQLite-ba.

## Mi nincs még bekötve
- NAV Online Számla számlakiállítás
- Google Sheets adattárolás

## Email (Brevo) integráció
- Regisztráció után a rendszer tud visszaigazoló emailt küldeni a jelentkezőnek.
- Opcionálisan külön admin értesítő email is küldhető.
- Az email küldés nem blokkolja a regisztráció mentését (hiba esetén logolás történik).

Szükséges env változók:

```bash
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
EMAIL_PROVIDER=brevo
BREVO_API_KEY=...
EMAIL_FROM=no-reply@your-domain.com
EMAIL_FROM_NAME=Ishido Sensei - Summer Seminar
ADMIN_NOTIFY_EMAIL=you@example.com
ADMIN_EMAIL_MAX_RECIPIENTS=500
APP_BASE_URL=https://your-domain.com
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Optional
STRIPE_SUCCESS_URL=https://your-domain.com/registration?payment=success
STRIPE_CANCEL_URL=https://your-domain.com/registration?payment=cancel
RETRY_PAYMENT_LINK_TTL_SECONDS=604800
DB_BACKUP_ENABLED=true
DB_BACKUP_DIR=./data/backups
DB_BACKUP_RETENTION_DAYS=30
```

A fenti integrációkhoz elérhető API végpontok:
- `GET /api/pricing`
- `GET /api/admin/session`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `POST /api/admin/password`
- `GET /api/admin/email/templates`
- `POST /api/admin/email/send`
- `GET /api/admin/pricing`
- `POST /api/admin/pricing`
- `POST /api/admin/registrations/mark-deleted`
- `POST /api/admin/registrations/anonymize`
- `POST /api/admin/registrations/retry-link`
- `POST /api/admin/backup`
- `GET /api/admin/export.csv`
- `POST /api/payments/create-checkout-session`
- `POST /api/invoices/create`
- `POST /api/stripe/webhook`

## Futtatás

```bash
npm run dev
```

Ezután nyisd meg:
- http://localhost:3000/
- http://localhost:3000/program
- http://localhost:3000/faq
- http://localhost:3000/info
- http://localhost:3000/privacy
- http://localhost:3000/terms
- http://localhost:3000/registration
- http://localhost:3000/admin

Az admin oldal nincs linkelve a publikus menüből, csak közvetlen URL-en érhető el.

## Admin bejelentkezés
- Az admin belépés jelszó alapú.
- Kezdeti (bootstrap) jelszó: `ADMIN_PASSWORD` env (ha nincs megadva: `admin123`).
- A jelszó hash-elve kerül mentésre SQLite-ba (`app_settings`), és admin felületről módosítható.
- Login védelem: 5 sikertelen próbálkozás után 15 perces IP alapú átmeneti tiltás.
- Jelszócsere után új session cookie keletkezik, régi sessionök érvénytelenednek.
- Éles környezetben kötelező erős jelszót és új session secretet használni:

```bash
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=egy-hosszu-veletlen-titok
```

Részletes leírás: [ADMIN_SECURITY.md](./ADMIN_SECURITY.md)

### Admin jelszócsere menete
1. Jelentkezz be a `/admin` oldalon.
2. Nyisd le a `Security` panelt.
3. Add meg a jelenlegi jelszót, majd az új jelszót kétszer.
4. Kattints az `Update admin password` gombra.

Jelszószabály:
- minimum 8 karakter
- legyen benne legalább 1 betű
- legyen benne legalább 1 szám

### Üzemeltetési javaslat éles környezethez
1. Állíts be erős, egyedi `ADMIN_PASSWORD` értéket az indulás előtt.
2. Állíts be hosszú, random `ADMIN_SESSION_SECRET` értéket.
3. Használj HTTPS-t (production alatt Secure cookie aktív).
4. Tartsd bekapcsolva az automatikus backupot.

## Környezeti igény
- Node.js 22+ (a `node:sqlite` modul miatt)

## Railway megjegyzés
- A deploy környezetben is Node 22 kell.
- Ha Railway mégis Node 18-at indítana, add meg env-ben:
  - `NIXPACKS_NODE_VERSION=22`

## GDPR minimum checklist (üzemeltetés)
- Töltsd ki a valós adatkezelői adatokat a `/privacy` oldalon.
- Kösd meg a szükséges adatfeldolgozói szerződéseket (pl. Stripe, Számlázz.hu, hosting).
- Véglegesítsd a megőrzési idő szabályt és anonimizálási/törlési folyamatot.
- Legyen incidenskezelési folyamat (adatvédelmi esemény bejelentése).
- Éles indulás előtt jogi felülvizsgálat javasolt.
