
-- Create expenses table
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft',
  image_url text,
  pdf_url text,
  vendor text,
  expense_date date,
  amount numeric DEFAULT 0,
  vat_type text DEFAULT 'vatable',
  tin text,
  tax_amount numeric DEFAULT 0,
  category text,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  pay_period_start date,
  pay_period_end date,
  deleted_at timestamptz
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read expenses" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "Public insert expenses" ON public.expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update expenses" ON public.expenses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete expenses" ON public.expenses FOR DELETE USING (true);

-- Create expense_history table
CREATE TABLE public.expense_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  action text NOT NULL,
  user_name text,
  field text,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read expense_history" ON public.expense_history FOR SELECT USING (true);
CREATE POLICY "Public insert expense_history" ON public.expense_history FOR INSERT WITH CHECK (true);

-- Create receipts storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true);

-- Storage policies for receipts bucket
CREATE POLICY "Public read receipts" ON storage.objects FOR SELECT USING (bucket_id = 'receipts');
CREATE POLICY "Public upload receipts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "Public update receipts" ON storage.objects FOR UPDATE USING (bucket_id = 'receipts') WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "Public delete receipts" ON storage.objects FOR DELETE USING (bucket_id = 'receipts');
