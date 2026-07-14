-- ============================================================================
-- KAPWA tenants: one row per sold property (webshop order -> this table).
-- Each tenant maps to its own Supabase project per the pilot plan scope
-- (one property, one customer-controlled Supabase project).
-- ============================================================================
create type public.tenant_status as enum (
  'provisioning',   -- order approved, awaiting Mission Control Setup
  'active',         -- project scaffolded + agent runtime enabled
  'suspended',
  'cancelled'
);

create table public.kapwa_tenants (
  id            uuid primary key default gen_random_uuid(),
  property_name text not null default '',
  contact_email text not null,
  order_ref     text not null,                 -- webshop orders.order_ref bridge
  status        public.tenant_status not null default 'provisioning',
  supabase_project_ref text,                   -- filled during Mission Control Setup
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (order_ref)
);

alter table public.kapwa_tenants enable row level security;

-- Tenants are backend/provisioning data. No anon/authenticated read/write:
-- all access is via the service-role (Mission Control Setup) only.
create policy "tenants: service role only"
  on public.kapwa_tenants for all
  using (false) with check (false);

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger kapwa_tenants_touch before update on public.kapwa_tenants
  for each row execute function public.touch_updated_at();
