-- =============================================================================
-- Sistema de planes por local
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'subscription_plan'
  ) then
    create type public.subscription_plan as enum ('OPERATIVO', 'CONTROL', 'PRO');
  end if;
end $$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  plan public.subscription_plan not null default 'OPERATIVO',
  provider text not null default 'manual' check (provider in ('stripe', 'apple', 'google', 'manual')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  max_users integer not null default 5 check (max_users > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_local_status_created
  on public.subscriptions (local_id, status, created_at desc);

alter table if exists public.users
  add column if not exists role text check (role in ('admin', 'manager', 'staff'));
