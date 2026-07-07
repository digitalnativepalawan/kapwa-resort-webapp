
-- Add unit_name to guest_documents so docs work without a guest check-in
ALTER TABLE public.guest_documents 
  ADD COLUMN IF NOT EXISTS unit_name text NOT NULL DEFAULT '',
  ALTER COLUMN guest_id DROP NOT NULL;

-- Add unit_name, provider, pickup_time to guest_tours
ALTER TABLE public.guest_tours
  ADD COLUMN IF NOT EXISTS unit_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pickup_time text NOT NULL DEFAULT '';

-- Add children and special_requests to resort_ops_bookings
ALTER TABLE public.resort_ops_bookings
  ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_requests text NOT NULL DEFAULT '';
