-- ==== 20260212101410 ====
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kitchen_whatsapp_number TEXT NOT NULL DEFAULT '',
  breakfast_start_time TIME DEFAULT '07:00',
  breakfast_end_time TIME DEFAULT '11:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.resort_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Main Courses',
  description TEXT DEFAULT '',
  food_cost NUMERIC(10,2) DEFAULT 0,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  available BOOLEAN NOT NULL DEFAULT true,
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_type TEXT NOT NULL DEFAULT 'WalkIn',
  location_detail TEXT DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_type TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read units" ON public.units FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read tables" ON public.resort_tables FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read menu" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public read orders" ON public.orders FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.settings (kitchen_whatsapp_number) VALUES ('');
INSERT INTO public.units (unit_name) VALUES
  ('Glamping 01'), ('Glamping 02'), ('Glamping 03'), ('Glamping 04'), ('Glamping 05'),
  ('Room 01'), ('Room 02'), ('Room 03');
INSERT INTO public.resort_tables (table_name) VALUES
  ('Table 1'), ('Table 2'), ('Table 3'), ('Table 4'), ('Table 5');
INSERT INTO public.menu_items (name, category, description, price, sort_order) VALUES
  ('Shrimp Tempura with Wasabi Mayo', 'Starters', 'Light, crispy battered shrimp served with a creamy wasabi mayo.', 460, 1),
  ('Tuna Tartare in Watermelon Gazpacho', 'Starters', 'Fresh diced tuna nestled in chilled watermelon gazpacho with micro greens.', 500, 2),
  ('Papas Bravas', 'Starters', 'Crispy potato cubes topped with spicy bravas sauce and garlic aioli.', 300, 3),
  ('Burrata with Grilled Peach', 'Starters', 'Creamy burrata cheese paired with caramelized grilled peaches and arugula.', 480, 4),
  ('Chicken Satay Skewers', 'Starters', 'Tender chicken skewers marinated in lemongrass, served with peanut sauce.', 350, 5),
  ('Crispy Calamari', 'Starters', 'Golden fried calamari rings with a zesty lemon-caper dipping sauce.', 380, 6),
  ('Grilled Seafood Platter', 'Main Courses', 'A generous selection of grilled prawns, squid, and catch of the day.', 1200, 1),
  ('Wagyu Burger', 'Main Courses', 'Premium wagyu beef patty with truffle aioli, caramelized onions, and brioche bun.', 650, 2),
  ('Pan-Seared Salmon', 'Main Courses', 'Atlantic salmon fillet with lemon butter sauce, asparagus, and mashed potatoes.', 750, 3),
  ('Chicken Adobo', 'Main Courses', 'Traditional Filipino braised chicken in soy-vinegar glaze with steamed rice.', 400, 4),
  ('Pasta Vongole', 'Main Courses', 'Spaghetti with fresh clams in white wine, garlic, and chili.', 520, 5),
  ('Grilled Pork Belly', 'Main Courses', 'Slow-cooked pork belly with apple cider glaze and roasted vegetables.', 550, 6),
  ('Eggs Benedict', 'Breakfast', 'Poached eggs on toasted English muffin with hollandaise sauce and ham.', 380, 1),
  ('Acai Bowl', 'Breakfast', 'Blended acai topped with granola, fresh fruits, and honey drizzle.', 350, 2),
  ('Filipino Breakfast', 'Breakfast', 'Garlic rice, longganisa, fried egg, and pickled papaya.', 320, 3),
  ('Pancake Stack', 'Breakfast', 'Fluffy buttermilk pancakes with maple syrup, berries, and whipped cream.', 300, 4),
  ('Avocado Toast', 'Breakfast', 'Sourdough toast with smashed avocado, poached egg, and chili flakes.', 340, 5);
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==== 20260212101715 ====
CREATE POLICY "Public update settings" ON public.settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public insert units" ON public.units FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update units" ON public.units FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete units" ON public.units FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "Public insert tables" ON public.resort_tables FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update tables" ON public.resort_tables FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete tables" ON public.resort_tables FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "Public insert menu" ON public.menu_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update menu" ON public.menu_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete menu" ON public.menu_items FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "Public update orders" ON public.orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete orders" ON public.orders FOR DELETE TO anon, authenticated USING (true);

-- ==== 20260212104144 ====
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- ==== 20260212113747 ====
CREATE TABLE public.tabs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_type TEXT NOT NULL DEFAULT 'WalkIn',
  location_detail TEXT NOT NULL DEFAULT '',
  guest_name TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  payment_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tabs" ON public.tabs FOR SELECT USING (true);
CREATE POLICY "Public insert tabs" ON public.tabs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update tabs" ON public.tabs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete tabs" ON public.tabs FOR DELETE USING (true);
ALTER TABLE public.orders ADD COLUMN tab_id UUID REFERENCES public.tabs(id);
ALTER TABLE public.orders ADD COLUMN service_charge NUMERIC NOT NULL DEFAULT 0;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tabs;

-- ==== 20260212123734 ====
CREATE TABLE public.resort_profile (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  logo_url text DEFAULT '',
  resort_name text NOT NULL DEFAULT '',
  tagline text DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  contact_name text DEFAULT '',
  contact_number text DEFAULT '',
  email text DEFAULT '',
  google_map_embed text DEFAULT '',
  google_map_url text DEFAULT '',
  facebook_url text DEFAULT '',
  instagram_url text DEFAULT '',
  tiktok_url text DEFAULT '',
  website_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_profile" ON public.resort_profile FOR SELECT USING (true);
CREATE POLICY "Public update resort_profile" ON public.resort_profile FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public insert resort_profile" ON public.resort_profile FOR INSERT WITH CHECK (true);
INSERT INTO public.resort_profile (resort_name) VALUES ('');
CREATE POLICY "Public read logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "Public upload logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos');
CREATE POLICY "Public update logos" ON storage.objects FOR UPDATE USING (bucket_id = 'logos') WITH CHECK (bucket_id = 'logos');
CREATE POLICY "Public delete logos" ON storage.objects FOR DELETE USING (bucket_id = 'logos');

-- ==== 20260212124738 ====
ALTER TABLE public.resort_profile ADD COLUMN logo_size integer DEFAULT 128;

-- ==== 20260214043338 ====
CREATE POLICY "Public insert settings" ON public.settings FOR INSERT WITH CHECK (true);

-- ==== 20260214045652 ====
CREATE TABLE public.order_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  type_key text NOT NULL,
  input_mode text NOT NULL DEFAULT 'text',
  source_table text DEFAULT NULL,
  placeholder text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read order_types" ON public.order_types FOR SELECT USING (true);
CREATE POLICY "Public insert order_types" ON public.order_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update order_types" ON public.order_types FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete order_types" ON public.order_types FOR DELETE USING (true);
INSERT INTO public.order_types (label, type_key, input_mode, source_table, placeholder, sort_order) VALUES
('Room / Unit', 'Room', 'select', 'units', 'Select unit', 1),
('Dine In', 'DineIn', 'select', 'resort_tables', 'Select table', 2),
('Beach', 'Beach', 'text', NULL, 'Describe your location (e.g., near the kayaks)', 3),
('Walk-In', 'WalkIn', 'text', NULL, 'Your name', 4);

-- ==== 20260214050119 ====
CREATE TABLE public.menu_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read menu_categories" ON public.menu_categories FOR SELECT USING (true);
CREATE POLICY "Public insert menu_categories" ON public.menu_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update menu_categories" ON public.menu_categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete menu_categories" ON public.menu_categories FOR DELETE USING (true);
INSERT INTO public.menu_categories (name, sort_order) VALUES
  ('Food Menu', 1), ('Non-Alcoholic', 2), ('Fruit Shakes', 3),
  ('Cocktails', 4), ('Wine', 5), ('Spirits', 6), ('Beer', 7);

-- ==== 20260215032947 ====
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read employees" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Public insert employees" ON public.employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employees" ON public.employees FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employees" ON public.employees FOR DELETE USING (true);
CREATE TABLE public.employee_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  hours_worked NUMERIC,
  total_pay NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read employee_shifts" ON public.employee_shifts FOR SELECT USING (true);
CREATE POLICY "Public insert employee_shifts" ON public.employee_shifts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_shifts" ON public.employee_shifts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_shifts" ON public.employee_shifts FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_shifts;

-- ==== 20260215053201 ====
CREATE TABLE public.ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'grams',
  cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  current_stock NUMERIC NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read ingredients" ON public.ingredients FOR SELECT USING (true);
CREATE POLICY "Public insert ingredients" ON public.ingredients FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update ingredients" ON public.ingredients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete ingredients" ON public.ingredients FOR DELETE USING (true);
CREATE TABLE public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, ingredient_id)
);
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read recipe_ingredients" ON public.recipe_ingredients FOR SELECT USING (true);
CREATE POLICY "Public insert recipe_ingredients" ON public.recipe_ingredients FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update recipe_ingredients" ON public.recipe_ingredients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete recipe_ingredients" ON public.recipe_ingredients FOR DELETE USING (true);
CREATE TABLE public.inventory_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  change_qty NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'stock_input',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read inventory_logs" ON public.inventory_logs FOR SELECT USING (true);
CREATE POLICY "Public insert inventory_logs" ON public.inventory_logs FOR INSERT WITH CHECK (true);

-- ==== 20260215072654 ====
CREATE TABLE public.payroll_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'regular',
  period_start DATE,
  period_end DATE,
  notes TEXT DEFAULT '',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read payroll_payments" ON public.payroll_payments FOR SELECT USING (true);
CREATE POLICY "Public insert payroll_payments" ON public.payroll_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update payroll_payments" ON public.payroll_payments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete payroll_payments" ON public.payroll_payments FOR DELETE USING (true);

-- ==== 20260216102132 ====
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft',
  image_url text, pdf_url text, vendor text,
  expense_date date, amount numeric DEFAULT 0,
  vat_type text DEFAULT 'vatable', tin text,
  tax_amount numeric DEFAULT 0, category text, notes text,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text, reviewed_at timestamptz,
  pay_period_start date, pay_period_end date, deleted_at timestamptz
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read expenses" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "Public insert expenses" ON public.expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update expenses" ON public.expenses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete expenses" ON public.expenses FOR DELETE USING (true);
CREATE TABLE public.expense_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  action text NOT NULL, user_name text, field text,
  old_value text, new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read expense_history" ON public.expense_history FOR SELECT USING (true);
CREATE POLICY "Public insert expense_history" ON public.expense_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read receipts" ON storage.objects FOR SELECT USING (bucket_id = 'receipts');
CREATE POLICY "Public upload receipts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "Public update receipts" ON storage.objects FOR UPDATE USING (bucket_id = 'receipts') WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "Public delete receipts" ON storage.objects FOR DELETE USING (bucket_id = 'receipts');

-- ==== 20260216102859 ====
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PHP';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS ai_confidence jsonb DEFAULT null;
