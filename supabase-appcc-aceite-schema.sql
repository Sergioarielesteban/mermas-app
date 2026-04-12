-- APPCC: freidoras + registro de filtrado y cambio de aceite
-- Requiere: public.locals, public.profiles, public.current_local_id(), public.set_updated_at()
-- Ejecutar en Supabase → SQL Editor

create table if not exists public.appcc_fryers (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  zone text not null check (zone in ('cocina', 'barra')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, name)
);

create index if not exists idx_appcc_fryers_local_id on public.appcc_fryers(local_id);

drop trigger if exists trg_appcc_fryers_updated_at on public.appcc_fryers;
create trigger trg_appcc_fryers_updated_at
before update on public.appcc_fryers
for each row execute procedure public.set_updated_at();

create table if not exists public.appcc_oil_events (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  fryer_id uuid not null references public.appcc_fryers(id) on delete cascade,
  event_type text not null check (event_type in ('cambio', 'filtrado')),
  event_date date not null,
  liters_used numeric(8,2),
  notes text not null default '',
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appcc_oil_events_cambio_liters_chk
    check (event_type <> 'cambio' or (liters_used is not null and liters_used >= 0)),
  constraint appcc_oil_events_liters_nonneg_chk
    check (liters_used is null or liters_used >= 0)
);

create index if not exists idx_appcc_oil_events_local_date on public.appcc_oil_events(local_id, event_date desc);
create index if not exists idx_appcc_oil_events_fryer_id on public.appcc_oil_events(fryer_id);

-- Cambio: litros obligatorios (check cambio_liters_chk). Filtrado: litros opcionales; si van, >= 0 (liters_nonneg_chk).

create or replace function public.appcc_oil_events_same_local()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.appcc_fryers f
    where f.id = new.fryer_id and f.local_id = new.local_id
  ) then
    raise exception 'fryer_id no pertenece al local indicado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appcc_oil_events_same_local on public.appcc_oil_events;
create trigger trg_appcc_oil_events_same_local
before insert or update on public.appcc_oil_events
for each row execute function public.appcc_oil_events_same_local();

drop trigger if exists trg_appcc_oil_events_updated_at on public.appcc_oil_events;
create trigger trg_appcc_oil_events_updated_at
before update on public.appcc_oil_events
for each row execute procedure public.set_updated_at();

alter table public.appcc_fryers enable row level security;
alter table public.appcc_oil_events enable row level security;

drop policy if exists "appcc fryers same local read" on public.appcc_fryers;
create policy "appcc fryers same local read"
on public.appcc_fryers for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "appcc fryers same local write" on public.appcc_fryers;
create policy "appcc fryers same local write"
on public.appcc_fryers for all to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "appcc oil events same local read" on public.appcc_oil_events;
create policy "appcc oil events same local read"
on public.appcc_oil_events for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "appcc oil events same local write" on public.appcc_oil_events;
create policy "appcc oil events same local write"
on public.appcc_oil_events for all to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- Migración en proyectos ya desplegados: supabase-appcc-aceite-migration-filtrado-litros.sql
