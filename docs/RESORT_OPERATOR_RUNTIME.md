# Resort Operator Runtime

One central agent. Telegram, `/admin/operator`, guest portal, and staff screens are interfaces to it.

## Operating loop

```
loadResortState → plan (deterministic, goal-driven) → execute safe actions
→ queue sensitive actions as pending_approval cases → verify open cases against the DATABASE
→ retry → escalate past SLA → audit everything → repeat
```

## Components (all in `supabase/functions/resort-operator/`)

| File | Layer |
|---|---|
| `system-map.ts` | Machine-readable tool registry, tables, approval boundaries |
| `state.ts` | Unified resort state loader (read-only) |
| `cases.ts` | Shared case model helpers (idempotent open, history, resolve, escalate) |
| `planner.ts` | Compares state to permanent goals, emits prioritized actions with verification rules |
| `executor.ts` | Executes safe actions, enforces the approval boundary, verifies, retries, escalates |
| `index.ts` | HTTP entrypoint: `cycle`, `state`, `decide` |
| `loop_test.ts` | In-memory proof of Flow A + Flow B (`deno test --no-lock loop_test.ts`) |

Data: `ops_cases` table (migration `20260712080000_ops_cases.sql`). One open case per source record enforced by unique index.

## Hard safety boundary

`request_payment_action` and anything in `FORBIDDEN_WITHOUT_APPROVAL` only ever create a `pending_approval` case. The agent never performs payments, refunds, booking changes, deletions, or guest-facing commitments. Approval happens on `/admin/operator` (Live operational cases panel) and calls `{action:"decide"}`.

## Verification

The agent never trusts its own claims. Rules in `executor.ts` re-read the database:
- `guest_request_completed` — status/completed_at on guest_requests
- `balance_cleared` — room_rate + addons_total − paid_amount ≤ 0
- `housekeeping_order_exists`, `task_exists`

Failed verification past `due_at` → retry (max 2) → escalate.

## Deploy

1. Deploy edge function: `resort-operator` (plus the already-merged `send-telegram`, `concierge-ai`, `telegram-webhook`, `configure-telegram-webhook`, `resort-agent-loop`, `ops-coordinator`).
2. Run migrations `20260712080000_ops_cases.sql` and `20260712081000_operator_schedule.sql`.
3. One-time in SQL editor:
   ```sql
   select vault.create_secret('<PROJECT_URL>', 'project_url');
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
   ```
4. Confirm secrets on the function env: `INTERNAL_FN_SECRET` (shared with resort-agent-loop).

## Triggers

- Every 30 min via pg_cron (`resort-operator-cycle`).
- Immediately on new guest request (DB trigger).
- Manually from `/admin/operator` ("Run full resort loop" now includes the operator cycle).

## Extending to more domains

Add a detection block in `planner.ts` + a verification rule in `executor.ts`. The case model is domain-agnostic; order per product plan: housekeeping → maintenance → arrivals/departures → reservation exceptions → payments → tours → F&B.
