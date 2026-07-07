
-- 1. billing_config (single-row settings)
CREATE TABLE public.billing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enable_tax BOOLEAN NOT NULL DEFAULT true,
  tax_name TEXT NOT NULL DEFAULT 'VAT',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 12,
  enable_service_charge BOOLEAN NOT NULL DEFAULT true,
  service_charge_name TEXT NOT NULL DEFAULT 'Service Charge',
  service_charge_rate NUMERIC(5,2) NOT NULL DEFAULT 10,
  enable_city_tax BOOLEAN NOT NULL DEFAULT false,
  city_tax_name TEXT NOT NULL DEFAULT '',
  city_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  allow_room_charging BOOLEAN NOT NULL DEFAULT true,
  require_deposit BOOLEAN NOT NULL DEFAULT false,
  require_signature_above NUMERIC NOT NULL DEFAULT 5000,
  notify_charges_above NUMERIC NOT NULL DEFAULT 10000,
  default_payment_method TEXT NOT NULL DEFAULT 'Charge to Room',
  show_staff_on_receipt BOOLEAN NOT NULL DEFAULT true,
  show_itemized_taxes BOOLEAN NOT NULL DEFAULT true,
  show_payment_on_receipt BOOLEAN NOT NULL DEFAULT true,
  show_room_on_receipt BOOLEAN NOT NULL DEFAULT false,
  receipt_header TEXT NOT NULL DEFAULT '',
  receipt_footer TEXT NOT NULL DEFAULT 'Thank you! Please come again',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read billing_config" ON public.billing_config FOR SELECT USING (true);
CREATE POLICY "Public insert billing_config" ON public.billing_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update billing_config" ON public.billing_config FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER update_billing_config_updated_at
  BEFORE UPDATE ON public.billing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default row
INSERT INTO public.billing_config (id) VALUES (gen_random_uuid());

-- 2. payment_methods
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read payment_methods" ON public.payment_methods FOR SELECT USING (true);
CREATE POLICY "Public insert payment_methods" ON public.payment_methods FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update payment_methods" ON public.payment_methods FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete payment_methods" ON public.payment_methods FOR DELETE USING (true);

-- Seed default payment methods
INSERT INTO public.payment_methods (name, sort_order) VALUES
  ('Cash', 1),
  ('Credit Card', 2),
  ('Debit Card', 3),
  ('Charge to Room', 4),
  ('Complimentary', 5),
  ('Bank Transfer', 6),
  ('Foreign Currency', 7);

-- 3. room_transactions
CREATE TABLE public.room_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id),
  unit_name TEXT NOT NULL DEFAULT '',
  guest_name TEXT DEFAULT '',
  booking_id UUID REFERENCES public.resort_ops_bookings(id),
  transaction_type TEXT NOT NULL DEFAULT 'room_charge',
  order_id UUID REFERENCES public.orders(id),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_charge_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT '',
  staff_name TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.room_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read room_transactions" ON public.room_transactions FOR SELECT USING (true);
CREATE POLICY "Public insert room_transactions" ON public.room_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update room_transactions" ON public.room_transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete room_transactions" ON public.room_transactions FOR DELETE USING (true);

-- 4. Add columns to orders
ALTER TABLE public.orders ADD COLUMN guest_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN room_id UUID REFERENCES public.units(id);
ALTER TABLE public.orders ADD COLUMN tax_details JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN staff_name TEXT NOT NULL DEFAULT '';
