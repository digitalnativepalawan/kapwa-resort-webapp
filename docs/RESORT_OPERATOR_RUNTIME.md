# Resort Operator Runtime

One central agent. Telegram, `/admin/operator`, guest portal, and staff screens are interfaces to it.

## Operating loop

```
loadResortState → plan (deterministic, goal-driven) → LLM triage per case (priority + explanation)
→ execute safe actions → queue sensitive actions as pending_approval cases
→ verify open cases against the DATABASE → retry → escalate past SLA → audit everything → repeat
```

## Components (all in `supabase/functions/resort-operator/`)

| File | Layer |
|---|---|
| `system-map.ts` | Machine-readable tool registry, tables, approval boundaries — all 9 domains |
| `state.ts` | Unified resort state loader (read-only) |
| `cases.ts` | Shared case model helpers (idempotent open, history, resolve, escalate) |
| `planner.ts` | Compares state to permanent goals, emits prioritized actions with verification rules |
| `brain.ts` | LLM judgment layer: per-case triage + admin chat (`ask`). OpenRouter, hard timeouts, deterministic fallback |
| `executor.ts` | Executes safe actions, enforces the approval boundary, verifies, retries, escalates |
| `index.ts` | HTTP entrypoint: `cycle`, `state`, `ask`, `decide` |
| `loop_test.ts` | In-memory proof of Flow A + Flow B (`deno test --no-lock loop_test.ts`) |

Data: `ops_cases` table (migration `20260712080000_ops_cases.sql`). One open case per source record enforced by unique index.

## Domains (all live)

`guest_request`, `unpaid_balance`, `housekeeping`, `maintenance`, `reservation_exception`, `arrival`, `tour`, `fnb` (stuck orders + stale open tabs), `integration` (failed webhooks/PMS sync).

- **arrival**: today's booking not checked in by 14:00 Manila → high case; by 18:00 → urgent. Verified by `checked_in_at` (or booking closed out).
- **fnb stale tab**: tab opened on a previous Manila day and still open → case for cashier. Verified when `tabs.status` is no longer open.
- **integration**: `webhook_events.status = failed` → case for management. Verified when the event is no longer failed.

## LLM layer (`brain.ts`)

- **Triage** — every newly opened case gets one Haiku call: refined priority (validated against low/medium/high/urgent) + one manager-readable sentence. Logged to `ops_cases.history` as `llm_triage` with model, tokens, and latency. Any failure (no key, timeout, bad JSON) → planner values win; the loop NEVER stalls on a provider.
- **Ask** — `{ action: "ask", question }` loads live state, digests it (counts + top items per domain), and answers in ≤180 words. Facts only from state; never claims an action was executed.

Env on the `resort-operator` function:

| Var | Meaning |
|---|---|
| `OPENROUTER_API_KEY` | Enables the LLM layer (absent = silently off, loop still runs) |
| `OPERATOR_MODEL` | Default `anthropic/claude-haiku-4-5` |
| `AGENT_LLM_ENABLED` | Set `false` = kill switch without removing the key |
| `INTERNAL_FN_SECRET` | Shared with resort-agent-loop / DB triggers, and required by `guest-whatsapp` |
| `APP_URL` | Referer sent to OpenRouter |

Env on the `guest-whatsapp` function:

| Var | Meaning |
|---|---|
| `WHATSAPP_BRIDGE_URL` | URL of the always-on bridge service's `/send` endpoint |
| `WHATSAPP_BRIDGE_SECRET` | Shared secret with the bridge (must match `BRIDGE_SECRET` there) |
| `GCASH_QR_URL` | Public URL of the static GCash QR image sent with each reminder |
| `RESORT_NAME` | Used in the message text (default "BAIA") |

## Hard safety boundary

Anything in `FORBIDDEN_WITHOUT_APPROVAL` (`charge_card`, `issue_refund`, `modify_booking`, `delete_record`, `guest_facing_commitment`) only ever creates a `pending_approval` case — none of these tools are implemented yet, so today this list is a boundary for future capability, not something currently exercised. The agent never performs payments, refunds, booking changes, deletions, or guest-facing commitments. The LLM can never widen this: the boundary is enforced in `executor.ts` after triage, independent of model output. Approval happens on `/admin/operator` (Live operational cases panel) and calls `{action:"decide"}`.

`send_payment_request` (unpaid_balance domain) is deliberately **not** gated: it can only ever ask the guest to pay — a WhatsApp message with the balance and the resort's GCash QR — never move money itself. The guest scans and pays on their own; Sirvoy syncs `paid_amount` back and `balance_cleared` verifies + auto-resolves the case with no human step. Throttled to one reminder per case per ~20h (`recentlyNotified` in `executor.ts`) so it doesn't re-message every 30-min cycle.

Delivery goes through `guest-whatsapp` (edge function) → an external always-on bridge service (`whatsapp-bridge/`, Baileys-based — there's no official WhatsApp Business API key). See `whatsapp-bridge/README.md` for deploy. A failed send never blocks the loop or the case; it just retries next cycle.

## Verification

The agent never trusts its own claims (or the model's). Rules in `executor.ts` re-read the database:

- `guest_request_completed`, `balance_cleared`, `housekeeping_order_exists`, `housekeeping_cleaning_completed`, `task_exists`, `task_completed`, `tour_confirmed`, `order_closed`
- `guest_checked_in` — booking has `checked_in_at` (or was closed out)
- `tab_closed` — tab status no longer open
- `webhook_resolved` — event no longer `failed`

Failed verification past `due_at` → retry (max 2) → escalate.

## Admin chat

`OperatorChat` on `/admin/operator` calls `{action:"ask"}` directly on this function. No local runtime required; the guest-facing Hermes widget is a separate system.

## Deploy

1. Deploy edge function: `resort-operator` (plus the already-merged `send-telegram`, `concierge-ai`, `telegram-webhook`, `configure-telegram-webhook`, `resort-agent-loop`, `ops-coordinator`).
2. Run migrations `20260712080000_ops_cases.sql` and `20260712081000_operator_schedule.sql`.
3. One-time in SQL editor:
   ```sql
   select vault.create_secret('<PROJECT_URL>', 'project_url');
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
   ```
4. Confirm secrets on the function env: `INTERNAL_FN_SECRET`, `OPENROUTER_API_KEY`, optional `OPERATOR_MODEL`.

## Triggers

- Every 30 min via pg_cron (`resort-operator-cycle`).
- Immediately on new guest request (DB trigger).
- Manually from `/admin/operator` ("Run full resort loop" includes the operator cycle).
- On demand via the operator chat (`ask` reads state; it does not run a cycle).
