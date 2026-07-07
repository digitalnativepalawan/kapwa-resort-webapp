-- ============================================================================
-- RLS Phase 2 — ROLLBACK
-- ============================================================================
-- Restores the original permissive policies on the five crown-jewel tables, in
-- case the claim-based cutover causes problems. Pair this with setting
-- VITE_USE_STAFF_JWT=false on the frontend so the app returns to anon-key
-- behavior. This makes the tables world-readable/writable again (the original,
-- insecure state) — use only as an emergency revert while you diagnose.
-- ============================================================================

-- employees
drop policy if exists "Staff read employees"   on public.employees;
drop policy if exists "Admin insert employees" on public.employees;
drop policy if exists "Admin update employees" on public.employees;
drop policy if exists "Admin delete employees" on public.employees;
create policy "Public read employees"   on public.employees for select using (true);
create policy "Public insert employees" on public.employees for insert with check (true);
create policy "Public update employees" on public.employees for update using (true) with check (true);
create policy "Public delete employees" on public.employees for delete using (true);

-- employee_permissions
drop policy if exists "Staff read employee_permissions"   on public.employee_permissions;
drop policy if exists "Admin insert employee_permissions" on public.employee_permissions;
drop policy if exists "Admin update employee_permissions" on public.employee_permissions;
drop policy if exists "Admin delete employee_permissions" on public.employee_permissions;
create policy "Public read employee_permissions"   on public.employee_permissions for select using (true);
create policy "Public insert employee_permissions" on public.employee_permissions for insert with check (true);
create policy "Public update employee_permissions" on public.employee_permissions for update using (true) with check (true);
create policy "Public delete employee_permissions" on public.employee_permissions for delete using (true);

-- payroll_payments
drop policy if exists "Payroll read payroll_payments"   on public.payroll_payments;
drop policy if exists "Payroll insert payroll_payments" on public.payroll_payments;
drop policy if exists "Payroll update payroll_payments" on public.payroll_payments;
drop policy if exists "Payroll delete payroll_payments" on public.payroll_payments;
create policy "Public read payroll_payments"   on public.payroll_payments for select using (true);
create policy "Public insert payroll_payments" on public.payroll_payments for insert with check (true);
create policy "Public update payroll_payments" on public.payroll_payments for update using (true) with check (true);
create policy "Public delete payroll_payments" on public.payroll_payments for delete using (true);

-- employee_bonuses
drop policy if exists "Payroll read employee_bonuses"   on public.employee_bonuses;
drop policy if exists "Payroll insert employee_bonuses" on public.employee_bonuses;
drop policy if exists "Payroll update employee_bonuses" on public.employee_bonuses;
drop policy if exists "Payroll delete employee_bonuses" on public.employee_bonuses;
create policy "Public read employee_bonuses"   on public.employee_bonuses for select using (true);
create policy "Public insert employee_bonuses" on public.employee_bonuses for insert with check (true);
create policy "Public update employee_bonuses" on public.employee_bonuses for update using (true) with check (true);
create policy "Public delete employee_bonuses" on public.employee_bonuses for delete using (true);

-- audit_log
drop policy if exists "Admin read audit_log"   on public.audit_log;
drop policy if exists "Staff insert audit_log" on public.audit_log;
create policy "Public read audit_log"   on public.audit_log for select using (true);
create policy "Public insert audit_log" on public.audit_log for insert with check (true);
