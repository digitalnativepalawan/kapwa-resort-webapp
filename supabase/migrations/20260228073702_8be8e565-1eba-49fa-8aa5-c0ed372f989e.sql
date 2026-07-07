
-- Create audit_log table for tracking all staff modifications
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid,
  employee_name text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  table_name text NOT NULL DEFAULT '',
  record_id text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read audit_log" ON public.audit_log FOR SELECT USING (true);

-- Public insert access
CREATE POLICY "Public insert audit_log" ON public.audit_log FOR INSERT WITH CHECK (true);
