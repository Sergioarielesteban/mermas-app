-- APPCC: programa de limpieza (categorías, tareas con método, registros por día y turno)
-- Requiere: public.locals, public.current_local_id(), public.set_updated_at()
-- Ejecutar en Supabase → SQL Editor

-- -----------------------------------------------------------------------------
-- Categorías (Maquinaria, Superficies, Cubos de basura, etc.)
-- -----------------------------------------------------------------------------
create table if not exists public.appcc_cleaning_categories (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, name)
);

create index if not exists idx_appcc_cleaning_cat_local on public.appcc_cleaning_categories(local_id);

drop trigger if exists trg_appcc_cleaning_cat_updated_at on public.appcc_cleaning_categories;
create trigger trg_appcc_cleaning_cat_updated_at
before update on public.appcc_cleaning_categories
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tareas / puntos de limpieza dentro de cada categoría
-- -----------------------------------------------------------------------------
create table if not exists public.appcc_cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  category_id uuid not null references public.appcc_cleaning_categories(id) on delete cascade,
  title text not null,
  instructions text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_appcc_cleaning_tasks_local on public.appcc_cleaning_tasks(local_id);
create index if not exists idx_appcc_cleaning_tasks_category on public.appcc_cleaning_tasks(category_id);

create or replace function public.appcc_cleaning_tasks_same_local()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.appcc_cleaning_categories c
    where c.id = new.category_id and c.local_id = new.local_id
  ) then
    raise exception 'category_id no pertenece al local indicado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appcc_cleaning_tasks_same_local on public.appcc_cleaning_tasks;
create trigger trg_appcc_cleaning_tasks_same_local
before insert or update on public.appcc_cleaning_tasks
for each row execute function public.appcc_cleaning_tasks_same_local();

drop trigger if exists trg_appcc_cleaning_tasks_updated_at on public.appcc_cleaning_tasks;
create trigger trg_appcc_cleaning_tasks_updated_at
before update on public.appcc_cleaning_tasks
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Registros: una fila por tarea, día y turno (mañana / noche, como temperaturas)
-- -----------------------------------------------------------------------------
create table if not exists public.appcc_cleaning_logs (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  task_id uuid not null references public.appcc_cleaning_tasks(id) on delete cascade,
  log_date date not null,
  slot text not null check (slot in ('manana', 'noche')),
  operator_name text not null default '',
  notes text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, log_date, slot)
);

create index if not exists idx_appcc_cleaning_logs_local_date on public.appcc_cleaning_logs(local_id, log_date desc);
create index if not exists idx_appcc_cleaning_logs_task on public.appcc_cleaning_logs(task_id);

create or replace function public.appcc_cleaning_logs_same_local()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.appcc_cleaning_tasks t
    where t.id = new.task_id and t.local_id = new.local_id
  ) then
    raise exception 'task_id no pertenece al local indicado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appcc_cleaning_logs_same_local on public.appcc_cleaning_logs;
create trigger trg_appcc_cleaning_logs_same_local
before insert or update on public.appcc_cleaning_logs
for each row execute function public.appcc_cleaning_logs_same_local();

drop trigger if exists trg_appcc_cleaning_logs_updated_at on public.appcc_cleaning_logs;
create trigger trg_appcc_cleaning_logs_updated_at
before update on public.appcc_cleaning_logs
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.appcc_cleaning_categories enable row level security;
alter table public.appcc_cleaning_tasks enable row level security;
alter table public.appcc_cleaning_logs enable row level security;

drop policy if exists "appcc cleaning categories same local read" on public.appcc_cleaning_categories;
create policy "appcc cleaning categories same local read"
on public.appcc_cleaning_categories for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "appcc cleaning categories same local write" on public.appcc_cleaning_categories;
create policy "appcc cleaning categories same local write"
on public.appcc_cleaning_categories for all to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "appcc cleaning tasks same local read" on public.appcc_cleaning_tasks;
create policy "appcc cleaning tasks same local read"
on public.appcc_cleaning_tasks for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "appcc cleaning tasks same local write" on public.appcc_cleaning_tasks;
create policy "appcc cleaning tasks same local write"
on public.appcc_cleaning_tasks for all to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "appcc cleaning logs same local read" on public.appcc_cleaning_logs;
create policy "appcc cleaning logs same local read"
on public.appcc_cleaning_logs for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "appcc cleaning logs same local write" on public.appcc_cleaning_logs;
create policy "appcc cleaning logs same local write"
on public.appcc_cleaning_logs for all to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

comment on table public.appcc_cleaning_categories is 'APPCC limpieza: grupos (maquinaria, superficies, etc.)';
comment on table public.appcc_cleaning_tasks is 'APPCC limpieza: punto concreto y texto de cómo limpiar';
comment on table public.appcc_cleaning_logs is 'APPCC limpieza: constancia por día y turno mañana/noche';
