
-- Create time_entries table
CREATE TABLE public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  is_paid boolean NOT NULL DEFAULT false,
  paid_amount numeric,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Disable RLS on time_entries
ALTER TABLE public.time_entries DISABLE ROW LEVEL SECURITY;

-- Create weekly_schedules table
CREATE TABLE public.weekly_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  time_in time NOT NULL,
  time_out time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Disable RLS on weekly_schedules
ALTER TABLE public.weekly_schedules DISABLE ROW LEVEL SECURITY;

-- Enable realtime on weekly_schedules
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_schedules;

-- Add updated_at trigger to both tables
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_schedules_updated_at
  BEFORE UPDATE ON public.weekly_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
