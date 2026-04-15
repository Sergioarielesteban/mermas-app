-- APPCC limpieza: cronograma semanal (qué tareas y/o equipos frío tocan cada día de la semana)
-- Requiere: appcc_cleaning_tasks, appcc_cold_units, public.set_updated_at()
-- Ejecutar en Supabase → SQL Editor

create table if not exists public.appcc_cleaning_weekday_items (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  weekday smallint not null check (weekday >= 0 and weekday <= 6),
  task_id uuid references public.appcc_cleaning_tasks(id) on delete cascade,
  cold_unit_id uuid references public.appcc_cold_units(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appcc_cleaning_weekday_items_one_target check (
    (task_id is not null and cold_unit_id is null)
    or (task_id is null and cold_unit_id is not null)
  )
);

create unique index if not exists idx_appcc_cleaning_weekday_task_unique
  on public.appcc_cleaning_weekday_items (local_id, weekday, task_id)
  where task_id is not null;

create unique index if not exists idx_appcc_cleaning_weekday_cold_unique
  on public.appcc_cleaning_weekday_items (local_id, weekday, cold_unit_id)
  where cold_unit_id is not null;

create index if not exists idx_appcc_cleaning_weekday_local_day
  on public.appcc_cleaning_weekday_items (local_id, weekday, sort_order);

create or replace function public.appcc_cleaning_weekday_items_same_local()
returns trigger
language plpgsql
as $$
begin
  if new.task_id is not null then
    if not exists (
      select 1 from public.appcc_cleaning_tasks t
      where t.id = new.task_id and t.local_id = new.local_id
    ) then
      raise exception 'task_id no pertenece al local indicado';
    end if;
  end if;
  if new.cold_unit_id is not null then
    if not exists (
      select 1 from public.appcc_cold_units c
      where c.id = new.cold_unit_id and c.local_id = new.local_id
    ) then
      raise exception 'cold_unit_id no pertenece al local indicado';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appcc_cleaning_weekday_same_local on public.appcc_cleaning_weekday_items;
create trigger trg_appcc_cleaning_weekday_same_local
before insert or update on public.appcc_cleaning_weekday_items
for each row execute function public.appcc_cleaning_weekday_items_same_local();

drop trigger if exists trg_appcc_cleaning_weekday_updated_at on public.appcc_cleaning_weekday_items;
create trigger trg_appcc_cleaning_weekday_updated_at
before update on public.appcc_cleaning_weekday_items
for each row execute procedure public.set_updated_at();

alter table public.appcc_cleaning_weekday_items enable row level security;

drop policy if exists "appcc cleaning weekday items same local read" on public.appcc_cleaning_weekday_items;
create policy "appcc cleaning weekday items same local read"
on public.appcc_cleaning_weekday_items for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "appcc cleaning weekday items same local write" on public.appcc_cleaning_weekday_items;
create policy "appcc cleaning weekday items same local write"
on public.appcc_cleaning_weekday_items for all to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

comment on table public.appcc_cleaning_weekday_items is 'APPCC limpieza: ítems programados por día de semana (0=domingo … 6=sábado, como JS Date.getDay)';
