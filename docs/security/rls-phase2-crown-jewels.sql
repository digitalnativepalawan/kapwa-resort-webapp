-- ============================================================================
-- RLS Phase 2 — Crown-jewel tables (claim-based access)
-- ============================================================================
-- DO NOT place this file in supabase/migrations until it has been validated on a
-- STAGING project. It is kept under docs/ on purpose so `supabase db push` does
-- NOT auto-apply it. See docs/security/rls-migration.md for the rollout order.
--
-- Prerequisites (must be true BEFORE applying this file to any environment):
--   1. STAFF_JWT_SECRET is configured for the employee-auth function and equals
--      the project's JWT secret (Settings -> API -> JWT Settings). Verify a login
--      returns a non-null `token`.
--   2. The frontend is deployed with VITE_USE_STAFF_JWT=true, so staff requests
--      carry the JWT. Confirm an admin dashboard still loads data end-to-end.
--   3. Guests never read these tables, so locking them does not affect the guest
--      portal (verified against the current codebase).
--
-- This file locks ONLY the five highest-risk tables (public write here = instant
-- privilege escalation or PII/financial theft). Once validated, extend the same
-- pattern table-by-table to the rest of the schema.
-- ============================================================================

-- ── Claim helpers ───────────────────────────────────────────────────────────
-- These read the custom claims embedded in the staff JWT by employee-auth.

create or replace function public.jwt_permissions()
returns jsonb language sql stable as $$
  select coalesce(auth.jwt() -> 'permissions', '[]'::jsonb);
$$;

create or replace function public.is_staff()
returns boolean language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'employee_id', ''), null) is not null;
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(public.jwt_permissions() ? 'admin', false);
$$;

-- True if the caller has any access level (view/edit/manage) to `section`,
-- mirroring src/lib/permissions.ts::hasAccess.
create or replace function public.has_permission(section text)
returns boolean language sql stable as $$
  select coalesce(
    public.jwt_permissions() ? 'admin'
    or public.jwt_permissions() ? section
    or public.jwt_permissions() ? (section || ':view')
    or public.jwt_permissions() ? (section || ':edit')
    or public.jwt_permissions() ? (section || ':manage'),
    false
  );
$$;

-- ── employees ───────────────────────────────────────────────────────────────
-- Readable by any authenticated staff (needed by pickers/dashboards).
-- Writable by admins only.
drop policy if exists "Public read employees"   on public.employees;
drop policy if exists "Public insert employees" on public.employees;
drop policy if exists "Public update employees" on public.employees;
drop policy if exists "Public delete employees" on public.employees;

create policy "Staff read employees"   on public.employees for select to authenticated using (public.is_staff());
create policy "Admin insert employees" on public.employees for insert to authenticated with check (public.is_admin());
create policy "Admin update employees" on public.employees for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin delete employees" on public.employees for delete to authenticated using (public.is_admin());

-- NOTE (follow-up hardening, not applied here): password_hash is currently
-- readable by any role that can SELECT employees. To hide it, first change the
-- four `select('*')` call sites (PayrollDashboard, SetupExportCard,
-- StaffAccessManager, EmployeePortal) to explicit column lists, THEN run:
--   REVOKE SELECT (password_hash) ON public.employees FROM anon, authenticated;
-- The employee-auth function uses the service role and is unaffected.

-- ── employee_permissions (THE privilege-escalation surface) ─────────────────
drop policy if exists "Public read employee_permissions"   on public.employee_permissions;
drop policy if exists "Public insert employee_permissions" on public.employee_permissions;
drop policy if exists "Public update employee_permissions" on public.employee_permissions;
drop policy if exists "Public delete employee_permissions" on public.employee_permissions;

create policy "Staff read employee_permissions"   on public.employee_permissions for select to authenticated using (public.is_staff());
create policy "Admin insert employee_permissions" on public.employee_permissions for insert to authenticated with check (public.is_admin());
create policy "Admin update employee_permissions" on public.employee_permissions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin delete employee_permissions" on public.employee_permissions for delete to authenticated using (public.is_admin());

-- ── payroll_payments ────────────────────────────────────────────────────────
drop policy if exists "Public read payroll_payments"   on public.payroll_payments;
drop policy if exists "Public insert payroll_payments" on public.payroll_payments;
drop policy if exists "Public update payroll_payments" on public.payroll_payments;
drop policy if exists "Public delete payroll_payments" on public.payroll_payments;

create policy "Payroll read payroll_payments"   on public.payroll_payments for select to authenticated using (public.has_permission('payroll'));
create policy "Payroll insert payroll_payments" on public.payroll_payments for insert to authenticated with check (public.has_permission('payroll'));
create policy "Payroll update payroll_payments" on public.payroll_payments for update to authenticated using (public.has_permission('payroll')) with check (public.has_permission('payroll'));
create policy "Payroll delete payroll_payments" on public.payroll_payments for delete to authenticated using (public.has_permission('payroll'));

-- ── employee_bonuses ────────────────────────────────────────────────────────
drop policy if exists "Public read employee_bonuses"   on public.employee_bonuses;
drop policy if exists "Public insert employee_bonuses" on public.employee_bonuses;
drop policy if exists "Public update employee_bonuses" on public.employee_bonuses;
drop policy if exists "Public delete employee_bonuses" on public.employee_bonuses;

create policy "Payroll read employee_bonuses"   on public.employee_bonuses for select to authenticated using (public.has_permission('payroll'));
create policy "Payroll insert employee_bonuses" on public.employee_bonuses for insert to authenticated with check (public.has_permission('payroll'));
create policy "Payroll update employee_bonuses" on public.employee_bonuses for update to authenticated using (public.has_permission('payroll')) with check (public.has_permission('payroll'));
create policy "Payroll delete employee_bonuses" on public.employee_bonuses for delete to authenticated using (public.has_permission('payroll'));

-- ── audit_log ───────────────────────────────────────────────────────────────
-- Any staff may append; only admins may read the trail.
drop policy if exists "Public read audit_log"   on public.audit_log;
drop policy if exists "Public insert audit_log" on public.audit_log;

create policy "Admin read audit_log"  on public.audit_log for select to authenticated using (public.is_admin());
create policy "Staff insert audit_log" on public.audit_log for insert to authenticated with check (public.is_staff());
