-- Escandallos por local (crudo + elaborado + manual) — ejecutar en Supabase SQL Editor
-- Requiere: public.locals, public.pedido_supplier_products, public.set_updated_at(), public.current_local_id()

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

-- Productos elaborados internos (transformación desde un producto crudo proveedor)
create table if not exists public.escandallo_processed_products (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  source_supplier_product_id uuid not null references public.pedido_supplier_products(id) on delete restrict,
  input_qty numeric(12,4) not null check (input_qty > 0),
  output_qty numeric(12,4) not null check (output_qty > 0),
  output_unit text not null check (output_unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')),
  extra_cost_eur numeric(12,4) not null default 0 check (extra_cost_eur >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, name)
);

create index if not exists idx_escandallo_processed_local_id on public.escandallo_processed_products(local_id);

create table if not exists public.escandallo_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  recipe_id uuid not null references public.escandallo_recipes(id) on delete cascade,
  label text not null,
  qty numeric(12,4) not null check (qty > 0),
  unit text not null check (unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')),
  source_type text not null default 'manual' check (source_type in ('raw', 'processed', 'manual', 'subrecipe')),
  raw_supplier_product_id uuid references public.pedido_supplier_products(id) on delete set null,
  processed_product_id uuid references public.escandallo_processed_products(id) on delete set null,
  sub_recipe_id uuid references public.escandallo_recipes(id) on delete restrict,
  manual_price_per_unit numeric(12,4), -- solo aplica en source_type='manual'
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Si la tabla ya existía (versión con product_id de Mermas), CREATE TABLE no añade columnas nuevas:
-- primero migrar, luego crear índices que usan esas columnas.
alter table public.escandallo_recipe_lines add column if not exists source_type text;
alter table public.escandallo_recipe_lines add column if not exists raw_supplier_product_id uuid;
alter table public.escandallo_recipe_lines add column if not exists processed_product_id uuid;
alter table public.escandallo_recipe_lines add column if not exists sub_recipe_id uuid;
alter table public.escandallo_recipe_lines add column if not exists manual_price_per_unit numeric(12,4);
alter table public.escandallo_recipe_lines add column if not exists unit text;

-- FKs hacia proveedor / elaborados (idempotente si ya existen)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'escandallo_recipe_lines_raw_supplier_product_id_fkey'
  ) then
    alter table public.escandallo_recipe_lines
      add constraint escandallo_recipe_lines_raw_supplier_product_id_fkey
      foreign key (raw_supplier_product_id) references public.pedido_supplier_products(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'escandallo_recipe_lines_processed_product_id_fkey'
  ) then
    alter table public.escandallo_recipe_lines
      add constraint escandallo_recipe_lines_processed_product_id_fkey
      foreign key (processed_product_id) references public.escandallo_processed_products(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'escandallo_recipe_lines_sub_recipe_id_fkey'
  ) then
    alter table public.escandallo_recipe_lines
      add constraint escandallo_recipe_lines_sub_recipe_id_fkey
      foreign key (sub_recipe_id) references public.escandallo_recipes(id) on delete restrict;
  end if;
exception when duplicate_object then null;
end $$;

update public.escandallo_recipe_lines
set source_type = coalesce(source_type, 'manual')
where source_type is null;

alter table public.escandallo_recipe_lines
  alter column source_type set default 'manual';

alter table public.escandallo_recipe_lines
  alter column source_type set not null;

alter table public.escandallo_recipe_lines
  drop constraint if exists escandallo_recipe_lines_source_type_check;
alter table public.escandallo_recipe_lines
  add constraint escandallo_recipe_lines_source_type_check
  check (source_type in ('raw', 'processed', 'manual', 'subrecipe'));

alter table public.escandallo_recipe_lines
  drop constraint if exists escandallo_recipe_lines_unit_check;
alter table public.escandallo_recipe_lines
  add constraint escandallo_recipe_lines_unit_check
  check (unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja'));

create index if not exists idx_escandallo_lines_local_id on public.escandallo_recipe_lines(local_id);
create index if not exists idx_escandallo_lines_recipe_id on public.escandallo_recipe_lines(recipe_id);
create index if not exists idx_escandallo_lines_raw_sp on public.escandallo_recipe_lines(raw_supplier_product_id);
create index if not exists idx_escandallo_lines_processed_id on public.escandallo_recipe_lines(processed_product_id);
create index if not exists idx_escandallo_lines_sub_recipe_id on public.escandallo_recipe_lines(sub_recipe_id);

drop trigger if exists trg_escandallo_recipes_updated_at on public.escandallo_recipes;
create trigger trg_escandallo_recipes_updated_at
before update on public.escandallo_recipes
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_escandallo_processed_updated_at on public.escandallo_processed_products;
create trigger trg_escandallo_processed_updated_at
before update on public.escandallo_processed_products
for each row execute procedure public.set_updated_at();

alter table public.escandallo_recipes enable row level security;
alter table public.escandallo_processed_products enable row level security;
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

drop policy if exists "escandallo_processed same local read" on public.escandallo_processed_products;
create policy "escandallo_processed same local read"
on public.escandallo_processed_products
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "escandallo_processed same local write" on public.escandallo_processed_products;
create policy "escandallo_processed same local write"
on public.escandallo_processed_products
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
