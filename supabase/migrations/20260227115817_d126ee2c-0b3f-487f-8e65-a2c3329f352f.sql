
-- Add contact & auth columns to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS messenger_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';

-- Create employee_tasks table
CREATE TABLE public.employee_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  due_date timestamptz,
  completed_at timestamptz,
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read employee_tasks" ON public.employee_tasks FOR SELECT USING (true);
CREATE POLICY "Public insert employee_tasks" ON public.employee_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_tasks" ON public.employee_tasks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_tasks" ON public.employee_tasks FOR DELETE USING (true);

-- Enable realtime for tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_tasks;

-- Trigger for updated_at
CREATE TRIGGER update_employee_tasks_updated_at
  BEFORE UPDATE ON public.employee_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
