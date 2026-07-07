-- TALA Voice Agent: guest memory + FAQ tables
-- Run with: supabase db push  (or paste into Supabase SQL editor)
-- Project: paghxagqnaisxesmhnwj (KAPWA OS)

-- ── Guest memory ──────────────────────────────────────────────────────────
-- One row per guest, keyed to resort_ops_guests.id.
-- Free-form preference fields kept as jsonb/text arrays so the agent can
-- grow the schema of "preferences" without new migrations every time.
create table if not exists public.guest_memory (
  id                  uuid primary key default gen_random_uuid(),
  guest_id            uuid references public.resort_ops_guests(id) on delete cascade,
  -- fallback identity match when guest_id isn't known yet (e.g. mid-call,
  -- before front desk has linked a booking) — match on normalized name/phone
  guest_name_fallback text,
  phone_fallback       text,

  preferred_name      text,            -- "what they like to be called"
  dietary_restrictions text[] default '{}',
  allergies           text[] default '{}',
  birthday            date,
  language_preference text default 'en', -- 'en' | 'tl' | 'taglish'

  favorite_activities text[] default '{}',
  favorite_foods      text[] default '{}',
  notes               text,            -- free-text running summary, agent-maintained

  visit_count         integer default 0,
  last_stay_unit_id   uuid references public.resort_ops_units(id),
  last_seen_at        timestamptz,

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists idx_guest_memory_guest_id on public.guest_memory(guest_id);
create index if not exists idx_guest_memory_phone on public.guest_memory(phone_fallback);

alter table public.guest_memory enable row level security;

-- Service role (used by the LiveKit agent backend) has full access.
-- No public/anon access — guest memory is staff/agent-only.
create policy "service role full access to guest_memory"
  on public.guest_memory
  for all
  to service_role
  using (true)
  with check (true);

-- ── Conversation log ──────────────────────────────────────────────────────
-- Raw turn-by-turn log per voice session, separate from hermes_conversations
-- (which is a different existing system) to avoid collision.
create table if not exists public.tala_conversations (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null,
  guest_id      uuid references public.resort_ops_guests(id) on delete set null,
  room_unit     text,
  transcript    jsonb not null default '[]'::jsonb, -- [{role, text, ts, audio_ms}]
  tool_calls    jsonb default '[]'::jsonb,            -- [{tool, args, result, ok, retries}]
  escalated     boolean default false,
  escalation_reason text,
  started_at    timestamptz default now(),
  ended_at      timestamptz
);

create index if not exists idx_tala_conv_session on public.tala_conversations(session_id);
create index if not exists idx_tala_conv_guest on public.tala_conversations(guest_id);

alter table public.tala_conversations enable row level security;

create policy "service role full access to tala_conversations"
  on public.tala_conversations
  for all
  to service_role
  using (true)
  with check (true);

-- ── FAQ entries ───────────────────────────────────────────────────────────
-- Static, staff-curated answers. TALA must answer ONLY from this table for
-- faq_lookup() — never invent resort facts. Empty result -> "I'll check
-- that for you po."
create table if not exists public.faq_entries (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  answer      text not null,
  category    text default 'general', -- general | dining | activities | policies | transport
  keywords    text[] default '{}',     -- for simple keyword matching fallback
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_faq_keywords on public.faq_entries using gin(keywords);

alter table public.faq_entries enable row level security;

create policy "service role full access to faq_entries"
  on public.faq_entries
  for all
  to service_role
  using (true)
  with check (true);

-- anon/staff can read active FAQs (harmless, no PII)
create policy "anyone can read active faq_entries"
  on public.faq_entries
  for select
  to anon, authenticated
  using (active = true);

-- Seed a few starter FAQs so faq_lookup() isn't empty on day one.
insert into public.faq_entries (question, answer, category, keywords) values
  ('What time is breakfast?', 'Breakfast is served daily from 7:00 AM to 10:00 AM po, at the main dining area.', 'dining', array['breakfast','dining time','meal time']),
  ('What time is check-out?', 'Check-out time is 11:00 AM po. Late check-out may be available — I can check with reception for you.', 'policies', array['checkout','check out time']),
  ('Is there wifi?', 'Yes po, free wifi is available throughout the resort. The password is posted in your room.', 'general', array['wifi','internet']),
  ('Do you have airport transfers?', 'Yes po, we can arrange airport transfers. I''ll connect you with our transport team for the schedule and rate.', 'transport', array['airport','transfer','pickup'])
on conflict do nothing;
