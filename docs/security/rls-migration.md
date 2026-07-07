# Claim-based auth + RLS migration

This is the rollout guide for moving KAPWA OS from **client-trusted permissions** (a
forgeable `localStorage` blob, plus a database that is world-readable/writable
through the public anon key) to **claim-based auth** enforced by Postgres RLS.

The code for **Phase 1** ships in this branch and is **inert by default** — the
app behaves exactly as before until you deliberately turn it on. **Phase 2** (the
RLS cutover) is provided as reviewed SQL under `docs/security/` and must be
applied on a **staging project first**.

---

## Why it's staged

Once RLS on a table stops being `USING (true)`, every request to that table must
carry a **valid** staff JWT or PostgREST rejects it. Two things must therefore be
true *before* any table is locked:

1. `employee-auth` signs JWTs with a secret that **matches the project's JWT
   secret**, so PostgREST accepts the signature. If the secret is wrong, *every*
   authenticated request returns 401.
2. The frontend actually attaches that JWT (`VITE_USE_STAFF_JWT=true`).

Neither can be verified from a code review alone, so we gate Phase 1 behind a
flag and cut over Phase 2 table-by-table on staging.

---

## Phase 1 — JWT infrastructure (in this branch, default OFF)

What changed:

- **`supabase/functions/employee-auth`** now mints a Supabase-compatible HS256
  JWT on `verify` / `admin-verify` and returns it as `token`. Claims include
  `sub`/`employee_id`, `role: authenticated`, `permissions`, `is_admin`, `exp`.
  It only mints when `STAFF_JWT_SECRET` is set — otherwise `token` is `null` and
  behavior is unchanged.
- **`src/lib/session.ts`** stores the optional `token` and exposes
  `getStaffToken()`.
- **`src/integrations/supabase/client.ts`** reads `VITE_USE_STAFF_JWT`. When
  `'true'`, every request sends the staff JWT (falling back to the anon key when
  logged out). When unset/false, the client is identical to before.
- **`src/pages/Index.tsx`** passes the returned `token` into the session.

### Enable on staging

1. In Supabase → **Settings → API → JWT Settings**, copy the **JWT Secret**.
   > This project uses a legacy HS256 shared secret (the anon key header is
   > `{"alg":"HS256"}`). If you have migrated to asymmetric (ECC/RSA) keys, the
   > signing in `employee-auth` must be switched to the private key instead.
2. Set it as a function secret:
   `supabase secrets set STAFF_JWT_SECRET=<the JWT secret>`
3. Also set the internal secret used by the Phase-1 endpoint guards
   (`admin-summary`, `guest-requests-api`) and pass it as the `x-internal-secret`
   header from any cron/monitor that calls them:
   `supabase secrets set INTERNAL_FN_SECRET=<a long random string>`
4. Deploy the functions:
   `supabase functions deploy employee-auth admin-summary guest-requests-api`
5. Build the frontend with `VITE_USE_STAFF_JWT=true` on staging.
6. **Verify** before touching RLS:
   - Log in as staff → the `employee-auth` response contains a non-null `token`.
   - An admin dashboard (e.g. Payroll) still loads data (JWT is accepted).
   - `localStorage`/network shows requests carrying `Authorization: Bearer <jwt>`.

If any of these fail, **do not proceed to Phase 2** — fix signing/flag first.

---

## Phase 2 — RLS cutover (staging, then prod)

Apply `docs/security/rls-phase2-crown-jewels.sql`. It locks the five
highest-risk tables only:

| Table | Read | Write |
|-------|------|-------|
| `employees` | any staff | admin |
| `employee_permissions` | any staff | **admin** (stops self-escalation) |
| `payroll_payments` | `payroll` perm | `payroll` perm |
| `employee_bonuses` | `payroll` perm | `payroll` perm |
| `audit_log` | admin | any staff (append) |

Test matrix on staging after applying:

- **Admin**: can read/write employees, grant/revoke permissions, see payroll.
- **Non-admin staff** (e.g. kitchen): can read employees for pickers, but
  **cannot** insert into `employee_permissions` (escalation blocked) and cannot
  read payroll.
- **Guest portal / logged-out**: unaffected (never touches these tables).
- **Direct anon REST call** to `employee_permissions` insert → now **403**.

Then repeat on production during a low-traffic window.

### Rollback

If something breaks: set `VITE_USE_STAFF_JWT=false` (frontend back to anon) and
run `docs/security/rls-phase2-rollback.sql` to restore the permissive policies.
This returns to the original (insecure) state — use only to unblock while you
diagnose.

---

## Phase 3 — extend to the rest of the schema

With the pattern proven, apply the same `is_staff()` / `has_permission(section)`
policies to the remaining ~55 tables, grouped by module. Special cases to design
deliberately:

- **Guest-facing tables** (`resort_ops_bookings`, `resort_ops_guests`, `units`,
  `menu_items`, `orders`, tours/transport/rental config): guests are not staff,
  so they need a separate, **narrow** anon path — ideally routed through an edge
  function that scopes reads to the guest's own `booking_id`, rather than broad
  anon SELECT. This closes the current guest-enumeration hole.
- **`select('*')` on `employees`** (4 call sites): convert to explicit column
  lists so you can `REVOKE SELECT (password_hash)` from `anon, authenticated`.

## Follow-ups beyond RLS

- Rate-limit / lockout on `employee-auth` `verify` (PIN brute force).
- Require ≥6-digit PINs.
- Move guest-portal login to a server-verified token instead of the public
  room-dropdown + last-name check.
- Consider re-deriving `permissions` from the JWT (server truth) instead of the
  client `localStorage` array in `RequireAuth`/`usePermissions`.
