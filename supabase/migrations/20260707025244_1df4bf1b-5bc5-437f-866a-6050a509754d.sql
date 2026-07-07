-- resort_ops_units
CREATE TABLE public.resort_ops_units (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, type text NOT NULL DEFAULT '',
  base_price numeric NOT NULL DEFAULT 0, capacity integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_units" ON public.resort_ops_units FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_units" ON public.resort_ops_units FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_units" ON public.resort_ops_units FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_units" ON public.resort_ops_units FOR DELETE USING (true);

CREATE TABLE public.resort_ops_guests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL, email text, phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_guests" ON public.resort_ops_guests FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_guests" ON public.resort_ops_guests FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_guests" ON public.resort_ops_guests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_guests" ON public.resort_ops_guests FOR DELETE USING (true);

CREATE TABLE public.resort_ops_bookings (
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
ALTER TABLE public.resort_ops_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_bookings" ON public.resort_ops_bookings FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_bookings" ON public.resort_ops_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_bookings" ON public.resort_ops_bookings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_bookings" ON public.resort_ops_bookings FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_ops_bookings;

CREATE TABLE public.resort_ops_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, category text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_expenses" ON public.resort_ops_expenses FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_expenses" ON public.resort_ops_expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_expenses" ON public.resort_ops_expenses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_expenses" ON public.resort_ops_expenses FOR DELETE USING (true);

CREATE TABLE public.resort_ops_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL, description text DEFAULT '',
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

CREATE TABLE public.resort_ops_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, balance numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT '',
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_assets" ON public.resort_ops_assets FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_assets" ON public.resort_ops_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_assets" ON public.resort_ops_assets FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_assets" ON public.resort_ops_assets FOR DELETE USING (true);

CREATE TABLE public.resort_ops_incoming_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL, amount numeric NOT NULL DEFAULT 0,
  expected_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resort_ops_incoming_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read resort_ops_incoming_payments" ON public.resort_ops_incoming_payments FOR SELECT USING (true);
CREATE POLICY "Public insert resort_ops_incoming_payments" ON public.resort_ops_incoming_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update resort_ops_incoming_payments" ON public.resort_ops_incoming_payments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete resort_ops_incoming_payments" ON public.resort_ops_incoming_payments FOR DELETE USING (true);

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

CREATE TABLE public.invoice_settings (
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
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read invoice_settings" ON public.invoice_settings FOR SELECT USING (true);
CREATE POLICY "Public insert invoice_settings" ON public.invoice_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update invoice_settings" ON public.invoice_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE TRIGGER update_invoice_settings_updated_at BEFORE UPDATE ON public.invoice_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employees
  ADD COLUMN rate_type text NOT NULL DEFAULT 'hourly',
  ADD COLUMN daily_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN monthly_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_payments ADD COLUMN bonus_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE public.employee_bonuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  bonus_month date,
  is_employee_of_month boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read employee_bonuses" ON public.employee_bonuses FOR SELECT USING (true);
CREATE POLICY "Public insert employee_bonuses" ON public.employee_bonuses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_bonuses" ON public.employee_bonuses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_bonuses" ON public.employee_bonuses FOR DELETE USING (true);

CREATE TABLE public.payroll_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payday_type text NOT NULL DEFAULT 'weekly',
  payday_day_of_week integer NOT NULL DEFAULT 6,
  payday_days_interval integer NOT NULL DEFAULT 15,
  eom_bonus_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read payroll_settings" ON public.payroll_settings FOR SELECT USING (true);
CREATE POLICY "Public insert payroll_settings" ON public.payroll_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update payroll_settings" ON public.payroll_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE TRIGGER update_payroll_settings_updated_at BEFORE UPDATE ON public.payroll_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.payroll_settings (payday_type, payday_day_of_week, payday_days_interval, eom_bonus_amount) VALUES ('weekly', 6, 15, 0);
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_bonuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payroll_settings;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS messenger_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';

CREATE TABLE public.employee_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  due_date timestamptz, completed_at timestamptz,
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read employee_tasks" ON public.employee_tasks FOR SELECT USING (true);
CREATE POLICY "Public insert employee_tasks" ON public.employee_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_tasks" ON public.employee_tasks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_tasks" ON public.employee_tasks FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_tasks;
CREATE TRIGGER update_employee_tasks_updated_at BEFORE UPDATE ON public.employee_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders ADD COLUMN scheduled_for timestamptz DEFAULT NULL;

CREATE TABLE public.employee_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, permission)
);
ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read employee_permissions" ON public.employee_permissions FOR SELECT USING (true);
CREATE POLICY "Public insert employee_permissions" ON public.employee_permissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_permissions" ON public.employee_permissions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_permissions" ON public.employee_permissions FOR DELETE USING (true);

CREATE TABLE public.guest_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_id uuid REFERENCES public.resort_ops_guests(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'passport',
  image_url text NOT NULL,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read guest_documents" ON public.guest_documents FOR SELECT USING (true);
CREATE POLICY "Public insert guest_documents" ON public.guest_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_documents" ON public.guest_documents FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_documents" ON public.guest_documents FOR DELETE USING (true);

CREATE TABLE public.guest_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid REFERENCES public.resort_ops_bookings(id) ON DELETE SET NULL,
  unit_name text NOT NULL DEFAULT '',
  note_type text NOT NULL DEFAULT 'general',
  content text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read guest_notes" ON public.guest_notes FOR SELECT USING (true);
CREATE POLICY "Public insert guest_notes" ON public.guest_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_notes" ON public.guest_notes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_notes" ON public.guest_notes FOR DELETE USING (true);

CREATE TABLE public.guest_tours (
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
ALTER TABLE public.guest_tours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read guest_tours" ON public.guest_tours FOR SELECT USING (true);
CREATE POLICY "Public insert guest_tours" ON public.guest_tours FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_tours" ON public.guest_tours FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_tours" ON public.guest_tours FOR DELETE USING (true);
CREATE POLICY "Public insert guest-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'guest-documents');
CREATE POLICY "Public delete guest-documents" ON storage.objects FOR DELETE USING (bucket_id = 'guest-documents');

ALTER TABLE public.employees ADD COLUMN preferred_contact_method text NOT NULL DEFAULT 'messenger';

CREATE TABLE public.app_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL, label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read app_options" ON public.app_options FOR SELECT USING (true);
CREATE POLICY "Public insert app_options" ON public.app_options FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update app_options" ON public.app_options FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete app_options" ON public.app_options FOR DELETE USING (true);

CREATE TABLE public.guest_vibe_records (
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
ALTER TABLE public.guest_vibe_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read guest_vibe_records" ON public.guest_vibe_records FOR SELECT USING (true);
CREATE POLICY "Public insert guest_vibe_records" ON public.guest_vibe_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_vibe_records" ON public.guest_vibe_records FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_vibe_records" ON public.guest_vibe_records FOR DELETE USING (true);

CREATE TABLE public.vibe_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vibe_record_id uuid NOT NULL REFERENCES public.guest_vibe_records(id) ON DELETE CASCADE,
  updated_fields jsonb NOT NULL DEFAULT '{}',
  updated_by text NOT NULL DEFAULT 'staff',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vibe_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read vibe_updates" ON public.vibe_updates FOR SELECT USING (true);
CREATE POLICY "Public insert vibe_updates" ON public.vibe_updates FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update vibe_updates" ON public.vibe_updates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete vibe_updates" ON public.vibe_updates FOR DELETE USING (true);

CREATE TABLE public.interventions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vibe_record_id uuid NOT NULL REFERENCES public.guest_vibe_records(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read interventions" ON public.interventions FOR SELECT USING (true);
CREATE POLICY "Public insert interventions" ON public.interventions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update interventions" ON public.interventions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete interventions" ON public.interventions FOR DELETE USING (true);

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

CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid,
  employee_name text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  table_name text NOT NULL DEFAULT '',
  record_id text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read audit_log" ON public.audit_log FOR SELECT USING (true);
CREATE POLICY "Public insert audit_log" ON public.audit_log FOR INSERT WITH CHECK (true);

CREATE TABLE public.time_entries (
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

CREATE TABLE public.weekly_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  time_in time NOT NULL, time_out time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.weekly_schedules DISABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_schedules;
CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weekly_schedules_updated_at BEFORE UPDATE ON public.weekly_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.room_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read room_types" ON public.room_types FOR SELECT USING (true);
CREATE POLICY "Public insert room_types" ON public.room_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update room_types" ON public.room_types FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete room_types" ON public.room_types FOR DELETE USING (true);

CREATE TABLE public.housekeeping_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  item_label text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  count_expected integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.housekeeping_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read housekeeping_checklists" ON public.housekeeping_checklists FOR SELECT USING (true);
CREATE POLICY "Public insert housekeeping_checklists" ON public.housekeeping_checklists FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update housekeeping_checklists" ON public.housekeeping_checklists FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete housekeeping_checklists" ON public.housekeeping_checklists FOR DELETE USING (true);

CREATE TABLE public.cleaning_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Standard Clean',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cleaning_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cleaning_packages" ON public.cleaning_packages FOR SELECT USING (true);
CREATE POLICY "Public insert cleaning_packages" ON public.cleaning_packages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update cleaning_packages" ON public.cleaning_packages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete cleaning_packages" ON public.cleaning_packages FOR DELETE USING (true);

CREATE TABLE public.cleaning_package_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES public.cleaning_packages(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  default_quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cleaning_package_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cleaning_package_items" ON public.cleaning_package_items FOR SELECT USING (true);
CREATE POLICY "Public insert cleaning_package_items" ON public.cleaning_package_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update cleaning_package_items" ON public.cleaning_package_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete cleaning_package_items" ON public.cleaning_package_items FOR DELETE USING (true);

CREATE TABLE public.housekeeping_orders (
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
ALTER TABLE public.housekeeping_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read housekeeping_orders" ON public.housekeeping_orders FOR SELECT USING (true);
CREATE POLICY "Public insert housekeeping_orders" ON public.housekeeping_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update housekeeping_orders" ON public.housekeeping_orders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete housekeeping_orders" ON public.housekeeping_orders FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_orders;
ALTER TABLE public.units ADD COLUMN room_type_id uuid REFERENCES public.room_types(id);
ALTER TABLE public.units ADD COLUMN status text NOT NULL DEFAULT 'ready';

ALTER TABLE public.menu_items ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';
ALTER TABLE public.menu_categories ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';

CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_name TEXT NOT NULL, device_id TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL DEFAULT 'kitchen',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ, last_login_employee_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read devices" ON public.devices FOR SELECT USING (true);
CREATE POLICY "Public insert devices" ON public.devices FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update devices" ON public.devices FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete devices" ON public.devices FOR DELETE USING (true);

ALTER TABLE public.orders
  ADD COLUMN kitchen_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN bar_status TEXT NOT NULL DEFAULT 'pending';

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
CREATE TRIGGER update_billing_config_updated_at BEFORE UPDATE ON public.billing_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.billing_config (id) VALUES (gen_random_uuid());

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
INSERT INTO public.payment_methods (name, sort_order) VALUES
  ('Cash', 1), ('Credit Card', 2), ('Debit Card', 3),
  ('Charge to Room', 4), ('Complimentary', 5),
  ('Bank Transfer', 6), ('Foreign Currency', 7);

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

ALTER TABLE public.orders ADD COLUMN guest_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN room_id UUID REFERENCES public.units(id);
ALTER TABLE public.orders ADD COLUMN tax_details JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN staff_name TEXT NOT NULL DEFAULT '';

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;

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

CREATE TABLE public.request_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, icon text NOT NULL DEFAULT '📋',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.request_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read request_categories" ON public.request_categories FOR SELECT USING (true);
CREATE POLICY "Public insert request_categories" ON public.request_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update request_categories" ON public.request_categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete request_categories" ON public.request_categories FOR DELETE USING (true);

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

CREATE TABLE public.tours_config (
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
ALTER TABLE public.tours_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tours_config" ON public.tours_config FOR SELECT USING (true);
CREATE POLICY "Public insert tours_config" ON public.tours_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update tours_config" ON public.tours_config FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete tours_config" ON public.tours_config FOR DELETE USING (true);

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

CREATE TABLE public.transport_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, price numeric NOT NULL DEFAULT 0,
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_tours;
ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_transactions;

CREATE TABLE public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read staff_roles" ON public.staff_roles FOR SELECT USING (true);
CREATE POLICY "Public insert staff_roles" ON public.staff_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update staff_roles" ON public.staff_roles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete staff_roles" ON public.staff_roles FOR DELETE USING (true);

ALTER TABLE public.room_types ADD COLUMN base_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.employee_tasks ADD COLUMN IF NOT EXISTS completion_meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.employee_tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  image_url text, link_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read task_comments" ON public.task_comments FOR SELECT USING (true);
CREATE POLICY "Public insert task_comments" ON public.task_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete task_comments" ON public.task_comments FOR DELETE USING (true);
CREATE POLICY "Public update task_comments" ON public.task_comments FOR UPDATE USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.decrement_stock(p_ingredient_id uuid, p_amount numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.ingredients SET current_stock = GREATEST(0, current_stock - p_amount) WHERE id = p_ingredient_id;
$$;

ALTER TABLE public.resort_ops_bookings ADD COLUMN IF NOT EXISTS bill_agreed_at timestamptz DEFAULT NULL;

CREATE TABLE public.bill_disputes (
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
ALTER TABLE public.bill_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bill_disputes" ON public.bill_disputes FOR SELECT TO public USING (true);
CREATE POLICY "Public insert bill_disputes" ON public.bill_disputes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update bill_disputes" ON public.bill_disputes FOR UPDATE TO public USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.bill_disputes;

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
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read webhook_events" ON public.webhook_events FOR SELECT TO public USING (true);
CREATE POLICY "Public insert webhook_events" ON public.webhook_events FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update webhook_events" ON public.webhook_events FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete webhook_events" ON public.webhook_events FOR DELETE TO public USING (true);

CREATE TABLE public.employee_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, role_key)
);
ALTER TABLE public.employee_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read employee_roles" ON public.employee_roles FOR SELECT USING (true);
CREATE POLICY "Public insert employee_roles" ON public.employee_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_roles" ON public.employee_roles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_roles" ON public.employee_roles FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_resort_ops_bookings_dates ON public.resort_ops_bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_resort_ops_bookings_unit_id ON public.resort_ops_bookings(unit_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.payroll_payments;

ALTER TABLE public.resort_ops_bookings
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;

CREATE TABLE public.it_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.it_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read it_notes" ON public.it_notes FOR SELECT TO public USING (true);
CREATE POLICY "Public insert it_notes" ON public.it_notes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update it_notes" ON public.it_notes FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete it_notes" ON public.it_notes FOR DELETE TO public USING (true);

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
ALTER TABLE public.guest_faq_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read guest FAQ memory" ON public.guest_faq_memory FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert guest FAQ memory" ON public.guest_faq_memory FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update guest FAQ memory" ON public.guest_faq_memory FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest FAQ memory" ON public.guest_faq_memory FOR DELETE TO anon, authenticated USING (true);

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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;