
-- Add origin/destination columns to transport_rates, migrate existing type data to origin
ALTER TABLE public.transport_rates ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'San Vicente';
ALTER TABLE public.transport_rates ADD COLUMN IF NOT EXISTS destination text NOT NULL DEFAULT '';

-- Migrate existing data: copy type to destination
UPDATE public.transport_rates SET destination = type WHERE destination = '';
