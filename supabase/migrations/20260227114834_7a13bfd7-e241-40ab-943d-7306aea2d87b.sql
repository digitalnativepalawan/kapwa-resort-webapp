
-- 1. Alter employees table
ALTER TABLE public.employees
  ADD COLUMN rate_type text NOT NULL DEFAULT 'hourly',
  ADD COLUMN daily_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN monthly_rate numeric NOT NULL DEFAULT 0;

-- 2. Alter payroll_payments table
ALTER TABLE public.payroll_payments
  ADD COLUMN bonus_amount numeric NOT NULL DEFAULT 0;

-- 3. New table: employee_bonuses
CREATE TABLE public.employee_bonuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  bonus_month date,
  is_employee_of_month boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read employee_bonuses" ON public.employee_bonuses FOR SELECT USING (true);
CREATE POLICY "Public insert employee_bonuses" ON public.employee_bonuses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_bonuses" ON public.employee_bonuses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_bonuses" ON public.employee_bonuses FOR DELETE USING (true);

-- 4. New table: payroll_settings
CREATE TABLE public.payroll_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payday_type text NOT NULL DEFAULT 'weekly',
  payday_day_of_week integer NOT NULL DEFAULT 6,
  payday_days_interval integer NOT NULL DEFAULT 15,
  eom_bonus_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read payroll_settings" ON public.payroll_settings FOR SELECT USING (true);
CREATE POLICY "Public insert payroll_settings" ON public.payroll_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update payroll_settings" ON public.payroll_settings FOR UPDATE USING (true) WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_payroll_settings_updated_at
  BEFORE UPDATE ON public.payroll_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default row
INSERT INTO public.payroll_settings (payday_type, payday_day_of_week, payday_days_interval, eom_bonus_amount) 
VALUES ('weekly', 6, 15, 0);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_bonuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payroll_settings;
