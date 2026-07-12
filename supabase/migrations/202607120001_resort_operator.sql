create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null default 'resort_operator',
  trigger_type text not null default 'manual',
  requested_by text,
  prompt text,
  status text not null default 'completed' check (status in ('running','completed','failed')),
  summary text,
  model_provider text,
  model_name text,
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete cascade,
  action_type text not null,
  title text not null,
  description text,
  target_table text,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  approval_required boolean not null default true,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','executed','failed')),
  approved_by text,
  approved_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_runs_started_at_idx on public.agent_runs(started_at desc);
create index if not exists agent_actions_status_idx on public.agent_actions(status, created_at desc);
create index if not exists agent_actions_run_id_idx on public.agent_actions(run_id);

alter table public.agent_runs enable row level security;
alter table public.agent_actions enable row level security;

create policy "authenticated staff can read agent runs" on public.agent_runs
for select to authenticated using (true);
create policy "authenticated staff can create agent runs" on public.agent_runs
for insert to authenticated with check (true);

create policy "authenticated staff can read agent actions" on public.agent_actions
for select to authenticated using (true);
create policy "authenticated staff can create agent actions" on public.agent_actions
for insert to authenticated with check (true);
create policy "authenticated staff can update agent actions" on public.agent_actions
for update to authenticated using (true) with check (true);

comment on table public.agent_runs is 'Auditable executions of KAPWA AI agents.';
comment on table public.agent_actions is 'Controlled action proposals produced by agents and approved by staff.';
