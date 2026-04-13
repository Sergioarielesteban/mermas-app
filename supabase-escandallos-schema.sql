-- Escandallos (recetas + ingredientes) por local — ejecutar en Supabase SQL Editor
-- Requiere: public.locals, public.products, public.set_updated_at(), public.current_local_id()

create table if not exists public.escandallo_recipes (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  notes text not null default '',
  yield_qty numeric(10,2) not null default 1 check (yield_qty > 0),
  yield_label text not null default 'raciones',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, name)
);

create index if not exists idx_escandallo_recipes_local_id on public.escandallo_recipes(local_id);

create table if not exists public.escandallo_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  recipe_id uuid not null references public.escandallo_recipes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  label text not null,
  qty numeric(12,4) not null check (qty > 0),
  unit text not null check (unit in ('kg', 'ud', 'bolsa', 'racion')),
  manual_price_per_unit numeric(12,4),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_escandallo_lines_local_id on public.escandallo_recipe_lines(local_id);
create index if not exists idx_escandallo_lines_recipe_id on public.escandallo_recipe_lines(recipe_id);

drop trigger if exists trg_escandallo_recipes_updated_at on public.escandallo_recipes;
create trigger trg_escandallo_recipes_updated_at
before update on public.escandallo_recipes
for each row execute procedure public.set_updated_at();

alter table public.escandallo_recipes enable row level security;
alter table public.escandallo_recipe_lines enable row level security;

drop policy if exists "escandallo_recipes same local read" on public.escandallo_recipes;
create policy "escandallo_recipes same local read"
on public.escandallo_recipes
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "escandallo_recipes same local write" on public.escandallo_recipes;
create policy "escandallo_recipes same local write"
on public.escandallo_recipes
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "escandallo_lines same local read" on public.escandallo_recipe_lines;
create policy "escandallo_lines same local read"
on public.escandallo_recipe_lines
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "escandallo_lines same local write" on public.escandallo_recipe_lines;
create policy "escandallo_lines same local write"
on public.escandallo_recipe_lines
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
