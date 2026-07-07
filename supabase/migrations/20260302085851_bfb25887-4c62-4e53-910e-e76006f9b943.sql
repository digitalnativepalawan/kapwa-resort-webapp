
-- Add room password columns to resort_ops_bookings
ALTER TABLE public.resort_ops_bookings 
ADD COLUMN room_password TEXT,
ADD COLUMN password_expires_at TIMESTAMPTZ;

-- Add index for quick password lookup
CREATE INDEX idx_bookings_room_password ON public.resort_ops_bookings(room_password) WHERE room_password IS NOT NULL;
