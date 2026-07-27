-- ============================================================================
-- RLS cutover — ROLLBACK the COMPAT drop
-- ============================================================================
--
-- Restores the pre-cutover anon bridge on `settings` and `guest_faq_memory`.
-- Use this if Admin → Agent Settings or the FAQ editor stops saving after
-- running rls-cutover-drop-compat.sql, i.e. the staff JWT is not actually being
-- accepted by PostgREST.
--
-- Pair it with VITE_USE_STAFF_JWT="auto" (or "false") on the frontend.
--
-- This re-exposes settings writes and the stored OpenRouter key to the
-- anonymous role. It is a diagnostic step, not a resting state — fix
-- STAFF_JWT_SECRET and re-run the cutover.
--
-- This does NOT touch employees / employee_permissions / payroll_payments /
-- employee_bonuses / audit_log. For those, use rls-phase2-rollback.sql.
-- ============================================================================

BEGIN;

CREATE POLICY "COMPAT anon write guest_faq_memory"
  ON public.guest_faq_memory FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "COMPAT anon update guest_faq_memory"
  ON public.guest_faq_memory FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "COMPAT anon delete guest_faq_memory"
  ON public.guest_faq_memory FOR DELETE TO anon USING (true);

CREATE POLICY "COMPAT anon insert settings"
  ON public.settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "COMPAT anon update settings"
  ON public.settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "COMPAT anon delete settings"
  ON public.settings FOR DELETE TO anon USING (true);

GRANT SELECT (openrouter_api_key) ON public.settings TO anon;

COMMIT;
