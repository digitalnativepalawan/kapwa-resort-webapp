
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PHP';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS ai_confidence jsonb DEFAULT null;
