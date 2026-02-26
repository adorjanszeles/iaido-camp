# Iaido Nyári Tábor - Demo Implementáció

Ez a projekt egy ideiglenes tábori weboldal demó:
- welcome oldal (`/`)
- program oldal (`/program`)
- FAQ oldal (`/faq`)
- info oldal (`/info`)
- adatkezelési tájékoztató (`/privacy`)
- részvételi feltételek (`/terms`)
- jelentkezési oldal (`/registration`)
- admin demo oldal (`/admin`)

## Mi működik most
- Regisztrációs űrlap a kért mezőkkel
- Csomagválasztás: `Iaido` / `Jodo` / `Iaido + Jodo`
- Opcionális étkezés és szállás választás
- Élő árkalkuláció a jelentkezési oldalon
- Magánszemély számlázási adatok bekérése
- Külön Iaido/Jodo fokozat + külön Iaido/Jodo vizsgaszándék + célfokozat
- Szerveroldali validáció
- Mentés lokális SQLite adatbázisba (`data/camp.db`)
- SQLite terheléskezelés: `busy_timeout` + automatikus retry íráskor
- Admin felület bejelentkezéssel védve (`/admin`)
- Admin statok Iaido/Jodo bontással
- Jelentkezői opciók részletes megjelenítése az admin táblában
- Jelentkezés státusz alapú törlése (`DELETED`, sor megtartásával)
- GDPR anonimizálás adminból (`ANONYMIZED`, személyes adatok tisztítása)
- Hozzájárulás verzió és időbélyeg mentése minden regisztrációnál
- CSV export az admin felületről
- Egyszerű statisztika API és admin lista

## Adattárolás
- Aktív adattár: `data/camp.db` (SQLite)
- Egyszeri automatikus migráció: ha létezik `data/registrations.json` és a DB még üres, a rendszer áthozza az adatokat SQLite-ba.

## Mi nincs még bekötve
- Stripe fizetés
- Számlázz.hu számlakiállítás
- Google Sheets adattárolás

## Email (Brevo) integráció
- Regisztráció után a rendszer tud visszaigazoló emailt küldeni a jelentkezőnek.
- Opcionálisan külön admin értesítő email is küldhető.
- Az email küldés nem blokkolja a regisztráció mentését (hiba esetén logolás történik).

Szükséges env változók:

```bash
EMAIL_PROVIDER=brevo
BREVO_API_KEY=...
EMAIL_FROM=no-reply@your-domain.com
EMAIL_FROM_NAME=Ishido Sensei - Summer Seminar
ADMIN_NOTIFY_EMAIL=you@example.com
APP_BASE_URL=https://your-domain.com
```

A fenti integrációkhoz stub API végpontok már elérhetők:
- `GET /api/pricing`
- `POST /api/admin/registrations/mark-deleted`
- `POST /api/admin/registrations/anonymize`
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
- Alapértelmezett felhasználónév: `admin`
- Alapértelmezett jelszó: `demo-admin-123`
- Éles környezetben kötelező átállítani env változókkal:

```bash
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=egy-hosszu-veletlen-titok
```

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
