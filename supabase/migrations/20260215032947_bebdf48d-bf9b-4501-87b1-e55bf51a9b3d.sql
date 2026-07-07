
-- Create employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read employees" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Public insert employees" ON public.employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employees" ON public.employees FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employees" ON public.employees FOR DELETE USING (true);

-- Create employee_shifts table
CREATE TABLE public.employee_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  clock_out TIMESTAMP WITH TIME ZONE,
  hours_worked NUMERIC,
  total_pay NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read employee_shifts" ON public.employee_shifts FOR SELECT USING (true);
CREATE POLICY "Public insert employee_shifts" ON public.employee_shifts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_shifts" ON public.employee_shifts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_shifts" ON public.employee_shifts FOR DELETE USING (true);

-- Enable realtime for shifts
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_shifts;
