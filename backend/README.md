# Marshal Backend (Standalone)

Standalone **Node.js + Express + PostgreSQL (Prisma)** backend. This is the
single source of truth — Firebase/Firestore is no longer the backend.

```
Frontend (vanilla JS, later)
  ↓ REST API
Node.js + Express Backend
  ↓ Prisma ORM
PostgreSQL Database
```

## Features
- `GET  /api/health`
- `POST /api/bookings` — guest checkout, server-side nights/total, atomic
  availability check (PostgreSQL transaction), back-to-back allowed,
  cancelled stays don't block. Server-issued `accessToken`.
- `GET  /api/bookings/:id?accessToken=...` — ownership-checked lookup.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` —
  bcrypt + JWT, `USER`/`ADMIN` roles.
- `POST /api/payments/create-intent` — hosted Paymob checkout.
- `POST /api/payments/webhook` — HMAC-verified, idempotent.
- `POST /api/payments/:id/refund` — admin only.
- `POST /api/admin/*` — protected CRUD for rooms, bookings, menu, gallery,
  reviews, amenities, hotel settings.

## Setup (Windows — local PostgreSQL)

### 1. Install PostgreSQL
- Download the installer from https://www.postgresql.org/download/windows/
- During install, set a `postgres` superuser password and note the port
  (default **5432**).
- The installer offers **pgAdmin 4** and **Stack Builder**; pgAdmin is handy.

### 2. Create the database + user (PowerShell, via psql)
Open **SQL Shell (psql)** or run from PowerShell:

```powershell
# Connect as the postgres superuser (enter the password you set at install)
psql -U postgres -h localhost -p 5432
```

Then in the psql prompt:

```sql
CREATE USER marshal WITH PASSWORD 'marshal';
CREATE DATABASE marshal OWNER marshal;
GRANT ALL PRIVILEGES ON DATABASE marshal TO marshal;
\q
```

> The values above (`marshal` / `marshal`) match `.env.example`. Change them
> for anything non-local.

### 3. Configure environment
From `backend/`:

```powershell
Copy-Item .env.example .env
```

Then edit `backend/.env` and set at least:

```env
DATABASE_URL=postgresql://marshal:marshal@localhost:5432/marshal?schema=public
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
```

> **DATABASE_URL is required.** Its format is:
> `postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>?schema=public`
> Do NOT invent credentials — use the user/db you created in step 2.

### 4. Install deps
```powershell
npm install
```

### 5. Generate the Prisma client
```powershell
npm run prisma:generate
```

### 6. Apply the schema (creates tables; not destructive)
```powershell
npm run prisma:migrate -- --name init
# equivalent to: npx prisma migrate dev --name init
```

### 7. Optional dev seed
```powershell
npm run seed
```

### 8. Run
```powershell
npm run dev
# health check:
Invoke-RestMethod http://localhost:8080/api/health
```


## Security
- `helmet`, CORS with explicit `FRONTEND_ORIGIN`, rate limiting, Zod
  validation, central error handler, JWT auth, bcrypt password hashing.
- Paymob keys/HMAC live only in backend env. Secrets never reach frontend.
- Webhook verified via HMAC-SHA512; financial state set only server-side.

## Environment
See `.env.example`. Key vars:
`DATABASE_URL`, `JWT_SECRET`, `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`,
`PAYMOB_IFRAME_ID`, `PAYMOB_INTEGRATION_ID`, `FRONTEND_ORIGIN`.

## Notes
- The legacy `functions/` (Firebase) code is kept untouched for reference.
- Frontend wiring is a later phase.
