-- =============================================================================
-- Billing core: suscripciones por local (fuente real de plan)
-- Compatibilidad temporal dev: si no hay suscripción activa, frontend puede
-- aplicar fallback PRO para no bloquear locales actuales en pruebas.
-- =============================================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  plan_code text not null default 'OPERATIVO',
  provider text not null default 'manual',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz null
);

alter table public.subscriptions
  add column if not exists plan_code text;

alter table public.subscriptions
  add column if not exists updated_at timestamptz not null default now();

alter table public.subscriptions
  add column if not exists expires_at timestamptz null;

-- Compatibilidad con versión previa: si existía columna `plan`, migrarla a `plan_code`.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subscriptions'
      and column_name = 'plan'
  ) then
    execute $sql$
      update public.subscriptions
      set plan_code = coalesce(plan_code, plan::text)
      where plan_code is null
    $sql$;
  end if;
end $$;

update public.subscriptions
set plan_code = 'OPERATIVO'
where plan_code is null
   or plan_code not in ('OPERATIVO', 'CONTROL', 'PRO');

update public.subscriptions
set provider = 'external'
where provider = 'stripe';

update public.subscriptions
set provider = 'manual'
where provider is null
   or provider not in ('manual', 'apple', 'google', 'external');

update public.subscriptions
set status = 'inactive'
where status is null
   or status not in ('active', 'inactive', 'canceled');

alter table public.subscriptions
  alter column plan_code set not null,
  alter column provider set not null,
  alter column status set not null,
  alter column updated_at set not null;

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_code_check;
alter table public.subscriptions
  add constraint subscriptions_plan_code_check check (plan_code in ('OPERATIVO', 'CONTROL', 'PRO'));

alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('manual', 'apple', 'google', 'external'));

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check check (status in ('active', 'inactive', 'canceled'));

create index if not exists idx_subscriptions_local_status_updated
  on public.subscriptions (local_id, status, updated_at desc, created_at desc);

-- Regla: una única suscripción activa por local.
with ranked as (
  select
    id,
    row_number() over (partition by local_id order by updated_at desc, created_at desc, id desc) as rn
  from public.subscriptions
  where status = 'active'
)
update public.subscriptions s
set status = 'inactive',
    updated_at = now()
from ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists ux_subscriptions_one_active_per_local
  on public.subscriptions (local_id)
  where status = 'active';

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute procedure public.set_updated_at();
