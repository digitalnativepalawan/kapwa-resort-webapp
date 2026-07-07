CREATE TABLE public.dining_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_name text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  reservation_date date NOT NULL DEFAULT CURRENT_DATE,
  reservation_time text NOT NULL DEFAULT '',
  pax integer NOT NULL DEFAULT 1,
  table_name text NOT NULL DEFAULT '',
  location_type text NOT NULL DEFAULT 'DineIn',
  location_detail text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'confirmed',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dining_reservations TO anon, authenticated;
GRANT ALL ON public.dining_reservations TO service_role;
ALTER TABLE public.dining_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read dining_reservations" ON public.dining_reservations FOR SELECT USING (true);
CREATE POLICY "Public insert dining_reservations" ON public.dining_reservations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update dining_reservations" ON public.dining_reservations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete dining_reservations" ON public.dining_reservations FOR DELETE USING (true);
CREATE TRIGGER update_dining_reservations_updated_at BEFORE UPDATE ON public.dining_reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_for_billing boolean NOT NULL DEFAULT false;