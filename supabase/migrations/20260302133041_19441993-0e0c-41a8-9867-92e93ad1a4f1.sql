
ALTER TABLE public.tour_bookings ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT '';
ALTER TABLE public.tour_bookings ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE public.tour_bookings ADD COLUMN IF NOT EXISTS pickup_time text NOT NULL DEFAULT '';
