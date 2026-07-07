
-- Settings table (single row config)
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kitchen_whatsapp_number TEXT NOT NULL DEFAULT '',
  breakfast_start_time TIME DEFAULT '07:00',
  breakfast_end_time TIME DEFAULT '11:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Units table (rooms/glamping)
CREATE TABLE public.units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tables table (dine-in)
CREATE TABLE public.resort_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Menu items
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

-- Orders
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

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read settings" ON public.settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read units" ON public.units FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read tables" ON public.resort_tables FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read menu" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);

-- Public insert on orders (guests can place orders)
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
-- Admin read orders (via edge function with service role, but also allow for now)
CREATE POLICY "Public read orders" ON public.orders FOR SELECT TO anon, authenticated USING (true);

-- Seed settings
INSERT INTO public.settings (kitchen_whatsapp_number) VALUES ('');

-- Seed units
INSERT INTO public.units (unit_name) VALUES 
  ('Glamping 01'), ('Glamping 02'), ('Glamping 03'), ('Glamping 04'), ('Glamping 05'),
  ('Room 01'), ('Room 02'), ('Room 03');

-- Seed tables
INSERT INTO public.resort_tables (table_name) VALUES
  ('Table 1'), ('Table 2'), ('Table 3'), ('Table 4'), ('Table 5');

-- Seed menu items from the printed menu
INSERT INTO public.menu_items (name, category, description, price, sort_order) VALUES
  -- Starters
  ('Shrimp Tempura with Wasabi Mayo', 'Starters', 'Light, crispy battered shrimp served with a creamy wasabi mayo.', 460, 1),
  ('Tuna Tartare in Watermelon Gazpacho', 'Starters', 'Fresh diced tuna nestled in chilled watermelon gazpacho with micro greens.', 500, 2),
  ('Papas Bravas', 'Starters', 'Crispy potato cubes topped with spicy bravas sauce and garlic aioli.', 300, 3),
  ('Burrata with Grilled Peach', 'Starters', 'Creamy burrata cheese paired with caramelized grilled peaches and arugula.', 480, 4),
  ('Chicken Satay Skewers', 'Starters', 'Tender chicken skewers marinated in lemongrass, served with peanut sauce.', 350, 5),
  ('Crispy Calamari', 'Starters', 'Golden fried calamari rings with a zesty lemon-caper dipping sauce.', 380, 6),
  -- Main Courses
  ('Grilled Seafood Platter', 'Main Courses', 'A generous selection of grilled prawns, squid, and catch of the day.', 1200, 1),
  ('Wagyu Burger', 'Main Courses', 'Premium wagyu beef patty with truffle aioli, caramelized onions, and brioche bun.', 650, 2),
  ('Pan-Seared Salmon', 'Main Courses', 'Atlantic salmon fillet with lemon butter sauce, asparagus, and mashed potatoes.', 750, 3),
  ('Chicken Adobo', 'Main Courses', 'Traditional Filipino braised chicken in soy-vinegar glaze with steamed rice.', 400, 4),
  ('Pasta Vongole', 'Main Courses', 'Spaghetti with fresh clams in white wine, garlic, and chili.', 520, 5),
  ('Grilled Pork Belly', 'Main Courses', 'Slow-cooked pork belly with apple cider glaze and roasted vegetables.', 550, 6),
  -- Breakfast
  ('Eggs Benedict', 'Breakfast', 'Poached eggs on toasted English muffin with hollandaise sauce and ham.', 380, 1),
  ('Acai Bowl', 'Breakfast', 'Blended acai topped with granola, fresh fruits, and honey drizzle.', 350, 2),
  ('Filipino Breakfast', 'Breakfast', 'Garlic rice, longganisa, fried egg, and pickled papaya.', 320, 3),
  ('Pancake Stack', 'Breakfast', 'Fluffy buttermilk pancakes with maple syrup, berries, and whipped cream.', 300, 4),
  ('Avocado Toast', 'Breakfast', 'Sourdough toast with smashed avocado, poached egg, and chili flakes.', 340, 5);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
