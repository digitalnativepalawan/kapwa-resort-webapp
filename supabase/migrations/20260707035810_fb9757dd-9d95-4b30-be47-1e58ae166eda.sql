
-- ============================================================================
-- Phase 2 crown-jewel RLS + guest_faq_memory/settings lockdown
-- Scope: employees, employee_permissions, payroll_payments, employee_bonuses,
--        audit_log, guest_faq_memory, settings
-- ============================================================================

-- ── Claim helpers (read staff JWT claims minted by employee-auth) ───────────
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

-- Restrict EXECUTE on the claim helpers so they're callable from RLS only
REVOKE EXECUTE ON FUNCTION public.jwt_permissions()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jwt_permissions()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(text)        TO authenticated, service_role;

-- ── employees ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read employees"   ON public.employees;
DROP POLICY IF EXISTS "Public insert employees" ON public.employees;
DROP POLICY IF EXISTS "Public update employees" ON public.employees;
DROP POLICY IF EXISTS "Public delete employees" ON public.employees;
CREATE POLICY "Staff read employees"   ON public.employees FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Admin insert employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin update employees" ON public.employees FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin delete employees" ON public.employees FOR DELETE TO authenticated USING (public.is_admin());

-- ── employee_permissions ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read employee_permissions"   ON public.employee_permissions;
DROP POLICY IF EXISTS "Public insert employee_permissions" ON public.employee_permissions;
DROP POLICY IF EXISTS "Public update employee_permissions" ON public.employee_permissions;
DROP POLICY IF EXISTS "Public delete employee_permissions" ON public.employee_permissions;
CREATE POLICY "Staff read employee_permissions"   ON public.employee_permissions FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Admin insert employee_permissions" ON public.employee_permissions FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin update employee_permissions" ON public.employee_permissions FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin delete employee_permissions" ON public.employee_permissions FOR DELETE TO authenticated USING (public.is_admin());

-- ── payroll_payments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read payroll_payments"   ON public.payroll_payments;
DROP POLICY IF EXISTS "Public insert payroll_payments" ON public.payroll_payments;
DROP POLICY IF EXISTS "Public update payroll_payments" ON public.payroll_payments;
DROP POLICY IF EXISTS "Public delete payroll_payments" ON public.payroll_payments;
CREATE POLICY "Payroll read payroll_payments"   ON public.payroll_payments FOR SELECT TO authenticated USING (public.has_permission('payroll'));
CREATE POLICY "Payroll insert payroll_payments" ON public.payroll_payments FOR INSERT TO authenticated WITH CHECK (public.has_permission('payroll'));
CREATE POLICY "Payroll update payroll_payments" ON public.payroll_payments FOR UPDATE TO authenticated USING (public.has_permission('payroll')) WITH CHECK (public.has_permission('payroll'));
CREATE POLICY "Payroll delete payroll_payments" ON public.payroll_payments FOR DELETE TO authenticated USING (public.has_permission('payroll'));

-- ── employee_bonuses ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read employee_bonuses"   ON public.employee_bonuses;
DROP POLICY IF EXISTS "Public insert employee_bonuses" ON public.employee_bonuses;
DROP POLICY IF EXISTS "Public update employee_bonuses" ON public.employee_bonuses;
DROP POLICY IF EXISTS "Public delete employee_bonuses" ON public.employee_bonuses;
CREATE POLICY "Payroll read employee_bonuses"   ON public.employee_bonuses FOR SELECT TO authenticated USING (public.has_permission('payroll'));
CREATE POLICY "Payroll insert employee_bonuses" ON public.employee_bonuses FOR INSERT TO authenticated WITH CHECK (public.has_permission('payroll'));
CREATE POLICY "Payroll update employee_bonuses" ON public.employee_bonuses FOR UPDATE TO authenticated USING (public.has_permission('payroll')) WITH CHECK (public.has_permission('payroll'));
CREATE POLICY "Payroll delete employee_bonuses" ON public.employee_bonuses FOR DELETE TO authenticated USING (public.has_permission('payroll'));

-- ── audit_log ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read audit_log"   ON public.audit_log;
DROP POLICY IF EXISTS "Public insert audit_log" ON public.audit_log;
CREATE POLICY "Admin read audit_log"   ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Staff insert audit_log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_staff());

-- ── guest_faq_memory: keep anon SELECT for active FAQs only; remove anon writes ─
DROP POLICY IF EXISTS "Public read guest_faq_memory"   ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public insert guest_faq_memory" ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public update guest_faq_memory" ON public.guest_faq_memory;
DROP POLICY IF EXISTS "Public delete guest_faq_memory" ON public.guest_faq_memory;
CREATE POLICY "Guest read active guest_faq_memory"
  ON public.guest_faq_memory FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "Staff read all guest_faq_memory"
  ON public.guest_faq_memory FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Staff insert guest_faq_memory"
  ON public.guest_faq_memory FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Staff update guest_faq_memory"
  ON public.guest_faq_memory FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Staff delete guest_faq_memory"
  ON public.guest_faq_memory FOR DELETE TO authenticated USING (public.is_staff());

-- ── settings: remove anon writes, keep anon read (Guest Portal reads settings) ─
DROP POLICY IF EXISTS "Public insert settings" ON public.settings;
DROP POLICY IF EXISTS "Public update settings" ON public.settings;
DROP POLICY IF EXISTS "Public delete settings" ON public.settings;
CREATE POLICY "Staff insert settings"
  ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Staff update settings"
  ON public.settings FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Staff delete settings"
  ON public.settings FOR DELETE TO authenticated USING (public.is_staff());
