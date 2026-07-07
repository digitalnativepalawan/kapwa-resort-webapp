# KAPWA Hospitality OS setup — stand up a new Supabase for this deployment

This repo is a full-stack app (Vite + React + TypeScript + Supabase). The entire
backend is defined in-repo:

- `supabase/migrations/` — 65 SQL migrations (all tables, RLS, functions)
- `supabase/functions/` — 18 edge functions
- `supabase/config.toml` — Supabase project config
- `src/integrations/supabase/client.ts` — reads Supabase URL + key from env

⚠️ **Important:** out of the box this repo may still be pointed at the **previous**
Supabase project in `.env` and `supabase/config.toml`. For this deployment you want a
**new, separate** Supabase project. Importing the code alone does **not** auto-provision
one — you connect Supabase in your project settings, and the steps below tell the system
to apply everything to that fresh project.

---

## Step 1 — Import the repo into your project tool

Connect **`digitalnativepalawan/new-KAPWA OS-from-FABLE-5`** to a new project workspace.
Do **not** reuse the previous project.

## Step 2 — Stand up a new Supabase project and apply migrations

This project is an existing full-stack Vite + React + TypeScript app with a
Supabase backend that is fully defined in the repo. Do NOT rebuild or redesign
the app. I want you to stand up a brand-new, separate Supabase cloud for it.

Please:
1. Connect a **new** Supabase project (not any existing one).
2. Apply **all** migrations in `supabase/migrations/` (65 files) to that new
   project, in filename order, so the full schema, tables, and RLS policies
   are created.
3. Deploy every edge function in `supabase/functions/` (there are 18:
   employee-auth, concierge-ai, admin-summary, guest-requests-api,
   orders-today, frontdesk-today, housekeeping, tours-today, today-ops,
   ops-coordinator, reservations-ai, forecast-7day, guest-search,
   integration-webhook, process-webhook-queue, scan-receipt, send-telegram,
   sirvoy-webhook). Keep `verify_jwt = false` as set in `supabase/config.toml`.
4. Update `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `VITE_SUPABASE_PROJECT_ID`) and `supabase/config.toml` (`project_id`) to the
   new project's values.
5. Add these edge-function secrets (paste real values):
   `INTERNAL_FN_SECRET`, `STAFF_JWT_SECRET`, `OPENROUTER_API_KEY`,
   `LOVABLE_API_KEY`, `TELEGRAM_BOT_TOKEN`.
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically —
   don't set those.)
6. Leave `VITE_USE_STAFF_JWT` unset/false for now — claim-based auth stays off
   until RLS is migrated on staging (see `docs/security/rls-migration.md`).

After that, confirm the new Supabase project URL and verify the tables and
functions are live.

## Step 3 — Set the secrets

When prompted or in Supabase → Project Settings → Edge Functions → Secrets:

| Secret | Needed by | Where to get it |
|--------|-----------|-----------------|
| `INTERNAL_FN_SECRET` | admin-summary, guest-requests-api, concierge-ai, send-telegram | Generate a long random string |
| `STAFF_JWT_SECRET` | employee-auth (JWT login) | Supabase → Settings → API → JWT Secret |
| `OPENROUTER_API_KEY` | concierge-ai, ops-coordinator, reservations-ai, forecast-7day | openrouter.ai |
| `LOVABLE_API_KEY` | AI gateway function(s) | Project tool |
| `TELEGRAM_BOT_TOKEN` | send-telegram | Telegram @BotFather |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by
Supabase to edge functions — do not set them by hand.

---

## Security notes (already applied in this repo)

- The old "Free Login" instant-admin button is removed.
- `employee-auth` `set-password` now requires admin re-authentication.
- `admin-summary` and `guest-requests-api` are fail-closed behind
  `INTERNAL_FN_SECRET` — set that secret or they return 403 (by design).
- A JWT-claims login layer exists but is **off** (`VITE_USE_STAFF_JWT=false`).
- The full database lockdown (RLS) is written but not yet applied — see
  `docs/security/rls-migration.md` and apply on staging first.
