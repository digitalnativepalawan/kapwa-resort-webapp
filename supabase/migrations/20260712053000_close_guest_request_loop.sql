alter table public.guest_requests
  add column if not exists routed_group text,
  add column if not exists assigned_to text,
  add column if not exists assigned_at timestamptz,
  add column if not exists completed_by text,
  add column if not exists completed_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_message_id bigint,
  add column if not exists resolution_notes text not null default '';

create index if not exists guest_requests_status_created_idx
  on public.guest_requests(status, created_at);

create index if not exists guest_requests_routed_group_idx
  on public.guest_requests(routed_group, status);

comment on column public.guest_requests.routed_group is 'Telegram department group selected by concierge routing.';
comment on column public.guest_requests.assigned_to is 'Telegram staff identity that accepted the request.';
comment on column public.guest_requests.telegram_message_id is 'Telegram message used for accept/complete callbacks.';
