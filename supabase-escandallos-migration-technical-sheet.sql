-- Escandallos · Ficha técnica por receta (1:1 con escandallo_recipes)
-- Ejecutar en Supabase SQL Editor tras supabase-escandallos-schema.sql
-- Requiere: public.locals, public.escandallo_recipes, public.set_updated_at(), public.current_local_id()

-- -----------------------------------------------------------------------------
-- 1) Ficha técnica (una fila por receta)
-- -----------------------------------------------------------------------------
create table if not exists public.escandallo_recipe_technical_sheets (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  recipe_id uuid not null references public.escandallo_recipes(id) on delete cascade,
  categoria text not null default '',
  codigo_interno text not null default '',
  foto_url text,
  activa boolean not null default true,
  rendimiento_total text not null default '',
  numero_raciones numeric(12, 4),
  gramaje_por_racion_g numeric(12, 4),
  tiempo_preparacion_min int,
  tiempo_coccion_min int,
  tiempo_reposo_min int,
  temperatura_servicio text not null default '',
  emplatado_descripcion text not null default '',
  emplatado_decoracion text not null default '',
  emplatado_menaje text not null default '',
  emplatado_foto_url text,
  tipo_conservacion text not null default '',
  temperatura_conservacion text not null default '',
  vida_util text not null default '',
  regeneracion text not null default '',
  alergenos_manual text[] not null default '{}',
  notas_chef text not null default '',
  puntos_criticos text not null default '',
  errores_comunes text not null default '',
  recomendaciones text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id)
);

create index if not exists idx_escandallo_tech_sheets_local on public.escandallo_recipe_technical_sheets(local_id);
create index if not exists idx_escandallo_tech_sheets_recipe on public.escandallo_recipe_technical_sheets(recipe_id);

drop trigger if exists trg_escandallo_tech_sheets_updated_at on public.escandallo_recipe_technical_sheets;
create trigger trg_escandallo_tech_sheets_updated_at
before update on public.escandallo_recipe_technical_sheets
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Pasos de elaboración
-- -----------------------------------------------------------------------------
create table if not exists public.escandallo_recipe_technical_sheet_steps (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  technical_sheet_id uuid not null references public.escandallo_recipe_technical_sheets(id) on delete cascade,
  orden int not null default 0,
  titulo text,
  descripcion text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_escandallo_tech_steps_sheet on public.escandallo_recipe_technical_sheet_steps(technical_sheet_id);
create index if not exists idx_escandallo_tech_steps_local on public.escandallo_recipe_technical_sheet_steps(local_id);

-- -----------------------------------------------------------------------------
-- 3) RLS
-- -----------------------------------------------------------------------------
alter table public.escandallo_recipe_technical_sheets enable row level security;
alter table public.escandallo_recipe_technical_sheet_steps enable row level security;

drop policy if exists "escandallo_tech_sheets same local read" on public.escandallo_recipe_technical_sheets;
create policy "escandallo_tech_sheets same local read"
on public.escandallo_recipe_technical_sheets
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "escandallo_tech_sheets same local write" on public.escandallo_recipe_technical_sheets;
create policy "escandallo_tech_sheets same local write"
on public.escandallo_recipe_technical_sheets
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "escandallo_tech_steps same local read" on public.escandallo_recipe_technical_sheet_steps;
create policy "escandallo_tech_steps same local read"
on public.escandallo_recipe_technical_sheet_steps
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "escandallo_tech_steps same local write" on public.escandallo_recipe_technical_sheet_steps;
create policy "escandallo_tech_steps same local write"
on public.escandallo_recipe_technical_sheet_steps
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
