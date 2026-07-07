
CREATE TABLE public.bill_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  room_id uuid,
  unit_name text NOT NULL DEFAULT '',
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
