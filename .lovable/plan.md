## Goal

Turn `/admin/operator` from a proposer into a real agent: LLM reasoning goes through the runtime the user already picked in `/admin/agent-runtime` (OpenRouter, local Ollama, or Hermes), and approved actions actually change the database through a hardened, allow-listed, audit-logged path.

## What exists today (from exploration)

- **`server/index.js`** — local Node runtime holds runtime settings (`mode`, `openrouterKeyEncrypted`, `ollamaBaseUrl`, `ollamaModel`, `hermesProvider`) via encrypted `saveRuntimeSettings`/`loadRuntimeSettings`. Endpoints already present: `GET/PUT /api/runtime/settings`, `POST /api/operator/chat` (protected by `KAPWA_ADMIN_TOKEN`, uses `runConfiguredModel`), `GET /api/hermes/health`.
- **`supabase/functions/ops-coordinator`** — fetches deterministic snapshot, currently calls OpenRouter directly using an `OPENROUTER_API_KEY` env var (the one the user said not to add) and returns `buildActionProposals` for `create_housekeeping_task` and `escalate_guest_request`.
- **`supabase/functions/resort-operator`** — deterministic planner + executor writing `ops_cases`. Already gated by `x-internal-secret` / admin JWT. Now reachable (once `INTERNAL_FN_SECRET` matches).
- **`src/pages/ResortOperatorPage.tsx`** — calls `ops-coordinator` and `resort-agent-loop`; `executeApprovedAction` writes directly to `housekeeping_orders`/`guest_requests` from the browser using the anon key. No `CREATE_TASK`, no server-side allow-list, only 2 action types.

## Architectural constraint

`server/index.js` runs on the operator's own machine — Supabase Edge Functions cannot reach `http://127.0.0.1:3000`. So the runtime bridge must be **browser → local runtime**, not edge → local runtime. The Operator page is where the two worlds meet.

## Plan

### 1. LLM reasoning goes through the configured runtime

- Stop having `ops-coordinator` do its own OpenRouter call. It will keep producing the deterministic snapshot + action proposals but skip its model call by default; the user's `OPENROUTER_API_KEY` remains not required.
- Add a client helper `src/lib/agentRuntime.ts` that:
  - Reads `VITE_AGENT_RUNTIME_URL` and the browser-stored `KAPWA_ADMIN_TOKEN` (existing session-storage pattern used by `/admin/agent-runtime`).
  - Exposes `getRuntimeSettings()`, `runtimeHealth()`, `askOperator(snapshot, question, deterministicSummary)` which POSTs to `/api/operator/chat`.
  - Gracefully degrades: if the runtime is unreachable or unauthorized, returns `{ provider: 'deterministic', reply: null }` so the UI falls back to the snapshot brief (already the pattern in `ops-coordinator`).
- `ResortOperatorPage` composes: deterministic snapshot from `ops-coordinator` → send to `askOperator` → merge model narrative + action proposals from both `ops-coordinator` and `resort-operator` cycle.

### 2. Executable action allow-list (server-side)

- New edge function `supabase/functions/resort-operator-execute/index.ts`, gated by admin JWT (same `isAdminRequest` pattern used in `resort-operator` and `ops-coordinator`). Accepts:
  ```
  { action_type: 'CREATE_HOUSEKEEPING_ORDER' | 'ESCALATE_GUEST_REQUEST' | 'CREATE_TASK',
    payload: {...}, source_action_id: string, decided_by: string }
  ```
- Behavior per action:
  - `CREATE_HOUSEKEEPING_ORDER`: validate `unit_name`; dedupe against active `housekeeping_orders`; insert `{ status: 'pending_inspection', cleaning_notes: 'Created by Resort Operator (approved)' }`.
  - `ESCALATE_GUEST_REQUEST`: require `guest_request_id`; update status to `escalated`, `updated_at = now()`. Return current row for the UI.
  - `CREATE_TASK`: insert into `resort_ops_tasks` with `title`, `category`, `priority`, optional `due_date`, `description`, `status='pending'`. This is the new capability.
- Every branch writes an `audit_log` row with `actor='resort-operator'`, `action`, `table_name`, `record_id`, `details` (JSON of inputs + result). Uses service role. Returns `{ ok, executed, record, skipped?, reason? }`.
- Anything not in the allow-list returns `{ ok: false, error: 'action_type not permitted' }`.
- `verify_jwt = false` in function config is fine (Lovable default); auth is checked in code.

### 3. Client rewiring

- Replace `executeApprovedAction` in `ResortOperatorPage.tsx` with a call to `supabase.functions.invoke('resort-operator-execute', { body: { action_type, payload, source_action_id, decided_by } })`. Remove the direct client-side writes to `housekeeping_orders` and `guest_requests`.
- Map existing planner/coordinator proposal shapes to the new `action_type` values:
  - `create_housekeeping_task` → `CREATE_HOUSEKEEPING_ORDER`
  - `escalate_guest_request` → `ESCALATE_GUEST_REQUEST`
  - new `create_task` proposals surfaced by ops-coordinator (from `overdue_tasks` / `maintenance` items) → `CREATE_TASK`
- Extend `buildActionProposals` in `ops-coordinator` to emit `CREATE_TASK` proposals for maintenance items flagged as `missing_orders`-style gaps (bounded to keep the queue readable).
- Every executed action refreshes `OpsCasesPanel` and invalidates queries as it already does.

### 4. Run Daily Operator button

- Add a primary button "Run Daily Operator" above the existing brief controls. On click:
  1. `getRuntimeSettings()` — surface which provider will be used (`Badge` on the button area).
  2. `runtimeHealth()` — non-blocking; shows a warning toast if degraded.
  3. Run the coordinator (`type: 'daily'`) to build the deterministic snapshot + baseline proposals.
  4. Call `askOperator(snapshot, question, deterministicSummary)`; if it succeeds, replace the brief text with the model narrative and tag it with the provider/model returned.
  5. Also kick a `resort-operator` cycle (`action: 'cycle'`) so `ops_cases` is up to date; merge any new proposals into the approval queue.
  6. Store all proposals in the existing `actions` state → the existing approval queue drives execution through step 3.

### 5. Audit & safety

- The edge function is the single write path for these three actions → audit rows are guaranteed. The old client-side `logAudit` calls stay for user-decision events (approved/rejected) but data writes leave the browser.
- Approval boundary preserved: nothing outside the allow-list can be executed; risk_level `high`/`critical` proposals still require manual handling.
- Keep `server/index.js` encryption untouched. No new secrets. `INTERNAL_FN_SECRET` and `STAFF_JWT_SECRET` unchanged.

### 6. Verification checklist

- Unit-ish: curl the new edge function with a forged non-admin JWT → 403; with admin JWT → executes and writes `audit_log` row (`supabase--read_query` confirms).
- End-to-end from `/admin/operator`:
  - "Run Daily Operator" produces a brief; provider badge shows the runtime mode.
  - Approve a housekeeping proposal → new `housekeeping_orders` row + `audit_log` entry.
  - Approve an urgent-request proposal → target `guest_requests.status='escalated'` + `audit_log` entry.
  - Approve a task proposal → new `resort_ops_tasks` row + `audit_log` entry.
  - Re-approve the same proposal → server returns `skipped` (dedupe), no duplicate row.
- Runtime unreachable → brief falls back to deterministic text, execution still works (execution never depended on the LLM).

## Files touched

Create:
- `supabase/functions/resort-operator-execute/index.ts`
- `src/lib/agentRuntime.ts`

Modify:
- `src/pages/ResortOperatorPage.tsx` (execution path, Run Daily Operator button, provider badge, task proposals)
- `supabase/functions/ops-coordinator/index.ts` (drop mandatory OpenRouter call; add `CREATE_TASK` proposals)

Untouched:
- `server/index.js`, all encryption/settings logic, `resort-operator` planner/executor internals, `ops_cases` schema, existing RLS.

## Out of scope

- Extending the allow-list beyond the three actions (booking changes, payments, refunds, external messages remain manual).
- Making `server/index.js` reachable from edge functions (not needed for this scope).
- The lingering `INTERNAL_FN_SECRET` value mismatch (10 vs 32 chars) — orthogonal to this plan and tracked separately.
