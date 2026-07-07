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