# KAPWA Hospitality OS

An open-source, AI-powered resort management platform built for boutique properties in the Philippines, running on a standalone **Node/Express + Neon PostgreSQL + React/Vite** stack.

## What is KAPWA?

KAPWA is a full-stack resort operations system with:

- **AI Resort Operator** — Autonomous agent that monitors operations across 9 domains, detects issues, and proposes/executes verified actions
- **TALA Guest Concierge** — AI concierge for guest requests, dining orders, tours, and billing (text + LiveKit voice)
- **Reception & Reservations** — Calendar view, booking management, Sirvoy & OTA webhook sync
- **Housekeeping & Maintenance** — Task boards, inspection checklists, performance tracking
- **F&B Operations** — Menu management, order taking, kitchen/bar display, tabs, inventory stock deduction, cashier
- **Staff Management** — Scheduling, timesheets, payroll, PBKDF2 PIN + HS256 JWT authentication, role-based access control
- **Guest Portal** — Self-service portal for guests to check bills, make requests, order food, and book tours
- **Financial Reporting** — P&L reports, expense tracking with OpenRouter Vision OCR receipt scanning, accounting export

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vite + React 18 + TypeScript |
| **UI** | shadcn/ui + Tailwind CSS |
| **State** | Zustand + TanStack React Query |
| **Database** | **Neon PostgreSQL** (`@neondatabase/serverless` & `pg`) + embedded local JSON store fallback |
| **Backend API & Services** | **Node.js + Express** (`/api/db`, `/api/rpc`, `/api/functions`, `/api/auth`, `/api/storage`, `/api/realtime`) |
| **Authentication & RBAC** | Independent PBKDF2-SHA256 PIN + HS256 JWT (`server/services/auth.js`) + Crown-Jewel RBAC (`server/middleware/permissions.js` & `db/permissions.sql`) |
| **Realtime** | Server-Sent Events (SSE) (`server/services/realtime.js`) |
| **Storage** | Independent file storage service (`server/services/storage.js`) for `receipts`, `logos`, `guest-documents` |
| **AI / LLM** | OpenRouter & local Ollama (`server/services/modelGateway.js`) |
| **Voice** | Python + LiveKit (`voice-agent/`) |

## Project Structure

```text
kapwa-resort-webapp/
├── db/                                 # Standalone Neon PostgreSQL database layer
│   ├── schema.sql                      # Consolidated 73-table schema, enums, triggers & decrement_stock RPC
│   ├── permissions.sql                 # PostgreSQL session-claim RBAC helpers & employees_public view
│   └── migrate.js                      # Node migration runner (npm run db:migrate)
├── server/                             # Standalone Node.js + Express backend (Port 3000)
│   ├── index.js                        # Main Express API server (/api/db, /api/rpc, /api/functions, /api/storage, /api/realtime)
│   ├── db/
│   │   └── adapter.js                  # Dual-mode Neon PostgreSQL pool + embedded relational store adapter
│   ├── middleware/
│   │   └── permissions.js              # Crown-Jewel RBAC enforcement & sensitive column sanitization
│   ├── operator/                       # Autonomous Resort Operator loop (Node runtime)
│   │   ├── system-map.js               # Domains, tables, tools & approval boundaries
│   │   ├── state.js                    # Unified resort state loader
│   │   ├── planner.js                  # Deterministic 9-domain operational planner
│   │   ├── executor.js                 # Case executor & database verifier
│   │   ├── cases.js                    # Case lifecycle & history helpers
│   │   └── brain.js                    # LLM case triage & manager Q&A
│   ├── services/
│   │   ├── auth.js                     # Independent PBKDF2 PIN + HS256 JWT staff authentication & rate limiter
│   │   ├── functions.js                # Native Node handlers for all 24 operational/webhook/AI functions
│   │   ├── guestTools.js               # 20+ live resort tools for TALA Guest Concierge
│   │   ├── modelGateway.js             # Unified OpenRouter & Ollama model gateway
│   │   ├── realtime.js                 # Server-Sent Events (SSE) postgres_changes broadcast hub
│   │   └── storage.js                  # Local/volume bucket storage (receipts, logos, guest-documents)
│   ├── agent/
│   │   └── resort-operator.js          # Scheduled cron operator brief & action runner
│   └── lib/
│       └── model-runtime.js            # Encrypted agent settings model runtime
├── src/                                # React + TypeScript frontend (Port 8080)
│   ├── pages/                          # 25 route pages (Index, AdminPage, ReceptionPage, GuestPortal, ResortOperatorPage, etc.)
│   ├── components/                     # UI components organized by domain
│   │   ├── admin/                      # Admin dashboard, payroll, accounting, menu, inventory, RBAC diagnostics
│   │   ├── reception/                  # Room calendar, check-in/out, Sirvoy sync
│   │   ├── rooms/                      # Room billing, folios, settlements, audit logs
│   │   ├── service/                    # Kitchen, bar, cashier, orders, tours, housekeeping, manager view
│   │   ├── employee/                   # Staff tasks, schedules, shift clock-in/out, bonuses
│   │   ├── guest/                      # Guest portal & TALA AI concierge chat
│   │   └── ui/                         # shadcn/ui primitives
│   ├── hooks/                          # React Query & realtime subscription hooks
│   ├── lib/
│   │   ├── kapwaClient.ts              # Standalone browser client (DB query builder, RPC, Functions, Storage, SSE Realtime)
│   │   ├── staffAuth.ts                # Client-side JWT claim decoder & /api/auth/probe verifier
│   │   ├── edgeFunctions.ts            # Authoritative registry of all 24 backend functions
│   │   └── standaloneKapwa.test.ts     # Vitest suite for Operator Loop, Auth, and RBAC
│   └── integrations/supabase/
│       ├── client.ts                   # Compatibility alias exporting kapwaClient
│       └── types.ts                    # Database TypeScript definitions
├── voice-agent/                        # Python LiveKit voice agent (TALA Voice)
│   ├── agent/
│   │   ├── main.py                     # LiveKit voice worker entrypoint
│   │   ├── config.py                   # Environment settings (KAPWA_API_URL / DATABASE_URL)
│   │   ├── supabase_client.py          # Standalone KAPWA REST / Neon query client
│   │   ├── memory/                     # Guest profile & conversation memory
│   │   └── tools/                      # Voice tools for rooms, dining, tours, and requests
│   └── docker-compose.yml              # LiveKit voice agent container config
├── docs/                               # Architecture, security gates & operations documentation
├── NEON_SETUP.md                       # Step-by-step Neon PostgreSQL setup & migration guide
└── SECURITY_GATE.md                    # Security verification checklist
```

## Quick Start

```sh
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Set DATABASE_URL in .env for Neon PostgreSQL (or leave blank to use the embedded local store)

# 3. Apply database schema to Neon PostgreSQL (when DATABASE_URL is set)
npm run db:migrate

# 4. Start the backend server (port 3000) and frontend dev server (port 8080)
npm run server
npm run dev
```
