CREATE TABLE public.guest_payment_settings (
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

GRANT SELECT ON public.guest_payment_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_payment_settings TO authenticated;
GRANT ALL ON public.guest_payment_settings TO service_role;

ALTER TABLE public.guest_payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment settings readable" ON public.guest_payment_settings FOR SELECT USING (true);
CREATE POLICY "payment settings insert" ON public.guest_payment_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "payment settings update" ON public.guest_payment_settings FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER update_guest_payment_settings_updated_at
BEFORE UPDATE ON public.guest_payment_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.guest_payment_settings (payment_instructions)
VALUES ('Please review your bill, agree to all charges, then pay using one of the methods below and upload your proof of payment. Reception will verify before check-out.');

CREATE TABLE public.guest_payment_submissions (
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

GRANT SELECT, INSERT ON public.guest_payment_submissions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_payment_submissions TO authenticated;
GRANT ALL ON public.guest_payment_submissions TO service_role;

ALTER TABLE public.guest_payment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment submissions readable" ON public.guest_payment_submissions FOR SELECT USING (true);
CREATE POLICY "payment submissions insert" ON public.guest_payment_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "payment submissions update" ON public.guest_payment_submissions FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER update_guest_payment_submissions_updated_at
BEFORE UPDATE ON public.guest_payment_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX guest_payment_submissions_booking_idx ON public.guest_payment_submissions(booking_id);
CREATE INDEX guest_payment_submissions_status_idx ON public.guest_payment_submissions(status);