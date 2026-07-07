# KAPWA OS — Commercial Pilot Plan

Status: Draft v0.1 — source-of-truth notes for one private KAPWA Hospitality OS deployment.
Scope: one property, one customer-controlled Supabase project, one domain, one dataset.
Audience: Merqato Digital + property owner/manager + implementation lead.

---

## 1. Current product inventory

### 1.1 Customer-facing surfaces
- Admin: present, operational for configuration, reporting, staff management, billing, audit logging, expense/budget views.
- Front desk / reception: present, operational for arrivals, departures, room status, guest search, room billing, cashier flows, service orders.
- Staff portal / roles: present and operational with role-gated shells and permission checks.
- Housekeeping: operational with inspection workflow, unit status changes, task queue, and housekeeping-specific config.
- Kitchen: operational with department order board and item preparation/status workflow.
- Bar: present, operational through department order board and menu dependency flows.
- Cashier / payments: operational through room billing modal, payment recording, checkout flow.
- Waitstaff / order taking: operational through order type, menu, cart/drawer, and department routing.
- Guest portal: operational, room branded with dynamic resort name fallback.
- Tours/experiences: operational through tour booking config, availability calendar, pricing/slots, and today-s view.
- Service boards: operational with live board views by department.
- Reports: operational with PnL export/report HTML generation and visual breakdown charts.
- PDF exports: operational via browser print-to-PDF from generated P&L HTML.
- OCR: configuration present for receipt scanning; function exists and calls the external AI gateway.
- Message exports: WhatsApp notification formatting exists.
- Hermes-assisted features: assistant chat panel exists in UI; backend coordination functions exist; loop/agent code exists in `voice-agent/` and as reusable architecture only.

### 1.2 Backend and runtime
- Supabase: used for data, auth, storage, Edge Functions, and webhooks.
- Edge Functions: admin-summary, concierge-ai, employee-auth, forecast-7day, frontdesk-today, guest-requests-api, guest-search, housekeeping, ops-coordinator, orders-today, process-webhook-queue, reservations-ai, send-telegram, sirvoy-webhook, today-ops, tours-today, scan-receipt.
- Server: Hermes proxy exists at `server/` with defined local transport identity and package metadata.
- Local orchestral layer: voice agent module exists with agent loops, tools, memory schema, PWA frontend, and docker-compose automation.
- Data persistence: Supabase-backed with operational tables, RLS policies in documentation, and service-role access patterns.
- Browser/build: Vite + React + TypeScript with shadcn/ui, route shells, layout system, and offline-capable PWA layer for voice agent frontend.

### 1.3 Security and compliance status
- Row-level security: documented as rollout target, not assumed complete from source alone.
- Employee PIN auth: function exists and mints staff JWTs during PIN login.
- Staff JWT flow: not verified end-to-end from browser to Supabase/RPC here; review required before sale.
- Browser security: localStorage/sessionStorage exposure, logout behavior, share-device risk, CSP/secure headers not verified here.
- CORS: not verifyable from a static audit; customer install must set per-deployment allowlist.
- External dependencies: `npm audit` shows moderate/high/critical issues in install tree; do not treat as safe until patched per customer deployment.
- Secrets hygiene: internal function secret is currently driven by an example env var; client-side references remain present in `AdminPage.tsx` and must be migrated to a server/Edge Function flow before production deployment.

### 1.4 UX and branding
- Rebrand to KAPWA OS substantially complete in source, docs, and UI strings.
- Final customer-facing polish should move from “KAPWA OS” to the customer’s own property branding during setup.
- Module naming should use property-native labels in day-to-day operation; `KAPWA Front Desk`, `KAPWA Housekeeping`, etc. are for marketing and onboarding only.

---

## 2. Pilot architecture

Principle: private deployment per customer. No multi-tenant SaaS in this phase.

### 2.1 What runs where
- Browser: UI, offline shells, local form state, print-to-PDF exports, PWA voice-agent shell.
- Supabase: auth, database, storage, scheduled/webhook integrations, Edge Functions.
- Optional Hermes/Ollama/LiveKit stack: voice concierge, daily summary, assistance, agent loops.
- Merqato-supplied docker/service layer: private only when required; default is managed Supabase + optional private Hermes host.

### 2.2 Data isolation
- One Supabase project per customer.
- One service-role secret known only to deployment and Edge Functions.
- Staff credentials and guest data never cross customers.
- Backups are per-customer and stored under customer-controlled location.

### 2.3 Deployment shape
- Customer-approved domain tied to Vercel or equivalent frontend host.
- Frontend build env contains only public Supabase anon settings.
- Internal Edge Function secret and Hermes API host are never exposed to browser.
- All webhook and integration endpoints honor customer-specific allowlist.

---

## 3. Pilot scope and boundaries

### 3.1 In scope
- Admin, front desk, housekeeping, kitchen, bar, waitstaff, cashier, guest portal.
- Department boards, room status, orders, payments, reports.
- Staff login with PIN and role authorization backed by staff JWT and RLS.
- Daily summary, staff assistance, and optional Hermes voice agent.
- Company onboarding, role setup, department setup, menu services, backup testing, handover.

### 3.2 Out of scope for pilot
- Multi-property single deployment.
- Public multi-tenant SaaS identity model.
- Global AI training from customer data.
- External marketplace integration beyond configured property channels.

### 3.3 Optional extensions after pilot
- Custom Hermes skill packs.
- Integration spreadsheet normalizers for Sirvoy or channel manager feeds.
- Enhanced OCR and inventory workflows.
- Custom module branding beyond property name/tagline.

---

## 4. Customer installation checklist (repeatable)

1. Repository clone on Vercel or private host with Node 22+ runtime.
2. Create new customer Supabase project.
3. Apply database schema migrations.
4. Apply RLS policy suite.
5. Configure environment variables:
   - public Supabase URL and anon key
   - internal Edge Function secret
   - staff JWT secret
   - Hermes host/token if enabled
   - AI gateway key if scan/concierge is enabled
6. Configure domain and CORS origin.
7. Create initial admin staff user with strong PIN.
8. Bootstrap roles, departments, menus, services, pricing, tour slots.
9. Set property branding: resort name, tagline, address, WhatsApp number, receipt wording.
10. Create backup destination and retention policy.
11. Connect and verify:
    - webhook endpoints
    - Telegram/WhatsApp integrations if used
    - Hermes task bridge if enabled
12. Training session: admin, front desk, housekeeping, kitchen, bar, guest portal demo.
13. Go-live checklist completion and sign-off.
14. Support window and on-call handover.

---

## 5. Packages

### 5.1 KAPWA OS Core
- Private branded backoffice deployment
- Admin + staff accounts with roles
- Department operations across front desk, housekeeping, kitchen, bar
- Service boards, reporting, menus
- Setup and training

### 5.2 KAPWA OS Intelligence
- Core features plus Hermes assistant
- Daily owner summary
- Guest-response drafting and staff-task assistance
- Review-response support and marketing support
- Human approval controls
- Optional Mission Control integration

### 5.3 KAPWA OS Private
- Private infrastructure management
- Custom domain
- Custom modules and advanced integrations
- Backups and monitoring
- Priority support

---

## 6. Recommended first commercial pilot profile

Target: one active hospitality property in site collection. Maximum operational clarity, minimum infrastructure simultaneous change. Acceptable outcomes: validated booking-to-checkout flow, live department boards, working guest portal, measurable staff time savings on morning briefing/reporting.

---

## 7. Success metrics

- Staff adoption within 7 days of go-live
- Guest response time improvement from message receipt to action
- Missed service requests before/after
- Order processing time by department
- Housekeeping turnaround time
- Operational error reduction
- Owner reporting time
- Support requests by severity
- System uptime

---

## 8. Roadmap and next actions

Phase 1 — safe rebrand: complete.
Phase 2 — pilot plan: this document as draft v0.1.
Next immediate action: explicit owner approval for hardcoded internal secret migration and browser-trusted internal request header removal from client surface.
After approval: move `x-internal-secret` requests into Edge Functions, prove staff JWT/RoS paths under testable user store, then publish pilot install checklist under docs.
