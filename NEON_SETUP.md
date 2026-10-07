# Neon PostgreSQL Setup Guide for KAPWA Hospitality OS

KAPWA Hospitality OS is designed for **Neon Serverless PostgreSQL** with a completely self-contained Node/Express backend.

---

## 1. Create a Neon PostgreSQL Project

1. Sign in to [Neon Console](https://console.neon.tech) and create a new project (PostgreSQL 16 or 17, region closest to your resort/server, e.g., Singapore `ap-southeast-1`).
2. Copy your connection string from the Neon Dashboard:
   ```text
   postgresql://<user>:<password>@<endpoint>.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

---

## 2. Configure `.env`

Set `DATABASE_URL` and your security secrets in `.env`:

```env
DATABASE_URL="postgresql://<user>:<password>@<endpoint>.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
STAFF_JWT_SECRET="<64-char-hex-secret>"
INTERNAL_FN_SECRET="<64-char-hex-secret>"
VITE_ENFORCE_STAFF_JWT="auto"
```

---

## 3. Apply the Database Schema & Permissions

Run the standalone migration runner:

```sh
npm run db:migrate
```

This applies:
- `db/schema.sql`: All 73 KAPWA Hospitality OS tables, enums, indexes, `updated_at` triggers, and `decrement_stock(uuid, numeric)` inventory function.
- `db/permissions.sql`: Session-variable permission helpers (`public.app_permissions()`, `public.is_staff()`, `public.is_admin()`, `public.has_permission(text)`) and the `public.employees_public` view (which strips `password_hash`).

---

## 4. Verify the Connection

Start the backend server and query `/api/health`:

```sh
npm run server
curl http://localhost:3000/api/health
```

When `DATABASE_URL` is configured, `/api/health` reports:
```json
{
  "ok": true,
  "service": "kapwa-os-standalone",
  "db": {
    "mode": "neon-postgres",
    "connected": true
  }
}
```
