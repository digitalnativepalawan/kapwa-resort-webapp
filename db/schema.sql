-- ============================================================================
-- KAPWA Hospitality OS — Standalone Neon PostgreSQL Schema
-- Compatible with Neon Serverless Postgres and standard PostgreSQL 15+
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==== 20260212101410 ====
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kitchen_whatsapp_number TEXT NOT NULL DEFAULT '',
  breakfast_start_time TIME DEFAULT '07:00',
  breakfast_end_time TIME DEFAULT '11:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.resort_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Main Courses',
  description TEXT DEFAULT '',
  food_cost NUMERIC(10,2) DEFAULT 0,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  available BOOLEAN NOT NULL DEFAULT true,
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_type TEXT NOT NULL DEFAULT 'WalkIn',
  location_detail TEXT DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_type TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.settings (kitchen_whatsapp_number) VALUES ('');
INSERT INTO public.units (unit_name) VALUES
  ('Glamping 01'), ('Glamping 02'), ('Glamping 03'), ('Glamping 04'), ('Glamping 05'),
  ('Room 01'), ('Room 02'), ('Room 03');
INSERT INTO public.resort_tables (table_name) VALUES
  ('Table 1'), ('Table 2'), ('Table 3'), ('Table 4'), ('Table 5');
INSERT INTO public.menu_items (name, category, description, price, sort_order) VALUES
  ('Shrimp Tempura with Wasabi Mayo', 'Starters', 'Light, crispy battered shrimp served with a creamy wasabi mayo.', 460, 1),
  ('Tuna Tartare in Watermelon Gazpacho', 'Starters', 'Fresh diced tuna nestled in chilled watermelon gazpacho with micro greens.', 500, 2),
  ('Papas Bravas', 'Starters', 'Crispy potato cubes topped with spicy bravas sauce and garlic aioli.', 300, 3),
  ('Burrata with Grilled Peach', 'Starters', 'Creamy burrata cheese paired with caramelized grilled peaches and arugula.', 480, 4),
  ('Chicken Satay Skewers', 'Starters', 'Tender chicken skewers marinated in lemongrass, served with peanut sauce.', 350, 5),
  ('Crispy Calamari', 'Starters', 'Golden fried calamari rings with a zesty lemon-caper dipping sauce.', 380, 6),
  ('Grilled Seafood Platter', 'Main Courses', 'A generous selection of grilled prawns, squid, and catch of the day.', 1200, 1),
  ('Wagyu Burger', 'Main Courses', 'Premium wagyu beef patty with truffle aioli, caramelized onions, and brioche bun.', 650, 2),
  ('Pan-Seared Salmon', 'Main Courses', 'Atlantic salmon fillet with lemon butter sauce, asparagus, and mashed potatoes.', 750, 3),
  ('Chicken Adobo', 'Main Courses', 'Traditional Filipino braised chicken in soy-vinegar glaze with steamed rice.', 400, 4),
  ('Pasta Vongole', 'Main Courses', 'Spaghetti with fresh clams in white wine, garlic, and chili.', 520, 5),
  ('Grilled Pork Belly', 'Main Courses', 'Slow-cooked pork belly with apple cider glaze and roasted vegetables.', 550, 6),
  ('Eggs Benedict', 'Breakfast', 'Poached eggs on toasted English muffin with hollandaise sauce and ham.', 380, 1),
  ('Acai Bowl', 'Breakfast', 'Blended acai topped with granola, fresh fruits, and honey drizzle.', 350, 2),
  ('Filipino Breakfast', 'Breakfast', 'Garlic rice, longganisa, fried egg, and pickled papaya.', 320, 3),
  ('Pancake Stack', 'Breakfast', 'Fluffy buttermilk pancakes with maple syrup, berries, and whipped cream.', 300, 4),
  ('Avocado Toast', 'Breakfast', 'Sourdough toast with smashed avocado, poached egg, and chili flakes.', 340, 5);
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==== 20260212101715 ====

-- ==== 20260212104144 ====
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==== 20260212113747 ====
CREATE TABLE IF NOT EXISTS public.tabs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_type TEXT NOT NULL DEFAULT 'WalkIn',
  location_detail TEXT NOT NULL DEFAULT '',
  guest_name TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  payment_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

ALTER TABLE public.orders ADD COLUMN tab_id UUID REFERENCES public.tabs(id);
ALTER TABLE public.orders ADD COLUMN service_charge NUMERIC NOT NULL DEFAULT 0;

-- ==== 20260212123734 ====
CREATE TABLE IF NOT EXISTS public.resort_profile (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  logo_url text DEFAULT '',
  resort_name text NOT NULL DEFAULT '',
  tagline text DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  contact_name text DEFAULT '',
  contact_number text DEFAULT '',
  email text DEFAULT '',
  google_map_embed text DEFAULT '',
  google_map_url text DEFAULT '',
  facebook_url text DEFAULT '',
  instagram_url text DEFAULT '',
  tiktok_url text DEFAULT '',
  website_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.resort_profile (resort_name) VALUES ('');

-- ==== 20260212124738 ====
ALTER TABLE public.resort_profile ADD COLUMN logo_size integer DEFAULT 128;

-- ==== 20260214043338 ====

-- ==== 20260214045652 ====
CREATE TABLE IF NOT EXISTS public.order_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  type_key text NOT NULL,
  input_mode text NOT NULL DEFAULT 'text',
  source_table text DEFAULT NULL,
  placeholder text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.order_types (label, type_key, input_mode, source_table, placeholder, sort_order) VALUES
('Room / Unit', 'Room', 'select', 'units', 'Select unit', 1),
('Dine In', 'DineIn', 'select', 'resort_tables', 'Select table', 2),
('Beach', 'Beach', 'text', NULL, 'Describe your location (e.g., near the kayaks)', 3),
('Walk-In', 'WalkIn', 'text', NULL, 'Your name', 4);

-- ==== 20260214050119 ====
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.menu_categories (name, sort_order) VALUES
  ('Food Menu', 1), ('Non-Alcoholic', 2), ('Fruit Shakes', 3),
  ('Cocktails', 4), ('Wine', 5), ('Spirits', 6), ('Beer', 7);

-- ==== 20260215032947 ====
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  hours_worked NUMERIC,
  total_pay NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== 20260215053201 ====
CREATE TABLE IF NOT EXISTS public.ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'grams',
  cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  current_stock NUMERIC NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  change_qty NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'stock_input',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== 20260215072654 ====
CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'regular',
  period_start DATE,
  period_end DATE,
  notes TEXT DEFAULT '',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== 20260216102132 ====
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft',
  image_url text, pdf_url text, vendor text,
  expense_date date, amount numeric DEFAULT 0,
  vat_type text DEFAULT 'vatable', tin text,
  tax_amount numeric DEFAULT 0, category text, notes text,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text, reviewed_at timestamptz,
  pay_period_start date, pay_period_end date, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.expense_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  action text NOT NULL, user_name text, field text,
  old_value text, new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==== 20260216102859 ====
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PHP';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS ai_confidence jsonb DEFAULT null;

-- resort_ops_units
CREATE TABLE IF NOT EXISTS public.resort_ops_units (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, type text NOT NULL DEFAULT '',
  base_price numeric NOT NULL DEFAULT 0, capacity integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resort_ops_guests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL, email text, phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resort_ops_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_id uuid REFERENCES public.resort_ops_guests(id),
  unit_id uuid REFERENCES public.resort_ops_units(id),
  platform text NOT NULL DEFAULT '',
  check_in date NOT NULL, check_out date NOT NULL,
  adults integer NOT NULL DEFAULT 1,
  room_rate numeric NOT NULL DEFAULT 0,
  addons_total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  commission_applied numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resort_ops_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, category text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resort_ops_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL, description text DEFAULT '',
  category text NOT NULL DEFAULT '',
  due_date date NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resort_ops_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, balance numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT '',
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resort_ops_incoming_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL, amount numeric NOT NULL DEFAULT 0,
  expected_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resort_ops_bookings ADD COLUMN IF NOT EXISTS sirvoy_booking_id integer, ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
ALTER TABLE public.resort_ops_guests ADD COLUMN IF NOT EXISTS sirvoy_guest_ref text;
CREATE INDEX IF NOT EXISTS idx_bookings_sirvoy_id ON public.resort_ops_bookings(sirvoy_booking_id);

ALTER TABLE public.resort_ops_expenses
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.resort_ops_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.resort_ops_expenses
  ADD COLUMN IF NOT EXISTS supplier_tin text,
  ADD COLUMN IF NOT EXISTS vat_status text NOT NULL DEFAULT 'Non-VAT',
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS official_receipt_number text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS vatable_sale numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_exempt_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zero_rated_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withholding_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS project_unit text;

CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thank_you_message text NOT NULL DEFAULT 'Thank you for dining with us!',
  business_hours text NOT NULL DEFAULT 'Open daily: 7AM - 10PM',
  footer_text text NOT NULL DEFAULT '',
  tin_number text NOT NULL DEFAULT '',
  service_charge_pct numeric NOT NULL DEFAULT 10,
  show_service_charge boolean NOT NULL DEFAULT true,
  show_payment_method boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_invoice_settings_updated_at BEFORE UPDATE ON public.invoice_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employees
  ADD COLUMN rate_type text NOT NULL DEFAULT 'hourly',
  ADD COLUMN daily_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN monthly_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_payments ADD COLUMN bonus_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.employee_bonuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  bonus_month date,
  is_employee_of_month boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payday_type text NOT NULL DEFAULT 'weekly',
  payday_day_of_week integer NOT NULL DEFAULT 6,
  payday_days_interval integer NOT NULL DEFAULT 15,
  eom_bonus_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_payroll_settings_updated_at BEFORE UPDATE ON public.payroll_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.payroll_settings (payday_type, payday_day_of_week, payday_days_interval, eom_bonus_amount) VALUES ('weekly', 6, 15, 0);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS messenger_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.employee_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  due_date timestamptz, completed_at timestamptz,
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_employee_tasks_updated_at BEFORE UPDATE ON public.employee_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders ADD COLUMN scheduled_for timestamptz DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.employee_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, permission)
);

CREATE TABLE IF NOT EXISTS public.guest_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_id uuid REFERENCES public.resort_ops_guests(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'passport',
  image_url text NOT NULL,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid REFERENCES public.resort_ops_bookings(id) ON DELETE SET NULL,
  unit_name text NOT NULL DEFAULT '',
  note_type text NOT NULL DEFAULT 'general',
  content text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_tours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid REFERENCES public.resort_ops_bookings(id) ON DELETE SET NULL,
  tour_name text NOT NULL DEFAULT '',
  tour_date date NOT NULL DEFAULT CURRENT_DATE,
  pax integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'booked',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ADD COLUMN preferred_contact_method text NOT NULL DEFAULT 'messenger';

CREATE TABLE IF NOT EXISTS public.app_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL, label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_vibe_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_name text NOT NULL DEFAULT '',
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  guest_name text NOT NULL DEFAULT '',
  nationality text NOT NULL DEFAULT '',
  age_range text[] NOT NULL DEFAULT '{}',
  travel_composition text[] NOT NULL DEFAULT '{}',
  arrival_energy text[] NOT NULL DEFAULT '{}',
  communication_style text[] NOT NULL DEFAULT '{}',
  personality_type text[] NOT NULL DEFAULT '{}',
  mood_state text[] NOT NULL DEFAULT '{}',
  special_context text[] NOT NULL DEFAULT '{}',
  early_signals text[] NOT NULL DEFAULT '{}',
  gut_feeling text[] NOT NULL DEFAULT '{}',
  review_risk_level text[] NOT NULL DEFAULT '{}',
  staff_notes text NOT NULL DEFAULT '',
  food_allergies text NOT NULL DEFAULT '',
  medical_conditions text NOT NULL DEFAULT '',
  personal_preferences text NOT NULL DEFAULT '',
  checked_out boolean NOT NULL DEFAULT false,
  checkout_date date,
  checkout_outcome text NOT NULL DEFAULT '',
  review_status text NOT NULL DEFAULT '',
  checkout_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vibe_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vibe_record_id uuid NOT NULL REFERENCES public.guest_vibe_records(id) ON DELETE CASCADE,
  updated_fields jsonb NOT NULL DEFAULT '{}',
  updated_by text NOT NULL DEFAULT 'staff',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interventions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vibe_record_id uuid NOT NULL REFERENCES public.guest_vibe_records(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.resort_ops_units (name, type, capacity)
SELECT u.unit_name, 'room', 2 FROM public.units u
WHERE u.active = true
  AND NOT EXISTS (SELECT 1 FROM public.resort_ops_units rou WHERE lower(trim(rou.name)) = lower(trim(u.unit_name)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_resort_ops_units_name_unique ON public.resort_ops_units (lower(trim(name)));

ALTER TABLE public.guest_documents ADD COLUMN IF NOT EXISTS unit_name text NOT NULL DEFAULT '', ALTER COLUMN guest_id DROP NOT NULL;
ALTER TABLE public.guest_tours
  ADD COLUMN IF NOT EXISTS unit_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pickup_time text NOT NULL DEFAULT '';
ALTER TABLE public.resort_ops_bookings
  ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_requests text NOT NULL DEFAULT '';
ALTER TABLE public.employees ADD COLUMN whatsapp_number TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid,
  employee_name text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  table_name text NOT NULL DEFAULT '',
  record_id text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  is_paid boolean NOT NULL DEFAULT false,
  paid_amount numeric, paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_entries DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.weekly_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  time_in time NOT NULL, time_out time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.weekly_schedules DISABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weekly_schedules_updated_at BEFORE UPDATE ON public.weekly_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.room_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.housekeeping_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  item_label text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  count_expected integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cleaning_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Standard Clean',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cleaning_package_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES public.cleaning_packages(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  default_quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.housekeeping_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_name text NOT NULL DEFAULT '',
  room_type_id uuid REFERENCES public.room_types(id),
  status text NOT NULL DEFAULT 'pending_inspection',
  assigned_to uuid REFERENCES public.employees(id),
  inspection_data jsonb DEFAULT '[]'::jsonb,
  damage_notes text NOT NULL DEFAULT '',
  cleaning_notes text NOT NULL DEFAULT '',
  supplies_used jsonb DEFAULT '[]'::jsonb,
  inspection_completed_at timestamptz,
  cleaning_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.units ADD COLUMN room_type_id uuid REFERENCES public.room_types(id);
ALTER TABLE public.units ADD COLUMN status text NOT NULL DEFAULT 'ready';

ALTER TABLE public.menu_items ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';
ALTER TABLE public.menu_categories ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';

CREATE TABLE IF NOT EXISTS public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_name TEXT NOT NULL, device_id TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL DEFAULT 'kitchen',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ, last_login_employee_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN kitchen_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN bar_status TEXT NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS public.billing_config (
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

CREATE TRIGGER update_billing_config_updated_at BEFORE UPDATE ON public.billing_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.billing_config (id) VALUES (gen_random_uuid());

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.payment_methods (name, sort_order) VALUES
  ('Cash', 1), ('Credit Card', 2), ('Debit Card', 3),
  ('Charge to Room', 4), ('Complimentary', 5),
  ('Bank Transfer', 6), ('Foreign Currency', 7);

CREATE TABLE IF NOT EXISTS public.room_transactions (
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

ALTER TABLE public.orders ADD COLUMN guest_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN room_id UUID REFERENCES public.units(id);
ALTER TABLE public.orders ADD COLUMN tax_details JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN staff_name TEXT NOT NULL DEFAULT '';

ALTER TABLE public.resort_ops_bookings ADD COLUMN room_password TEXT, ADD COLUMN password_expires_at TIMESTAMPTZ;
CREATE INDEX idx_bookings_room_password ON public.resort_ops_bookings(room_password) WHERE room_password IS NOT NULL;

ALTER TABLE public.ingredients ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';
ALTER TABLE public.inventory_logs ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';

ALTER TABLE public.housekeeping_orders
  ADD COLUMN accepted_by UUID REFERENCES public.employees(id),
  ADD COLUMN accepted_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN accepted_at TIMESTAMPTZ,
  ADD COLUMN completed_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN inspection_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN cleaning_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN time_to_complete_minutes INTEGER;

CREATE TABLE IF NOT EXISTS public.request_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, icon text NOT NULL DEFAULT '📋',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_requests (
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

CREATE TABLE IF NOT EXISTS public.review_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.resort_ops_bookings(id),
  room_id uuid REFERENCES public.units(id),
  guest_name text NOT NULL DEFAULT '',
  ratings jsonb NOT NULL DEFAULT '{}',
  comments text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tours_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  duration text NOT NULL DEFAULT '',
  schedule text NOT NULL DEFAULT '',
  max_pax integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tour_bookings (
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

CREATE TABLE IF NOT EXISTS public.transport_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rental_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL DEFAULT 'Scooter',
  rate_name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resort_ops_bookings
  ADD COLUMN IF NOT EXISTS last_guest_login timestamptz,
  ADD COLUMN IF NOT EXISTS guest_login_count integer NOT NULL DEFAULT 0;

INSERT INTO public.request_categories (name, icon, sort_order) VALUES
  ('Housekeeping', '🧹', 1), ('Maintenance', '🔧', 2),
  ('Towels & Linens', '🛁', 3), ('Room Service', '🍽️', 4),
  ('Other', '📋', 5);
INSERT INTO public.review_settings (category_name, sort_order) VALUES
  ('Cleanliness', 1), ('Staff Friendliness', 2), ('Food & Drinks', 3),
  ('Location', 4), ('Value for Money', 5), ('Overall Experience', 6);

ALTER TABLE public.transport_rates ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'San Vicente';
ALTER TABLE public.transport_rates ADD COLUMN IF NOT EXISTS destination text NOT NULL DEFAULT '';
UPDATE public.transport_rates SET destination = type WHERE destination = '';

ALTER TABLE public.guest_tours ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT '';
ALTER TABLE public.guest_requests ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT '';
ALTER TABLE public.guest_reviews ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT '';
ALTER TABLE public.tour_bookings ADD COLUMN IF NOT EXISTS confirmed_by text NOT NULL DEFAULT '';
ALTER TABLE public.tour_bookings ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE public.tour_bookings ADD COLUMN IF NOT EXISTS pickup_time text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_types ADD COLUMN base_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.employee_tasks ADD COLUMN IF NOT EXISTS completion_meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.employee_tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  image_url text, link_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.decrement_stock(p_ingredient_id uuid, p_amount numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.ingredients SET current_stock = GREATEST(0, current_stock - p_amount) WHERE id = p_ingredient_id;
$$;

ALTER TABLE public.resort_ops_bookings ADD COLUMN IF NOT EXISTS bill_agreed_at timestamptz DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.bill_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  room_id uuid, unit_name text NOT NULL DEFAULT '',
  guest_name text NOT NULL DEFAULT '',
  guest_message text NOT NULL DEFAULT '',
  staff_response text NOT NULL DEFAULT '',
  responded_by text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.guest_notes DROP CONSTRAINT guest_notes_booking_id_fkey;
ALTER TABLE public.guest_notes ADD CONSTRAINT guest_notes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;
ALTER TABLE public.guest_tours DROP CONSTRAINT guest_tours_booking_id_fkey;
ALTER TABLE public.guest_tours ADD CONSTRAINT guest_tours_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;
ALTER TABLE public.room_transactions DROP CONSTRAINT room_transactions_booking_id_fkey;
ALTER TABLE public.room_transactions ADD CONSTRAINT room_transactions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;
ALTER TABLE public.guest_requests DROP CONSTRAINT guest_requests_booking_id_fkey;
ALTER TABLE public.guest_requests ADD CONSTRAINT guest_requests_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;
ALTER TABLE public.guest_reviews DROP CONSTRAINT guest_reviews_booking_id_fkey;
ALTER TABLE public.guest_reviews ADD CONSTRAINT guest_reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;
ALTER TABLE public.tour_bookings DROP CONSTRAINT tour_bookings_booking_id_fkey;
ALTER TABLE public.tour_bookings ADD CONSTRAINT tour_bookings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;
ALTER TABLE public.bill_disputes DROP CONSTRAINT IF EXISTS bill_disputes_booking_id_fkey;
ALTER TABLE public.bill_disputes ADD CONSTRAINT bill_disputes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.resort_ops_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.resort_ops_bookings
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'walkin',
  ADD COLUMN IF NOT EXISTS external_reservation_id text NULL,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS external_data jsonb NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_external_res_id ON public.resort_ops_bookings (external_reservation_id) WHERE external_reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL, event_type text NOT NULL,
  source text NOT NULL DEFAULT 'unknown',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  retry_count int NOT NULL DEFAULT 0,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events (event_id);

CREATE TABLE IF NOT EXISTS public.employee_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, role_key)
);

CREATE INDEX IF NOT EXISTS idx_resort_ops_bookings_dates ON public.resort_ops_bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_resort_ops_bookings_unit_id ON public.resort_ops_bookings(unit_id);

ALTER TABLE public.resort_ops_bookings
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.it_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bot_provider TEXT NOT NULL DEFAULT 'ollama',
  ADD COLUMN IF NOT EXISTS bot_base_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434',
  ADD COLUMN IF NOT EXISTS bot_model TEXT NOT NULL DEFAULT 'qwen2.5:3b',
  ADD COLUMN IF NOT EXISTS bot_temperature NUMERIC(3,2) NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS bot_max_tokens INTEGER NOT NULL DEFAULT 180;

CREATE TABLE IF NOT EXISTS public.guest_faq_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.update_guest_faq_memory_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_guest_faq_memory_updated_at BEFORE UPDATE ON public.guest_faq_memory FOR EACH ROW EXECUTE FUNCTION public.update_guest_faq_memory_updated_at();

-- Targeted GRANTs for frontend-reachable tables
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'app_options','audit_log','bill_disputes','billing_config',
    'cleaning_package_items','cleaning_packages','devices',
    'employee_bonuses','employee_permissions','employee_roles','employee_shifts',
    'employee_tasks','employees','expenses','expense_history',
    'guest_documents','guest_faq_memory','guest_notes','guest_requests',
    'guest_reviews','guest_tours','guest_vibe_records',
    'housekeeping_checklists','housekeeping_orders','ingredients',
    'interventions','inventory_logs','invoice_settings','it_notes',
    'menu_categories','menu_items','order_types','orders','payment_methods',
    'payroll_payments','payroll_settings','recipe_ingredients','rental_rates',
    'request_categories','resort_ops_assets','resort_ops_bookings',
    'resort_ops_expenses','resort_ops_guests','resort_ops_incoming_payments',
    'resort_ops_tasks','resort_ops_units','resort_profile','resort_tables',
    'review_settings','room_transactions','room_types','settings',
    'staff_roles','tabs','task_comments','time_entries','tour_bookings',
    'tours_config','transport_rates','units','vibe_updates','webhook_events',
    'weekly_schedules'
  ]) LOOP
    EXECUTE format('
    EXECUTE format('
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.dining_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_name text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  reservation_date date NOT NULL DEFAULT CURRENT_DATE,
  reservation_time text NOT NULL DEFAULT '',
  pax integer NOT NULL DEFAULT 1,
  table_name text NOT NULL DEFAULT '',
  location_type text NOT NULL DEFAULT 'DineIn',
  location_detail text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'confirmed',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_dining_reservations_updated_at BEFORE UPDATE ON public.dining_reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_for_billing boolean NOT NULL DEFAULT false;

ALTER TABLE public.dining_reservations
  ADD COLUMN IF NOT EXISTS occasion text,
  ADD COLUMN IF NOT EXISTS contact_number text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS reservation_type text NOT NULL DEFAULT 'walk-in',
  ADD COLUMN IF NOT EXISTS pre_orders jsonb;

-- Shared Guest Portal bot settings and reusable FAQ memory.
-- This follows the repository's current permissive policy model so the guest portal
-- can read active answers without signing in. Tighten write policies when staff JWT
-- enforcement is enabled across the app.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bot_provider TEXT NOT NULL DEFAULT 'ollama',
  ADD COLUMN IF NOT EXISTS bot_base_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434',
  ADD COLUMN IF NOT EXISTS bot_model TEXT NOT NULL DEFAULT 'qwen2.5:3b',
  ADD COLUMN IF NOT EXISTS bot_temperature NUMERIC(3,2) NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS bot_max_tokens INTEGER NOT NULL DEFAULT 180;

CREATE TABLE IF NOT EXISTS public.guest_faq_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.update_guest_faq_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_guest_faq_memory_updated_at ON public.guest_faq_memory;
CREATE TRIGGER update_guest_faq_memory_updated_at
  BEFORE UPDATE ON public.guest_faq_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_guest_faq_memory_updated_at();

alter table public.guest_requests
  add column if not exists routed_group text,
  add column if not exists assigned_to text,
  add column if not exists assigned_at timestamptz,
  add column if not exists completed_by text,
  add column if not exists completed_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_message_id bigint,
  add column if not exists resolution_notes text not null default '';

create index if not exists guest_requests_status_created_idx
  on public.guest_requests(status, created_at);

create index if not exists guest_requests_routed_group_idx
  on public.guest_requests(routed_group, status);

comment on column public.guest_requests.routed_group is 'Telegram department group selected by concierge routing.';
comment on column public.guest_requests.assigned_to is 'Telegram staff identity that accepted the request.';
comment on column public.guest_requests.telegram_message_id is 'Telegram message used for accept/complete callbacks.';

-- Shared operational case model for the resort operator agent.
-- One case = one tracked problem from detection to verified resolution.
-- Designed against two dissimilar domains first: guest_request and unpaid_balance.

create table if not exists public.ops_cases (
  id uuid primary key default gen_random_uuid(),
  domain text not null,                          -- 'guest_request' | 'unpaid_balance' | future domains
  issue_type text not null default '',           -- e.g. 'towels', 'departure_unpaid'
  source_table text not null default '',         -- table the case was detected from
  source_id uuid,                                -- row in that table
  booking_id uuid references public.resort_ops_bookings(id),
  guest_name text not null default '',
  unit_label text not null default '',
  department text not null default '',           -- routed department / telegram group key
  priority text not null default 'medium',       -- low | medium | high | urgent
  risk text not null default '',                 -- short human description of what is at stake
  status text not null default 'open',           -- open | assigned | in_progress | pending_approval | resolved | escalated | closed
  owner text not null default '',                -- staff identity if assigned
  due_at timestamptz,
  required_action text not null default '',
  approval_required boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  verification_rule text not null default '',    -- machine-readable rule key the verifier evaluates
  verified boolean not null default false,
  verified_at timestamptz,
  retry_count integer not null default 0,
  escalation_level integer not null default 0,
  resolution_evidence jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,    -- append-only [{at, event, detail}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

-- One open case per source record: dedupe guard the planner relies on.
create unique index if not exists ops_cases_open_source_uidx
  on public.ops_cases(domain, source_table, source_id)
  where status not in ('resolved', 'closed');

create index if not exists ops_cases_status_idx on public.ops_cases(status, priority);
create index if not exists ops_cases_domain_idx on public.ops_cases(domain, status);
create index if not exists ops_cases_due_idx on public.ops_cases(due_at) where status not in ('resolved','closed');

create or replace function public.ops_cases_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ops_cases_touch on public.ops_cases;
create trigger ops_cases_touch before update on public.ops_cases
  for each row execute function public.ops_cases_touch_updated_at();

comment on table public.ops_cases is 'Central operational case ledger used by the resort-operator agent runtime.';

-- Add provider-specific columns for the agent settings page
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS openrouter_model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS hermes_sub_provider TEXT NOT NULL DEFAULT 'ollama';

-- ============================================================================
-- KAPWA tenants: one row per sold property (webshop order -> this table).

-- ============================================================================
DO $$ BEGIN CREATE TYPE public.tenant_status AS ENUM (
  'provisioning',   -- order approved, awaiting Mission Control Setup
  'active',         -- project scaffolded + agent runtime enabled
  'suspended',
  'cancelled'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.kapwa_tenants (
  id            uuid primary key default gen_random_uuid(),
  property_name text not null default '',
  contact_email text not null,
  order_ref     text not null,                 -- webshop orders.order_ref bridge
  status        public.tenant_status not null default 'provisioning',
  neon_project_ref text,                       -- filled during Mission Control Setup
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (order_ref)
);

-- Tenants are backend/provisioning data. Access is restricted to backend services.

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger kapwa_tenants_touch before update on public.kapwa_tenants
  for each row execute function public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.guest_payment_settings (
  id uuid primary key default gen_random_uuid(),
  stripe_enabled boolean not null default false,
  stripe_link text not null default '',
  stripe_instructions text not null default '',
  gcash_enabled boolean not null default false,
  gcash_account_name text not null default '',
  gcash_number text not null default '',
  gcash_qr_image text not null default '',
  qrph_enabled boolean not null default false,
  qrph_account_name text not null default '',
  qrph_qr_image text not null default '',
  payment_instructions text not null default '',
  require_admin_verification boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TRIGGER update_guest_payment_settings_updated_at
BEFORE UPDATE ON public.guest_payment_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.guest_payment_settings (payment_instructions)
VALUES ('Please review your bill, agree to all charges, then pay using one of the methods below and upload your proof of payment. Reception will verify before check-out.');

CREATE TABLE IF NOT EXISTS public.guest_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.resort_ops_bookings(id) on delete set null,
  room_id uuid,
  unit_name text not null default '',
  guest_name text not null default '',
  method text not null,
  amount numeric not null default 0,
  reference text not null default '',
  proof_image text not null default '',
  agreed_to_charges boolean not null default false,
  agreed_at timestamptz,
  status text not null default 'pending',
  reviewed_by text not null default '',
  reviewed_at timestamptz,
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TRIGGER update_guest_payment_submissions_updated_at
BEFORE UPDATE ON public.guest_payment_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX guest_payment_submissions_booking_idx ON public.guest_payment_submissions(booking_id);
CREATE INDEX guest_payment_submissions_status_idx ON public.guest_payment_submissions(status);

-- TALA Voice Agent: guest memory + FAQ tables

-- Project: paghxagqnaisxesmhnwj (KAPWA OS)

-- ── Guest memory ──────────────────────────────────────────────────────────
-- One row per guest, keyed to resort_ops_guests.id.
-- Free-form preference fields kept as jsonb/text arrays so the agent can
-- grow the schema of "preferences" without new migrations every time.
create table if not exists public.guest_memory (
  id                  uuid primary key default gen_random_uuid(),
  guest_id            uuid references public.resort_ops_guests(id) on delete cascade,
  -- fallback identity match when guest_id isn't known yet (e.g. mid-call,
  -- before front desk has linked a booking) — match on normalized name/phone
  guest_name_fallback text,
  phone_fallback       text,

  preferred_name      text,            -- "what they like to be called"
  dietary_restrictions text[] default '{}',
  allergies           text[] default '{}',
  birthday            date,
  language_preference text default 'en', -- 'en' | 'tl' | 'taglish'

  favorite_activities text[] default '{}',
  favorite_foods      text[] default '{}',
  notes               text,            -- free-text running summary, agent-maintained

  visit_count         integer default 0,
  last_stay_unit_id   uuid references public.resort_ops_units(id),
  last_seen_at        timestamptz,

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists idx_guest_memory_guest_id on public.guest_memory(guest_id);
create index if not exists idx_guest_memory_phone on public.guest_memory(phone_fallback);

-- Service role (used by the LiveKit agent backend) has full access.
-- No public/anon access — guest memory is staff/agent-only.

-- ── Conversation log ──────────────────────────────────────────────────────
-- Raw turn-by-turn log per voice session, separate from hermes_conversations
-- (which is a different existing system) to avoid collision.
create table if not exists public.tala_conversations (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null,
  guest_id      uuid references public.resort_ops_guests(id) on delete set null,
  room_unit     text,
  transcript    jsonb not null default '[]'::jsonb, -- [{role, text, ts, audio_ms}]
  tool_calls    jsonb default '[]'::jsonb,            -- [{tool, args, result, ok, retries}]
  escalated     boolean default false,
  escalation_reason text,
  started_at    timestamptz default now(),
  ended_at      timestamptz
);

create index if not exists idx_tala_conv_session on public.tala_conversations(session_id);
create index if not exists idx_tala_conv_guest on public.tala_conversations(guest_id);

-- ── FAQ entries ───────────────────────────────────────────────────────────
-- Static, staff-curated answers. TALA must answer ONLY from this table for
-- faq_lookup() — never invent resort facts. Empty result -> "I'll check
-- that for you po."
create table if not exists public.faq_entries (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  answer      text not null,
  category    text default 'general', -- general | dining | activities | policies | transport
  keywords    text[] default '{}',     -- for simple keyword matching fallback
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_faq_keywords on public.faq_entries using gin(keywords);

-- anon/staff can read active FAQs (harmless, no PII)

-- Seed a few starter FAQs so faq_lookup() isn't empty on day one.
insert into public.faq_entries (question, answer, category, keywords) values
  ('What time is breakfast?', 'Breakfast is served daily from 7:00 AM to 10:00 AM po, at the main dining area.', 'dining', array['breakfast','dining time','meal time']),
  ('What time is check-out?', 'Check-out time is 11:00 AM po. Late check-out may be available — I can check with reception for you.', 'policies', array['checkout','check out time']),
  ('Is there wifi?', 'Yes po, free wifi is available throughout the resort. The password is posted in your room.', 'general', array['wifi','internet']),
  ('Do you have airport transfers?', 'Yes po, we can arrange airport transfers. I''ll connect you with our transport team for the schedule and rate.', 'transport', array['airport','transfer','pickup'])
on conflict do nothing;

CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  quantity NUMERIC NOT NULL DEFAULT 0,
  min_stock NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name TEXT NOT NULL,
  role TEXT NOT NULL,
  shift_start TIMESTAMPTZ NOT NULL,
  shift_end TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled'
);
