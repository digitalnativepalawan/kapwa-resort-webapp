# KAPWA Hospitality OS - Pre-Sale Security Gate

**Purpose:** the checklist a property must pass before KAPWA is sold/deployed to a
real customer. Pulled from the project's own pilot plan and docs/security/.
Documentation only - edits NO code. Apply SQL in docs/security/ on STAGING first.

Status: [ ] not done  [~] partial/staged  [x] done

## GATE 0 - Before you touch anything
- [ ] Freeze prod Supabase; snapshot/backup.
- [ ] Create STAGING project mirroring prod schema.
- [ ] Validate all SQL on staging before any prod apply.

## GATE 1 - Row-Level Security (crown jewels)
Source: docs/security/rls-phase2-crown-jewels.sql (parked in docs/, not auto-applied).
- [ ] STAFF_JWT_SECRET set on employee-auth = project JWT secret; login returns token.
- [ ] Frontend deployed with VITE_USE_STAFF_JWT=true.
- [ ] Apply rls-phase2-crown-jewels.sql on staging; lock 5 high-risk tables
      (employees, audit_log, resort_ops_bookings, guest PII, payments).
- [ ] Verify anon/non-staff CANNOT read/write those tables.
- [ ] Verify guest portal still loads.
- [ ] Extend claim-based pattern to rest of schema.
- [ ] Rollback ready: rls-phase2-rollback.sql.

## GATE 2 - Staff auth & JWT (flagged "not verified E2E")
- [ ] employee-auth mints staff JWT on PIN login (returns token).
- [ ] JWT verified E2E: browser -> Supabase RPC -> RLS claim.
- [ ] Permission claim matches src/lib/permissions.ts::hasAccess.
- [ ] PIN login rate-limited with lockout.
- [ ] Service-role key only in Edge Functions, never client bundle.

## GATE 3 - Token & device hygiene (flagged risk)
- [ ] KAPWA_ADMIN_TOKEN currently in sessionStorage (share-device risk).
      Decide: move to short-lived HttpOnly device-scoped session, OR document
      single-device admin use only.
- [ ] Logout clears all tokens; no residual secrets in storage.
- [ ] Admin token checked server-side (requireAdmin) on every runtime call.

## GATE 4 - Transport & headers
- [ ] CORS allowlist per-deployment (not *).
- [ ] CSP + secure headers at host; no unsafe-inline eval.
- [ ] All HTTPS; anon key scoped via RLS.

## GATE 5 - Dependencies
- [ ] npm audit: moderate/high/critical resolved or waived with reason.
- [ ] npm run lint + npm run build clean.
- [ ] npm test (vitest) green incl. operator loop tests.

## GATE 6 - Agent safety (designed-in - confirm live)
- [ ] resort-operator loop: sensitive acts only create pending_approval cases.
- [ ] executor.ts boundary holds: no payment/refund/booking/deletion w/o approval.
- [ ] LLM fails safe to deterministic planner (AGENT_LLM_ENABLED=false).
- [ ] Every action audit-logged + verified against DATABASE.

## GATE 7 - Sealed deploy
- [ ] .env / server/data/ never committed (.gitignore confirmed).
- [ ] Each property = own Supabase project (pilot scope).
- [ ] README URL fixed (dead new-KAPWA OS-from-FABLE-5 link).

## Sign-off
Property: ____________  Date: ________
RLS staged: [ ]  JWT E2E: [ ]  CORS: [ ]  audit: [ ]  agent-boundary: [ ]
Operator (David): ____________   Implementer: ____________

Do NOT deploy to a paying customer until every box is [x].
