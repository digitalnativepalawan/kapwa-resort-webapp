
CREATE TABLE public.order_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  type_key text NOT NULL,
  input_mode text NOT NULL DEFAULT 'text',
  source_table text DEFAULT NULL,
  placeholder text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.order_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read order_types" ON public.order_types FOR SELECT USING (true);
CREATE POLICY "Public insert order_types" ON public.order_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update order_types" ON public.order_types FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete order_types" ON public.order_types FOR DELETE USING (true);

-- Seed default order types
INSERT INTO public.order_types (label, type_key, input_mode, source_table, placeholder, sort_order) VALUES
('Room / Unit', 'Room', 'select', 'units', 'Select unit', 1),
('Dine In', 'DineIn', 'select', 'resort_tables', 'Select table', 2),
('Beach', 'Beach', 'text', NULL, 'Describe your location (e.g., near the kayaks)', 3),
('Walk-In', 'WalkIn', 'text', NULL, 'Your name', 4);
