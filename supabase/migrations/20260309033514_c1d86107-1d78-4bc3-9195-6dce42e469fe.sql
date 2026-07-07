CREATE OR REPLACE FUNCTION public.decrement_stock(p_ingredient_id uuid, p_amount numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ingredients
  SET current_stock = GREATEST(0, current_stock - p_amount)
  WHERE id = p_ingredient_id;
$$;