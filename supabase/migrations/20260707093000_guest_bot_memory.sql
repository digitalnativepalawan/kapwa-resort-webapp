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

ALTER TABLE public.guest_faq_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read guest FAQ memory" ON public.guest_faq_memory;
CREATE POLICY "Public read guest FAQ memory"
  ON public.guest_faq_memory
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public insert guest FAQ memory" ON public.guest_faq_memory;
CREATE POLICY "Public insert guest FAQ memory"
  ON public.guest_faq_memory
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public update guest FAQ memory" ON public.guest_faq_memory;
CREATE POLICY "Public update guest FAQ memory"
  ON public.guest_faq_memory
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete guest FAQ memory" ON public.guest_faq_memory;
CREATE POLICY "Public delete guest FAQ memory"
  ON public.guest_faq_memory
  FOR DELETE
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public update settings" ON public.settings;
CREATE POLICY "Public update settings"
  ON public.settings
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

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
