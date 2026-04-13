-- APPCC: registro diario de temperaturas (neveras / congeladores, cocina y barra)
-- Requiere: public.locals, public.profiles, public.current_local_id(), public.set_updated_at()
-- Ejecutar en Supabase → SQL Editor

-- -----------------------------------------------------------------------------
-- Equipos de frío por local
-- -----------------------------------------------------------------------------
create table if not exists public.appcc_cold_units (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  zone text not null check (zone in ('cocina', 'barra')),
  unit_type text not null check (unit_type in ('nevera', 'congelador')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  temp_min_c numeric(5,2),
  temp_max_c numeric(5,2),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, name)
);

create index if not exists idx_appcc_cold_units_local_id on public.appcc_cold_units(local_id);

drop trigger if exists trg_appcc_cold_units_updated_at on public.appcc_cold_units;
create trigger trg_appcc_cold_units_updated_at
before update on public.appcc_cold_units
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Lecturas: una fila por equipo, día civil (Europe/Madrid en la app) y turno
-- Turnos en BD: manana | tarde | noche (tarde por lecturas antiguas). La app registra solo mañana y noche.
-- -----------------------------------------------------------------------------
create table if not exists public.appcc_temperature_readings (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  cold_unit_id uuid not null references public.appcc_cold_units(id) on delete cascade,
  reading_date date not null,
  slot text not null check (slot in ('manana', 'tarde', 'noche')),
  temperature_c numeric(5,2) not null,
  notes text not null default '',
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, cold_unit_id, reading_date, slot)
);

create index if not exists idx_appcc_readings_local_date on public.appcc_temperature_readings(local_id, reading_date desc);
create index if not exists idx_appcc_readings_cold_unit_id on public.appcc_temperature_readings(cold_unit_id);

create or replace function public.appcc_readings_same_local()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.appcc_cold_units c
    where c.id = new.cold_unit_id and c.local_id = new.local_id
  ) then
    raise exception 'cold_unit_id no pertenece al local indicado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appcc_readings_same_local on public.appcc_temperature_readings;
create trigger trg_appcc_readings_same_local
before insert or update on public.appcc_temperature_readings
for each row execute function public.appcc_readings_same_local();

drop trigger if exists trg_appcc_readings_updated_at on public.appcc_temperature_readings;
create trigger trg_appcc_readings_updated_at
before update on public.appcc_temperature_readings
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS (mismo patrón que pedidos / mermas)
-- -----------------------------------------------------------------------------
alter table public.appcc_cold_units enable row level security;
alter table public.appcc_temperature_readings enable row level security;

drop policy if exists "appcc cold units same local read" on public.appcc_cold_units;
create policy "appcc cold units same local read"
on public.appcc_cold_units
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "appcc cold units same local write" on public.appcc_cold_units;
create policy "appcc cold units same local write"
on public.appcc_cold_units
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "appcc readings same local read" on public.appcc_temperature_readings;
create policy "appcc readings same local read"
on public.appcc_temperature_readings
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "appcc readings same local write" on public.appcc_temperature_readings;
create policy "appcc readings same local write"
on public.appcc_temperature_readings
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
