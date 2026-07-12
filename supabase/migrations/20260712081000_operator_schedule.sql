-- Event + schedule triggers for the resort-operator loop.
-- 1) Every 30 minutes: full operator cycle (detect, plan, verify, escalate).
-- Uses pg_cron + pg_net, both available on hosted Supabase.
-- Auth is a shared secret (x-internal-secret header), matching
-- INTERNAL_FN_SECRET on the resort-operator edge function. NOT the
-- service_role_key -- that was an earlier draft, superseded before deploy.
--
-- REQUIRED ONE-TIME SETUP (run in SQL editor after deploy):
--   select vault.create_secret('<PROJECT_URL>', 'project_url');
--   select vault.create_secret('<SAME VALUE AS EDGE FUNCTION INTERNAL_FN_SECRET>', 'internal_fn_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_resort_operator()
returns void language plpgsql security definer as $$
declare
  url text;
  secret text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'internal_fn_secret';
  if url is null or secret is null then
    raise notice 'resort-operator trigger skipped: vault secrets project_url/internal_fn_secret not set';
    return;
  end if;
  perform net.http_post(
    url := url || '/functions/v1/resort-operator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', secret
    ),
    body := '{"action":"cycle"}'::jsonb
  );
end $$;

-- Every 30 minutes, resort operating hours bias handled inside the planner.
select cron.unschedule('resort-operator-cycle')
  where exists (select 1 from cron.job where jobname = 'resort-operator-cycle');
select cron.schedule('resort-operator-cycle', '*/30 * * * *', 'select public.trigger_resort_operator()');

-- 2) Event trigger: new guest request immediately runs a cycle.
create or replace function public.on_guest_request_created()
returns trigger language plpgsql security definer as $$
begin
  perform public.trigger_resort_operator();
  return new;
end $$;

drop trigger if exists guest_request_operator_trigger on public.guest_requests;
create trigger guest_request_operator_trigger
  after insert on public.guest_requests
  for each row execute function public.on_guest_request_created();
