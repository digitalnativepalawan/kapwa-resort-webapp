
-- 1. room_types
CREATE TABLE public.room_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read room_types" ON public.room_types FOR SELECT USING (true);
CREATE POLICY "Public insert room_types" ON public.room_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update room_types" ON public.room_types FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete room_types" ON public.room_types FOR DELETE USING (true);

-- 2. housekeeping_checklists
CREATE TABLE public.housekeeping_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  item_label text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  count_expected integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.housekeeping_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read housekeeping_checklists" ON public.housekeeping_checklists FOR SELECT USING (true);
CREATE POLICY "Public insert housekeeping_checklists" ON public.housekeeping_checklists FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update housekeeping_checklists" ON public.housekeeping_checklists FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete housekeeping_checklists" ON public.housekeeping_checklists FOR DELETE USING (true);

-- 3. cleaning_packages
CREATE TABLE public.cleaning_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Standard Clean',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.cleaning_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cleaning_packages" ON public.cleaning_packages FOR SELECT USING (true);
CREATE POLICY "Public insert cleaning_packages" ON public.cleaning_packages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update cleaning_packages" ON public.cleaning_packages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete cleaning_packages" ON public.cleaning_packages FOR DELETE USING (true);

-- 4. cleaning_package_items
CREATE TABLE public.cleaning_package_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES public.cleaning_packages(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  default_quantity numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.cleaning_package_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cleaning_package_items" ON public.cleaning_package_items FOR SELECT USING (true);
CREATE POLICY "Public insert cleaning_package_items" ON public.cleaning_package_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update cleaning_package_items" ON public.cleaning_package_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete cleaning_package_items" ON public.cleaning_package_items FOR DELETE USING (true);

-- 5. housekeeping_orders
CREATE TABLE public.housekeeping_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_name text NOT NULL DEFAULT '',
  room_type_id uuid REFERENCES public.room_types(id),
  status text NOT NULL DEFAULT 'pending_inspection',
  assigned_to uuid REFERENCES public.employees(id),
  inspection_data jsonb DEFAULT '[]'::jsonb,
  damage_notes text NOT NULL DEFAULT '',
  cleaning_notes text NOT NULL DEFAULT '',
  supplies_used jsonb DEFAULT '[]'::jsonb,
  inspection_completed_at timestamp with time zone,
  cleaning_completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.housekeeping_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read housekeeping_orders" ON public.housekeeping_orders FOR SELECT USING (true);
CREATE POLICY "Public insert housekeeping_orders" ON public.housekeeping_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update housekeeping_orders" ON public.housekeeping_orders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete housekeeping_orders" ON public.housekeeping_orders FOR DELETE USING (true);

-- Enable realtime on housekeeping_orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_orders;

-- 6. Add columns to units table
ALTER TABLE public.units ADD COLUMN room_type_id uuid REFERENCES public.room_types(id);
ALTER TABLE public.units ADD COLUMN status text NOT NULL DEFAULT 'ready';
