# Finish the Resort Operator

Goal: get the loop actually running in production against all 9 domains you described in the recap, with the money/booking leash enforced in code and each action verified after the fact. No stopping until a live cycle is green or a real blocker appears.

## Phase 1 — Unblock the cron & trigger path

The interactive flow already works via admin JWT. What's broken is the automated path (`pg_cron` every 30 min + `on_guest_request_created` trigger), because `INTERNAL_FN_SECRET` in the function env is 10 chars while the vault entry is 32 chars.

1. Open the secure form to reset `INTERNAL_FN_SECRET` to the 32-char value `DiPkf7xIPBE8fZZUPKvKLoUXKkUMhLHd` (via `secrets--update_secret`). No code accepts the value from chat — it's typed into the form.
2. Update the `internal_fn_secret` vault entry to the same value with a one-shot SQL insert so `trigger_resort_operator()` and the cron job send a matching header.
3. Verify with `supabase--curl_edge_functions` POST to `resort-operator` with `x-internal-secret` → expect `200` and a `cycle` payload, not `403`.
4. Watch `supabase--edge_function_logs` for the next scheduled cron hit → expect `200`, not `404`/`403`.
5. Insert a throwaway `guest_requests` row via `supabase--insert`, confirm the trigger fires and a corresponding `ops_cases` row appears; then clean up.

Exit criteria for Phase 1: manual curl, cron tick, and DB trigger all return `200` and produce audit + case rows.

## Phase 2 — Complete the 9 domains

Current `planner.ts` / `state.ts` cover guest requests, unpaid balances, and a partial housekeeping path. Extend to the full list from the recap, one domain per commit, each with (a) a `state.ts` loader, (b) a `planner.ts` rule, (c) an executor branch that only calls the allow-listed `resort-operator-execute` actions, and (d) a verifier in `cases.ts` that re-reads the DB after execution.

Domains to add / harden, in order:

1. **Housekeeping** — dirty/overdue rooms → `CREATE_HOUSEKEEPING_ORDER`; verifier: order exists and status ≠ cancelled within 5 min.
2. **Maintenance** — open `it_notes` / maintenance-tagged `resort_ops_tasks` past due → `CREATE_TASK` (category=`maintenance`); verifier: task row present, not `done`.
3. **Arrivals** — today's `resort_ops_bookings` with no check-in past ETA → queues approval card (no auto-mutation of bookings); verifier: booking status unchanged until human approves.
4. **Reservation exceptions** — booking conflicts / Sirvoy sync failures on `webhook_events` → approval-only case, never auto-edits a booking.
5. **Tours** — `guest_tours` / `tour_bookings` unconfirmed within N hours of start → `CREATE_TASK` for tours desk; verifier checks a follow-up task exists.
6. **F&B** — stuck `orders` (kitchen) and stale `tabs` (bar) beyond thresholds → `CREATE_TASK` for the right department; verifier checks task, never touches the order/tab totals.
7. **Guest requests** (already partial) — tighten SLA thresholds and add verifier that escalations actually flipped `status='escalated'`.
8. **Unpaid balances** (already partial) — keep detection, keep approval-only, add verifier that no auto-write happened.
9. **Sirvoy sync failures** — surface `webhook_events` with `status='failed'` as an approval card; verifier confirms no silent retries mutated bookings.

Money/booking leash stays in code: `resort-operator-execute`'s allow-list is the only write path. Nothing new is added to that list in this phase — new domains either use `CREATE_TASK` / `CREATE_HOUSEKEEPING_ORDER` / `ESCALATE_GUEST_REQUEST` or queue an approval card only.

## Phase 3 — Prove it

- Extend `loop_test.ts` with one deterministic test per new domain: seed rows → run `plan()` → assert the expected action(s) → run executor against a mocked client → assert audit row + verifier pass.
- Run the full suite via `deno test` on the function folder plus `bunx vitest run` for the app.
- Run the app build.
- Live smoke: press "Run Daily Operator" on `/admin/operator`, confirm brief + proposals render, approve one safe card, watch the audit row land.

## Technical details

- **Files touched:** `supabase/functions/resort-operator/{state,planner,executor,cases,system-map,loop_test}.ts`. No changes to `resort-operator-execute` allow-list. No new secrets. No changes to `server/index.js` or `src/integrations/supabase/client.ts`.
- **Money boundary:** enforced by the `HANDLERS` map in `resort-operator-execute/index.ts`. Any planner rule for a money/booking domain returns `kind: 'approval'` with `approval_required: true`; execution stops at the queue.
- **Verifier pattern:** each executor branch, on success, schedules a `cases.verify(caseId)` call that re-queries the target table and either resolves the case, retries (max 2), or escalates.
- **LLM pass:** OpenRouter call in `ops-coordinator` stays optional; deterministic fallback preserved so a missing key never stalls the loop.
- **Rollback:** everything is additive to `resort-operator/*` plus one secret + one vault row rewrite; revert = drop the new domain branches and restore prior secret.

## Out of scope

- Extending the executor allow-list beyond the current 3 actions.
- Making `server/index.js` reachable from edge functions.
- Any UI redesign of `/admin/operator` beyond wiring new proposal types into the existing list.

I'll stop only when Phase 3 is green or I hit a decision I genuinely can't make alone.
