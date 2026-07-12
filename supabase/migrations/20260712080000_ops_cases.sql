-- Shared operational case model for the resort operator agent.
-- One case = one tracked problem from detection to verified resolution.
-- Designed against two dissimilar domains first: guest_request and unpaid_balance.

create table if not exists public.ops_cases (
  id uuid primary key default gen_random_uuid(),
  domain text not null,                          -- 'guest_request' | 'unpaid_balance' | future domains
  issue_type text not null default '',           -- e.g. 'towels', 'departure_unpaid'
  source_table text not null default '',         -- table the case was detected from
  source_id uuid,                                -- row in that table
  booking_id uuid references public.resort_ops_bookings(id),
  guest_name text not null default '',
  unit_label text not null default '',
  department text not null default '',           -- routed department / telegram group key
  priority text not null default 'medium',       -- low | medium | high | urgent
  risk text not null default '',                 -- short human description of what is at stake
  status text not null default 'open',           -- open | assigned | in_progress | pending_approval | resolved | escalated | closed
  owner text not null default '',                -- staff identity if assigned
  due_at timestamptz,
  required_action text not null default '',
  approval_required boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  verification_rule text not null default '',    -- machine-readable rule key the verifier evaluates
  verified boolean not null default false,
  verified_at timestamptz,
  retry_count integer not null default 0,
  escalation_level integer not null default 0,
  resolution_evidence jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,    -- append-only [{at, event, detail}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

-- One open case per source record: dedupe guard the planner relies on.
create unique index if not exists ops_cases_open_source_uidx
  on public.ops_cases(domain, source_table, source_id)
  where status not in ('resolved', 'closed');

create index if not exists ops_cases_status_idx on public.ops_cases(status, priority);
create index if not exists ops_cases_domain_idx on public.ops_cases(domain, status);
create index if not exists ops_cases_due_idx on public.ops_cases(due_at) where status not in ('resolved','closed');

alter table public.ops_cases enable row level security;
create policy "Public read ops_cases" on public.ops_cases for select using (true);
create policy "Public insert ops_cases" on public.ops_cases for insert with check (true);
create policy "Public update ops_cases" on public.ops_cases for update using (true) with check (true);

create or replace function public.ops_cases_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ops_cases_touch on public.ops_cases;
create trigger ops_cases_touch before update on public.ops_cases
  for each row execute function public.ops_cases_touch_updated_at();

comment on table public.ops_cases is 'Central operational case ledger used by the resort-operator agent runtime.';
