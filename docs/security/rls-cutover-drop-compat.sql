-- ============================================================================
-- RLS cutover — drop the pre-cutover COMPAT bridge
-- ============================================================================
--
-- Run this ONLY after all three are true:
--
--   1. STAFF_JWT_SECRET is set on the employee-auth function and equals the
--      project's JWT secret (Settings → API → JWT Settings).
--   2. Signing in as staff returns a non-null `token` from employee-auth.
--   3. Admin → Diagnostics reports staff JWT status **active** — meaning the
--      frontend probed PostgREST and PostgREST accepted the token. If it
--      reports "rejected", the secret does not match and running this script
--      will lock the back office out of settings and the FAQ editor.
--
-- What it does: removes the named COMPAT policies added by
-- supabase/migrations/20260727120000_reconcile_rls_phase2.sql, leaving only the
-- claim-based policies. It also revokes anon's read access to the stored
-- OpenRouter key.
--
-- Reversible with docs/security/rls-cutover-rollback.sql.
-- ============================================================================

BEGIN;

-- ── guest_faq_memory: anon keeps SELECT on active rows, loses writes ────────
DROP POLICY IF EXISTS "COMPAT anon write guest_faq_memory"  ON public.guest_faq_memory;
DROP POLICY IF EXISTS "COMPAT anon update guest_faq_memory" ON public.guest_faq_memory;
DROP POLICY IF EXISTS "COMPAT anon delete guest_faq_memory" ON public.guest_faq_memory;

-- ── settings: anon keeps SELECT (the Guest Portal renders from it) ──────────
DROP POLICY IF EXISTS "COMPAT anon insert settings" ON public.settings;
DROP POLICY IF EXISTS "COMPAT anon update settings" ON public.settings;
DROP POLICY IF EXISTS "COMPAT anon delete settings" ON public.settings;

-- ── Stop publishing the OpenRouter key to the anonymous role ────────────────
--
-- `settings` has been SELECT-able by anon since the first migration
-- ("Public read settings" ... USING (true)), and later migrations added
-- `openrouter_api_key` to that same table. So the key has been readable by
-- anyone holding the publishable key — which, in a Vite build, is everyone.
--
-- RLS is row-level, so the column is excluded with a column-level REVOKE
-- instead. `authenticated` keeps the grant: Admin → Bot Settings reads the key
-- to display its last four characters, and edge functions use the service role.
--
-- ROTATE THE KEY at openrouter.ai after running this. Revoking access does not
-- undo prior exposure.
REVOKE SELECT (openrouter_api_key) ON public.settings FROM anon;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
-- Expect: only "Guest read active guest_faq_memory" for anon on
-- guest_faq_memory, and only "Public read settings" for anon on settings.
--
-- SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('guest_faq_memory', 'settings')
--  ORDER BY tablename, cmd, policyname;
--
-- Expect no row for openrouter_api_key:
--
-- SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--  WHERE table_name = 'settings' AND grantee = 'anon'
--    AND column_name = 'openrouter_api_key';
