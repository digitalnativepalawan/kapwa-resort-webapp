
-- Create menu_categories table
CREATE TABLE public.menu_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies (matching existing public pattern)
CREATE POLICY "Public read menu_categories" ON public.menu_categories FOR SELECT USING (true);
CREATE POLICY "Public insert menu_categories" ON public.menu_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update menu_categories" ON public.menu_categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete menu_categories" ON public.menu_categories FOR DELETE USING (true);

-- Seed with 7 categories
INSERT INTO public.menu_categories (name, sort_order) VALUES
  ('Food Menu', 1),
  ('Non-Alcoholic', 2),
  ('Fruit Shakes', 3),
  ('Cocktails', 4),
  ('Wine', 5),
  ('Spirits', 6),
  ('Beer', 7);
