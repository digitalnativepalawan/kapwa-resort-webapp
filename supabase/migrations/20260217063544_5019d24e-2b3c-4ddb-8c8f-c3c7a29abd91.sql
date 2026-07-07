
-- resort_ops_units
CREATE TABLE public.resort_ops_units (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT '',
  base_price numeric NOT NULL DEFAULT 0,
  capacity integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_units" ON public.resort_ops_units FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_units" ON public.resort_ops_units FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_units" ON public.resort_ops_units FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_units" ON public.resort_ops_units FOR DELETE USING (true);

-- resort_ops_guests
CREATE TABLE public.resort_ops_guests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_guests" ON public.resort_ops_guests FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_guests" ON public.resort_ops_guests FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_guests" ON public.resort_ops_guests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_guests" ON public.resort_ops_guests FOR DELETE USING (true);

-- resort_ops_bookings
CREATE TABLE public.resort_ops_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_id uuid REFERENCES public.resort_ops_guests(id),
  unit_id uuid REFERENCES public.resort_ops_units(id),
  platform text NOT NULL DEFAULT '',
  check_in date NOT NULL,
  check_out date NOT NULL,
  adults integer NOT NULL DEFAULT 1,
  room_rate numeric NOT NULL DEFAULT 0,
  addons_total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  commission_applied numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_bookings" ON public.resort_ops_bookings FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_bookings" ON public.resort_ops_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_bookings" ON public.resort_ops_bookings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_bookings" ON public.resort_ops_bookings FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_ops_bookings;

-- resort_ops_expenses
CREATE TABLE public.resort_ops_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_expenses" ON public.resort_ops_expenses FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_expenses" ON public.resort_ops_expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_expenses" ON public.resort_ops_expenses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_expenses" ON public.resort_ops_expenses FOR DELETE USING (true);

-- resort_ops_tasks
CREATE TABLE public.resort_ops_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT '',
  due_date date NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_tasks" ON public.resort_ops_tasks FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_tasks" ON public.resort_ops_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_tasks" ON public.resort_ops_tasks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_tasks" ON public.resort_ops_tasks FOR DELETE USING (true);

-- resort_ops_assets
CREATE TABLE public.resort_ops_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT '',
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_assets" ON public.resort_ops_assets FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_assets" ON public.resort_ops_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_assets" ON public.resort_ops_assets FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_assets" ON public.resort_ops_assets FOR DELETE USING (true);

-- resort_ops_incoming_payments
CREATE TABLE public.resort_ops_incoming_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  expected_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_incoming_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_incoming_payments" ON public.resort_ops_incoming_payments FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_incoming_payments" ON public.resort_ops_incoming_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_incoming_payments" ON public.resort_ops_incoming_payments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_incoming_payments" ON public.resort_ops_incoming_payments FOR DELETE USING (true);
