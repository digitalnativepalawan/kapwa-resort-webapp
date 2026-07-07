
-- Allow inserting into settings
CREATE POLICY "Public insert settings"
ON public.settings FOR INSERT
WITH CHECK (true);
