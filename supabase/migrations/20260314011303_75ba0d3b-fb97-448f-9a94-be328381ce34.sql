
CREATE TABLE public.employee_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, role_key)
);

ALTER TABLE public.employee_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read employee_roles" ON public.employee_roles FOR SELECT USING (true);
CREATE POLICY "Public insert employee_roles" ON public.employee_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_roles" ON public.employee_roles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_roles" ON public.employee_roles FOR DELETE USING (true);
