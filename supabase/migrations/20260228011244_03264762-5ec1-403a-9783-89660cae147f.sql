
-- App options table for dynamic pill/chip options
CREATE TABLE public.app_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read app_options" ON public.app_options FOR SELECT USING (true);
CREATE POLICY "Public insert app_options" ON public.app_options FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update app_options" ON public.app_options FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete app_options" ON public.app_options FOR DELETE USING (true);

-- Guest vibe records
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

-- Vibe updates history
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

-- Interventions log
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
