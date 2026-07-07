ALTER TABLE public.dining_reservations
  ADD COLUMN IF NOT EXISTS occasion text,
  ADD COLUMN IF NOT EXISTS contact_number text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS reservation_type text NOT NULL DEFAULT 'walk-in',
  ADD COLUMN IF NOT EXISTS pre_orders jsonb;