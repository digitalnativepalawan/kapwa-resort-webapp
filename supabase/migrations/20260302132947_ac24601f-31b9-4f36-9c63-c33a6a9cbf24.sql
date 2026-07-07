
-- Add confirmed_by to guest_tours (the actual tour bookings table)
ALTER TABLE public.guest_tours ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT '';

-- Add confirmed_by to guest_requests
ALTER TABLE public.guest_requests ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT '';

-- Add confirmed_by to guest_reviews
ALTER TABLE public.guest_reviews ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT '';
