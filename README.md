# Iaidō Nyári Tábor - Demo Implementáció

Ez a projekt egy ideiglenes tábori weboldal demó:
- bemutatkozó oldal (`/`)
- jelentkezési oldal (`/jelentkezes`)
- admin demo oldal (`/admin`)

## Mi működik most
- Regisztrációs űrlap a kért mezőkkel
- Csomagválasztás: `Iaidō` / `Jōdō` / `Iaidō + Jōdō`
- Opcionális étkezés és szállás választás
- Élő árkalkuláció a jelentkezési oldalon
- Magánszemély számlázási adatok bekérése
- Fokozat + vizsgaszándék + célfokozat
- Szerveroldali validáció
- Mentés lokális SQLite adatbázisba (`data/camp.db`)
- Admin felület bejelentkezéssel védve (`/admin`)
- Egyszerű statisztika API és admin lista

## Adattárolás
- Aktív adattár: `data/camp.db` (SQLite)
- Egyszeri automatikus migráció: ha létezik `data/registrations.json` és a DB még üres, a rendszer áthozza az adatokat SQLite-ba.

## Mi nincs még bekötve
- Stripe fizetés
- Számlázz.hu számlakiállítás
- Google Sheets adattárolás

A fenti integrációkhoz stub API végpontok már elérhetők:
- `GET /api/pricing`
- `POST /api/payments/create-checkout-session`
- `POST /api/invoices/create`
- `POST /api/stripe/webhook`

## Futtatás

```bash
npm run dev
```

Ezután nyisd meg:
- http://localhost:3000/
- http://localhost:3000/jelentkezes
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
