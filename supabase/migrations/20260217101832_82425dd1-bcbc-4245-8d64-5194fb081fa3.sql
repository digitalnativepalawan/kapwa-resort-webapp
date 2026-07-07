
ALTER TABLE resort_ops_bookings 
  ADD COLUMN IF NOT EXISTS sirvoy_booking_id integer,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';

ALTER TABLE resort_ops_guests 
  ADD COLUMN IF NOT EXISTS sirvoy_guest_ref text;

CREATE INDEX IF NOT EXISTS idx_bookings_sirvoy_id 
  ON resort_ops_bookings(sirvoy_booking_id);
