# KAPWA Hospitality OS — Standalone Resort Operating System

KAPWA Hospitality OS is a standalone, full-stack hospitality operating system for boutique resorts (built for **BAIA Palawan**), powered by a **Node/Express backend**, **Neon PostgreSQL**, and a **React + Vite + TypeScript** frontend.

---

## Architecture Overview

| Layer | Standalone Implementation |
|---|---|
| **Database** | **Neon PostgreSQL** (`@neondatabase/serverless` & `pg`) via `server/db/adapter.js` + automatic embedded local JSON store fallback (`server/data/standalone-db.json`) for zero-config testing |
| **Database Schema & RBAC** | `db/schema.sql` (73 tables, triggers, `decrement_stock` RPC) + `db/permissions.sql` (PostgreSQL session-claim helpers & `employees_public` view) |
| **Authentication** | Independent PBKDF2 PIN + HS256 JWT staff authentication (`server/services/auth.js`) with brute-force rate limiting and `/api/auth/probe` |
| **Permissions (RLS Replacement)** | Application-level & database-level RBAC (`server/middleware/permissions.js` + `db/permissions.sql`) protecting crown-jewel tables (`employees`, `employee_permissions`, `payroll_payments`, `employee_bonuses`, `audit_log`, `settings`) |
| **File Storage** | Independent file storage service (`server/services/storage.js`) serving `receipts`, `logos`, and `guest-documents` buckets at `/api/storage/*` |
| **Realtime** | Independent Server-Sent Events (SSE) realtime hub (`server/services/realtime.js`) at `/api/realtime` |
| **Backend Services (24 Functions)** | Native Node/Express services (`server/services/functions.js`, `server/operator/*`, `server/services/guestTools.js`, `server/services/modelGateway.js`) |
| **AI Model Gateway** | OpenRouter & local Ollama (`server/services/modelGateway.js`) |

---

## Quick Start

### 1. Install Dependencies

```sh
npm install
```

### 2. Configure Environment (`.env`)

Copy `.env.example` to `.env`:

```sh
cp .env.example .env
```

- **With Neon PostgreSQL**: Set `DATABASE_URL="postgresql://..."` in `.env` and run migrations:
  ```sh
  npm run db:migrate
  ```
- **Local Zero-Config Testing**: Leave `DATABASE_URL` blank to use the built-in embedded relational store (`server/data/standalone-db.json`), pre-seeded with resort profile, rooms, menu, tours, and default staff accounts (`David` / PIN `5309`, `Maria` / PIN `1234`).

### 3. Start Backend & Frontend

Run the KAPWA OS backend (`http://0.0.0.0:3000`) and Vite frontend (`http://0.0.0.0:8080`):

```sh
# Terminal 1: Start KAPWA OS Backend Server
npm run server

# Terminal 2: Start KAPWA OS Web App
npm run dev
```

---

## Testing & Verification

```sh
# Run unit & operator loop tests
npm test

# Run production build check
npm run build
```

See [NEON_SETUP.md](./NEON_SETUP.md) for detailed Neon PostgreSQL provisioning and migration instructions.
