
-- Backfill resort_ops_units from the units table where not already present
INSERT INTO public.resort_ops_units (name, type, capacity)
SELECT u.unit_name, 'room', 2
FROM public.units u
WHERE u.active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.resort_ops_units rou
    WHERE lower(trim(rou.name)) = lower(trim(u.unit_name))
  );

-- Add a unique index on normalized name to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_resort_ops_units_name_unique ON public.resort_ops_units (lower(trim(name)));
