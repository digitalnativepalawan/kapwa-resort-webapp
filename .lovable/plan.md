## Fix Agent Settings save error

Run one migration against `public.settings`:

1. **Add missing columns** (idempotent):
   - `openrouter_api_key TEXT DEFAULT ''`
   - `openrouter_model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini'`
   - `hermes_sub_provider TEXT NOT NULL DEFAULT 'ollama'`

2. **Check existing RLS policies** on `settings`. If no permissive UPDATE policy exists for `authenticated`, add:
   ```sql
   CREATE POLICY "Authenticated can update settings"
   ON public.settings FOR UPDATE TO authenticated
   USING (true) WITH CHECK (true);
   ```
   (Also ensure a matching SELECT policy exists so the row can be read back after save.)

3. **Verify** by reading `information_schema.columns` for the new columns and by re-testing save on `/admin/bot-settings`.

No frontend code changes — the page already references these fields.
