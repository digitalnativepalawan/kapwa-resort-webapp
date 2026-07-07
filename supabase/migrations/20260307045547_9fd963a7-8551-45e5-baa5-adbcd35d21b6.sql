
CREATE TABLE public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read staff_roles" ON public.staff_roles FOR SELECT USING (true);
CREATE POLICY "Public insert staff_roles" ON public.staff_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update staff_roles" ON public.staff_roles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete staff_roles" ON public.staff_roles FOR DELETE USING (true);
