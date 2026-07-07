
-- Payment log table to track when employees get paid
CREATE TABLE public.payroll_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'regular', -- 'regular' or 'advance'
  period_start DATE,
  period_end DATE,
  notes TEXT DEFAULT '',
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read payroll_payments" ON public.payroll_payments FOR SELECT USING (true);
CREATE POLICY "Public insert payroll_payments" ON public.payroll_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update payroll_payments" ON public.payroll_payments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete payroll_payments" ON public.payroll_payments FOR DELETE USING (true);
