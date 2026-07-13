-- Add provider-specific columns for the agent settings page
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS openrouter_model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS hermes_sub_provider TEXT NOT NULL DEFAULT 'ollama';
