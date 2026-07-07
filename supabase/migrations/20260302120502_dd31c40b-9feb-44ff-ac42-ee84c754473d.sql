
-- Guest Portal: Request categories config
CREATE TABLE public.request_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT '📋',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.request_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read request_categories" ON public.request_categories FOR SELECT USING (true);
CREATE POLICY "Public insert request_categories" ON public.request_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update request_categories" ON public.request_categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete request_categories" ON public.request_categories FOR DELETE USING (true);

-- Guest requests
CREATE TABLE public.guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.resort_ops_bookings(id),
  room_id uuid REFERENCES public.units(id),
  guest_name text NOT NULL DEFAULT '',
  request_type text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read guest_requests" ON public.guest_requests FOR SELECT USING (true);
CREATE POLICY "Public insert guest_requests" ON public.guest_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_requests" ON public.guest_requests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_requests" ON public.guest_requests FOR DELETE USING (true);

-- Review settings (admin-configurable categories)
CREATE TABLE public.review_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read review_settings" ON public.review_settings FOR SELECT USING (true);
CREATE POLICY "Public insert review_settings" ON public.review_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update review_settings" ON public.review_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete review_settings" ON public.review_settings FOR DELETE USING (true);

-- Guest reviews
CREATE TABLE public.guest_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.resort_ops_bookings(id),
  room_id uuid REFERENCES public.units(id),
  guest_name text NOT NULL DEFAULT '',
  ratings jsonb NOT NULL DEFAULT '{}',
  comments text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read guest_reviews" ON public.guest_reviews FOR SELECT USING (true);
CREATE POLICY "Public insert guest_reviews" ON public.guest_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_reviews" ON public.guest_reviews FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_reviews" ON public.guest_reviews FOR DELETE USING (true);

-- Tours config (admin-managed)
CREATE TABLE public.tours_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  duration text NOT NULL DEFAULT '',
  schedule text NOT NULL DEFAULT '',
  max_pax integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tours_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tours_config" ON public.tours_config FOR SELECT USING (true);
CREATE POLICY "Public insert tours_config" ON public.tours_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update tours_config" ON public.tours_config FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete tours_config" ON public.tours_config FOR DELETE USING (true);

-- Tour bookings (guest-created)
CREATE TABLE public.tour_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.resort_ops_bookings(id),
  guest_name text NOT NULL DEFAULT '',
  tour_name text NOT NULL DEFAULT '',
  tour_date date NOT NULL DEFAULT CURRENT_DATE,
  pax integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'confirmed',
  room_id uuid REFERENCES public.units(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tour_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tour_bookings" ON public.tour_bookings FOR SELECT USING (true);
CREATE POLICY "Public insert tour_bookings" ON public.tour_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update tour_bookings" ON public.tour_bookings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete tour_bookings" ON public.tour_bookings FOR DELETE USING (true);

-- Transport rates (admin-managed)
CREATE TABLE public.transport_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transport_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read transport_rates" ON public.transport_rates FOR SELECT USING (true);
CREATE POLICY "Public insert transport_rates" ON public.transport_rates FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update transport_rates" ON public.transport_rates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete transport_rates" ON public.transport_rates FOR DELETE USING (true);

-- Rental rates (admin-managed)
CREATE TABLE public.rental_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL DEFAULT 'Scooter',
  rate_name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rental_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read rental_rates" ON public.rental_rates FOR SELECT USING (true);
CREATE POLICY "Public insert rental_rates" ON public.rental_rates FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update rental_rates" ON public.rental_rates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete rental_rates" ON public.rental_rates FOR DELETE USING (true);

-- Add guest login tracking to bookings
ALTER TABLE public.resort_ops_bookings
  ADD COLUMN IF NOT EXISTS last_guest_login timestamptz,
  ADD COLUMN IF NOT EXISTS guest_login_count integer NOT NULL DEFAULT 0;

-- Seed default request categories
INSERT INTO public.request_categories (name, icon, sort_order) VALUES
  ('Housekeeping', '🧹', 1),
  ('Maintenance', '🔧', 2),
  ('Towels & Linens', '🛁', 3),
  ('Room Service', '🍽️', 4),
  ('Other', '📋', 5);

-- Seed default review categories
INSERT INTO public.review_settings (category_name, sort_order) VALUES
  ('Cleanliness', 1),
  ('Staff Friendliness', 2),
  ('Food & Drinks', 3),
  ('Location', 4),
  ('Value for Money', 5),
  ('Overall Experience', 6);
