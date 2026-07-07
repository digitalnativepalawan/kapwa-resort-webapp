ALTER TABLE public.resort_ops_bookings
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMP WITH TIME ZONE;

UPDATE public.resort_ops_bookings
SET checked_in_at = COALESCE(checked_in_at, created_at, now())
WHERE checked_in_at IS NULL
  AND checked_out_at IS NULL
  AND room_password IS NOT NULL
  AND btrim(room_password) <> ''
  AND check_in <= (now() AT TIME ZONE 'Asia/Manila')::date
  AND check_out >= (now() AT TIME ZONE 'Asia/Manila')::date;