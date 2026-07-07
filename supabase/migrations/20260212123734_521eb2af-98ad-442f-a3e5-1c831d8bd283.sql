
-- Create resort_profile table (single-row config)
CREATE TABLE public.resort_profile (
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
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.resort_profile ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read resort_profile"
  ON public.resort_profile FOR SELECT
  USING (true);

-- Public update
CREATE POLICY "Public update resort_profile"
  ON public.resort_profile FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Public insert
CREATE POLICY "Public insert resort_profile"
  ON public.resort_profile FOR INSERT
  WITH CHECK (true);

-- Seed one empty row so upsert works
INSERT INTO public.resort_profile (resort_name) VALUES ('');

-- Create logos storage bucket (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

-- Storage policies for logos bucket
CREATE POLICY "Public read logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "Public upload logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos');

CREATE POLICY "Public update logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos')
  WITH CHECK (bucket_id = 'logos');

CREATE POLICY "Public delete logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'logos');
