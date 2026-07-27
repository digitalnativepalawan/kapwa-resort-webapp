-- ============================================================================
-- Reconcile the contradictory Phase 2 RLS migrations
-- ============================================================================
--
-- Two migrations currently disagree about the same two tables:
--
--   20260707035810 (Phase 2)       locks guest_faq_memory and settings to
--                                  staff claims, dropping anon writes.
--   20260707093000 (guest_bot_..)  runs *after* it and re-creates
--                                  "Public insert/update/delete guest FAQ
--                                  memory" and "Public update settings" for
--                                  anon with USING (true).
--
-- Whichever ran last wins, so the live policy set depends on migration order
-- rather than intent. This migration states the intent once:
--
--   guest_faq_memory  anon may read *active* entries (the Guest Portal needs
--                     them). Writes are staff-only.
--   settings          anon may read (the Guest Portal renders from it).
--                     Writes are staff-only.
--
-- ── Why there are COMPAT policies ───────────────────────────────────────────
--
-- "Staff-only" means `auth.jwt()` carries staff claims, which only happens once
-- STAFF_JWT_SECRET is set on employee-auth *and* the frontend attaches the
-- resulting token. Until then staff browsers are the anon role, so tightening
-- these two tables now would break Admin → Agent Settings and the FAQ editor —
-- the same wrong-phase mistake that made the crown-jewel tables read as empty.
--
-- So the claim-based policies below are the destination, and each is paired
-- with an explicitly named `COMPAT` policy that reproduces today's anon access.
-- The cutover is then a single reviewable step: run
-- docs/security/rls-cutover-drop-compat.sql, which drops *only* the COMPAT
-- policies and leaves the claim-based set standing.
--
-- ── What this migration deliberately does NOT do ────────────────────────────
--
-- It does not add COMPAT policies for employees, employee_permissions,
-- payroll_payments, employee_bonuses or audit_log. Those are the crown jewels;
-- an anon bridge there would republish payroll and staff records to anyone with
-- the publishable key. If those screens read as empty today, the fix is to
-- finish the cutover (set STAFF_JWT_SECRET, confirm Admin → Diagnostics reports
-- "active"), not to reopen the tables. docs/security/rls-phase2-rollback.sql
-- remains available as an emergency revert.
--
-- Safe to apply in either state: pre-cutover the COMPAT policies carry the app,
-- post-cutover the claim policies do.
-- ============================================================================

-- ── Claim helpers ───────────────────────────────────────────────────────────
-- Recreated idempotently: this migration must be runnable on a database where
-- 20260707035810 was applied, partially applied, or never applied at all.

CREATE OR REPLACE FUNCTION public.jwt_permissions()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(auth.jwt() -> 'permissions', '[]'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'employee_id', ''), NULL) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(public.jwt_permissions() ? 'admin', false);
$$;

CREATE OR REPLACE FUNCTION public.has_permission(section text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    public.jwt_permissions() ? 'admin'
    OR public.jwt_permissions() ? section
    OR public.jwt_permissions() ? (section || ':view')
    OR public.jwt_permissions() ? (section || ':edit')
    OR public.jwt_permissions() ? (section || ':manage'),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.jwt_permissions()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jwt_permissions()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(text)  TO authenticated, service_role;

-- ── guest_faq_memory ────────────────────────────────────────────────────────
-- Drop every prior spelling from both competing migrations.
DROP POLICY IF EXISTS "Public read guest FAQ memory"          ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public insert guest FAQ memory"        ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public update guest FAQ memory"        ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public delete guest FAQ memory"        ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public read guest_faq_memory"          ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public insert guest_faq_memory"        ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public update guest_faq_memory"        ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public delete guest_faq_memory"        ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Guest read active guest_faq_memory"    ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Staff read all guest_faq_memory"       ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Staff insert guest_faq_memory"         ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Staff update guest_faq_memory"         ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Staff delete guest_faq_memory"         ON public.guest_faq_memory;
DROP POLICY IF EXISTS "COMPAT anon write guest_faq_memory"    ON public.guest_faq_memory;
DROP POLICY IF EXISTS "COMPAT anon update guest_faq_memory"   ON public.guest_faq_memory;
DROP POLICY IF EXISTS "COMPAT anon delete guest_faq_memory"   ON public.guest_faq_memory;

-- Destination policies.
CREATE POLICY "Guest read active guest_faq_memory"
  ON public.guest_faq_memory FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "Staff read all guest_faq_memory"
  ON public.guest_faq_memory FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Staff insert guest_faq_memory"
  ON public.guest_faq_memory FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Staff update guest_faq_memory"
  ON public.guest_faq_memory FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Staff delete guest_faq_memory"
  ON public.guest_faq_memory FOR DELETE TO authenticated USING (public.is_staff());

-- Pre-cutover bridge. Drop via docs/security/rls-cutover-drop-compat.sql.
CREATE POLICY "COMPAT anon write guest_faq_memory"
  ON public.guest_faq_memory FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "COMPAT anon update guest_faq_memory"
  ON public.guest_faq_memory FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "COMPAT anon delete guest_faq_memory"
  ON public.guest_faq_memory FOR DELETE TO anon USING (true);

-- ── settings ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public insert settings"        ON public.settings;
DROP POLICY IF EXISTS "Public update settings"        ON public.settings;
DROP POLICY IF EXISTS "Public delete settings"        ON public.settings;
DROP POLICY IF EXISTS "Staff insert settings"         ON public.settings;
DROP POLICY IF EXISTS "Staff update settings"         ON public.settings;
DROP POLICY IF EXISTS "Staff delete settings"         ON public.settings;
DROP POLICY IF EXISTS "COMPAT anon insert settings"   ON public.settings;
DROP POLICY IF EXISTS "COMPAT anon update settings"   ON public.settings;
DROP POLICY IF EXISTS "COMPAT anon delete settings"   ON public.settings;

CREATE POLICY "Staff insert settings"
  ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Staff update settings"
  ON public.settings FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Staff delete settings"
  ON public.settings FOR DELETE TO authenticated USING (public.is_staff());

-- Pre-cutover bridge. Drop via docs/security/rls-cutover-drop-compat.sql.
--
-- NOTE: `settings` holds openrouter_api_key. While this COMPAT policy exists,
-- anyone holding the publishable key can overwrite it. That is the access level
-- the app has today; dropping these policies at cutover is what closes it.
CREATE POLICY "COMPAT anon insert settings"
  ON public.settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "COMPAT anon update settings"
  ON public.settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "COMPAT anon delete settings"
  ON public.settings FOR DELETE TO anon USING (true);
