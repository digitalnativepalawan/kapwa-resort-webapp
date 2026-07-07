
ALTER TABLE public.housekeeping_orders
  ADD COLUMN accepted_by UUID REFERENCES public.employees(id),
  ADD COLUMN accepted_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN accepted_at TIMESTAMPTZ,
  ADD COLUMN completed_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN inspection_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN cleaning_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN time_to_complete_minutes INTEGER;
