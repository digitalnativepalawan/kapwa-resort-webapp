
-- Update foreign keys on resort_ops_bookings to CASCADE on delete
ALTER TABLE public.guest_notes DROP CONSTRAINT guest_notes_booking_id_fkey;
ALTER TABLE public.guest_notes ADD CONSTRAINT guest_notes_booking_id_fkey 
  FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.guest_tours DROP CONSTRAINT guest_tours_booking_id_fkey;
ALTER TABLE public.guest_tours ADD CONSTRAINT guest_tours_booking_id_fkey 
  FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.room_transactions DROP CONSTRAINT room_transactions_booking_id_fkey;
ALTER TABLE public.room_transactions ADD CONSTRAINT room_transactions_booking_id_fkey 
  FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.guest_requests DROP CONSTRAINT guest_requests_booking_id_fkey;
ALTER TABLE public.guest_requests ADD CONSTRAINT guest_requests_booking_id_fkey 
  FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.guest_reviews DROP CONSTRAINT guest_reviews_booking_id_fkey;
ALTER TABLE public.guest_reviews ADD CONSTRAINT guest_reviews_booking_id_fkey 
  FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.tour_bookings DROP CONSTRAINT tour_bookings_booking_id_fkey;
ALTER TABLE public.tour_bookings ADD CONSTRAINT tour_bookings_booking_id_fkey 
  FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.bill_disputes DROP CONSTRAINT IF EXISTS bill_disputes_booking_id_fkey;
ALTER TABLE public.bill_disputes ADD CONSTRAINT bill_disputes_booking_id_fkey 
  FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;
