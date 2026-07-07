
-- Ingredients master table
CREATE TABLE public.ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'grams',
  cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  current_stock NUMERIC NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ingredients" ON public.ingredients FOR SELECT USING (true);
CREATE POLICY "Public insert ingredients" ON public.ingredients FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update ingredients" ON public.ingredients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete ingredients" ON public.ingredients FOR DELETE USING (true);

-- Recipe ingredients (links menu_items to ingredients with quantity)
CREATE TABLE public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, ingredient_id)
);

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read recipe_ingredients" ON public.recipe_ingredients FOR SELECT USING (true);
CREATE POLICY "Public insert recipe_ingredients" ON public.recipe_ingredients FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update recipe_ingredients" ON public.recipe_ingredients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete recipe_ingredients" ON public.recipe_ingredients FOR DELETE USING (true);

-- Inventory log (for weekly stock inputs by chef)
CREATE TABLE public.inventory_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  change_qty NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'stock_input',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read inventory_logs" ON public.inventory_logs FOR SELECT USING (true);
CREATE POLICY "Public insert inventory_logs" ON public.inventory_logs FOR INSERT WITH CHECK (true);
