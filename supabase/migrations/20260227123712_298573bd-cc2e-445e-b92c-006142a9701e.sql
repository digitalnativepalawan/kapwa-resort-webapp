
-- 1. Employee permissions table
CREATE TABLE public.employee_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (employee_id, permission)
);

ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read employee_permissions" ON public.employee_permissions FOR SELECT USING (true);
CREATE POLICY "Public insert employee_permissions" ON public.employee_permissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update employee_permissions" ON public.employee_permissions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete employee_permissions" ON public.employee_permissions FOR DELETE USING (true);

-- 2. Guest documents table
CREATE TABLE public.guest_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_id uuid NOT NULL REFERENCES public.resort_ops_guests(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'passport',
  image_url text NOT NULL,
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read guest_documents" ON public.guest_documents FOR SELECT USING (true);
CREATE POLICY "Public insert guest_documents" ON public.guest_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_documents" ON public.guest_documents FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_documents" ON public.guest_documents FOR DELETE USING (true);

-- 3. Guest notes table
CREATE TABLE public.guest_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid REFERENCES public.resort_ops_bookings(id) ON DELETE SET NULL,
  unit_name text NOT NULL DEFAULT '',
  note_type text NOT NULL DEFAULT 'general',
  content text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read guest_notes" ON public.guest_notes FOR SELECT USING (true);
CREATE POLICY "Public insert guest_notes" ON public.guest_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_notes" ON public.guest_notes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_notes" ON public.guest_notes FOR DELETE USING (true);

-- 4. Guest tours table
CREATE TABLE public.guest_tours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid REFERENCES public.resort_ops_bookings(id) ON DELETE SET NULL,
  tour_name text NOT NULL DEFAULT '',
  tour_date date NOT NULL DEFAULT CURRENT_DATE,
  pax integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'booked',
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read guest_tours" ON public.guest_tours FOR SELECT USING (true);
CREATE POLICY "Public insert guest_tours" ON public.guest_tours FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update guest_tours" ON public.guest_tours FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete guest_tours" ON public.guest_tours FOR DELETE USING (true);

-- 5. Storage bucket for guest documents
INSERT INTO storage.buckets (id, name, public) VALUES ('guest-documents', 'guest-documents', true);

CREATE POLICY "Public read guest-documents" ON storage.objects FOR SELECT USING (bucket_id = 'guest-documents');
CREATE POLICY "Public insert guest-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'guest-documents');
CREATE POLICY "Public delete guest-documents" ON storage.objects FOR DELETE USING (bucket_id = 'guest-documents');
