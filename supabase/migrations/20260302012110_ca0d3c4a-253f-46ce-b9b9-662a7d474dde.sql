
-- 1a. Add department column to menu_items
ALTER TABLE public.menu_items ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';

-- 1b. Add department column to menu_categories
ALTER TABLE public.menu_categories ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';

-- 1c. Create devices table
CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_name TEXT NOT NULL,
  device_id TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL DEFAULT 'kitchen',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  last_login_employee_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on devices (public access matching existing app pattern)
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read devices" ON public.devices FOR SELECT USING (true);
CREATE POLICY "Public insert devices" ON public.devices FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update devices" ON public.devices FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete devices" ON public.devices FOR DELETE USING (true);

-- Enable realtime for orders (for department views)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
