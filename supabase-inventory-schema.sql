-- =============================================================================
-- Módulo Inventario (stock + valor) — Chef-One / multi-local
-- =============================================================================
-- Ejecutar en Supabase SQL Editor después de supabase-multilocal-schema.sql
-- (requiere public.locals, public.profiles, public.current_local_id()).
--
-- Modelo:
--   • Catálogo GLOBAL: mismas categorías y artículos con precio base para todos.
--   • Por LOCAL: líneas de stock (cantidad × precio); pueden enlazar al catálogo
--     o ser artículos manuales; nombre y precio editables (valoración).
--   • Categorías LOCALES: el usuario crea carpetas propias (opcional) y asigna líneas.
--
-- Carga masiva del listado base: usa INSERT en inventory_catalog_categories e
-- inventory_catalog_items (rol service en SQL Editor o política temporal).
-- Ver comentarios al final del archivo.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Catálogo global (lectura para usuarios autenticados; escritura vía SQL Editor)
-- -----------------------------------------------------------------------------

create table if not exists public.inventory_catalog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_catalog_categories_name_nonempty check (char_length(trim(name)) > 0)
);

create unique index if not exists uq_inventory_catalog_categories_name_lower
  on public.inventory_catalog_categories (lower(trim(name)));

create index if not exists idx_inventory_catalog_categories_sort
  on public.inventory_catalog_categories (sort_order, name);

create table if not exists public.inventory_catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_category_id uuid not null references public.inventory_catalog_categories (id) on delete restrict,
  name text not null,
  unit text not null check (
    unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  ),
  default_price_per_unit numeric(10, 2) not null check (default_price_per_unit >= 0),
  format_label text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_catalog_items_name_nonempty check (char_length(trim(name)) > 0)
);

create index if not exists idx_inventory_catalog_items_category
  on public.inventory_catalog_items (catalog_category_id, sort_order, name);

-- -----------------------------------------------------------------------------
-- Categorías creadas por cada local (organización propia)
-- -----------------------------------------------------------------------------

create table if not exists public.inventory_local_categories (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_local_categories_name_nonempty check (char_length(trim(name)) > 0)
);

create unique index if not exists uq_inventory_local_categories_local_name
  on public.inventory_local_categories (local_id, lower(trim(name)));

create index if not exists idx_inventory_local_categories_local
  on public.inventory_local_categories (local_id, sort_order, name);

-- -----------------------------------------------------------------------------
-- Línea de stock por local (desde catálogo o manual)
-- -----------------------------------------------------------------------------

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete cascade,
  catalog_item_id uuid references public.inventory_catalog_items (id) on delete set null,
  local_category_id uuid references public.inventory_local_categories (id) on delete set null,
  name text not null,
  unit text not null check (
    unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  ),
  price_per_unit numeric(10, 2) not null check (price_per_unit >= 0),
  quantity_on_hand numeric(14, 3) not null default 0 check (quantity_on_hand >= 0),
  format_label text,
  notes text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_name_nonempty check (char_length(trim(name)) > 0)
);

create unique index if not exists uq_inventory_items_local_catalog
  on public.inventory_items (local_id, catalog_item_id)
  where catalog_item_id is not null;

create index if not exists idx_inventory_items_local
  on public.inventory_items (local_id, is_active, sort_order, name);

create index if not exists idx_inventory_items_local_category
  on public.inventory_items (local_id, local_category_id);

-- -----------------------------------------------------------------------------
-- Movimientos (opcional: auditoría; la app puede rellenar más adelante)
-- -----------------------------------------------------------------------------

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  quantity_delta numeric(14, 3) not null,
  reason text not null default '',
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_movements_item
  on public.inventory_movements (inventory_item_id, occurred_at desc);

create index if not exists idx_inventory_movements_local
  on public.inventory_movements (local_id, occurred_at desc);

-- La categoría local debe pertenecer al mismo local (CHECK no admite subconsultas en PG)
create or replace function public.inventory_items_validate_local_category()
returns trigger
language plpgsql
as $$
begin
  if new.local_category_id is not null then
    if not exists (
      select 1
      from public.inventory_local_categories c
      where c.id = new.local_category_id
        and c.local_id = new.local_id
    ) then
      raise exception 'inventory_items: local_category_id no pertenece a este local';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inventory_items_validate_local_category on public.inventory_items;
create trigger trg_inventory_items_validate_local_category
before insert or update on public.inventory_items
for each row execute procedure public.inventory_items_validate_local_category();

-- -----------------------------------------------------------------------------
-- Triggers updated_at
-- -----------------------------------------------------------------------------

drop trigger if exists trg_inventory_catalog_categories_updated_at on public.inventory_catalog_categories;
create trigger trg_inventory_catalog_categories_updated_at
before update on public.inventory_catalog_categories
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_inventory_catalog_items_updated_at on public.inventory_catalog_items;
create trigger trg_inventory_catalog_items_updated_at
before update on public.inventory_catalog_items
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_inventory_local_categories_updated_at on public.inventory_local_categories;
create trigger trg_inventory_local_categories_updated_at
before update on public.inventory_local_categories
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_inventory_items_updated_at on public.inventory_items;
create trigger trg_inventory_items_updated_at
before update on public.inventory_items
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.inventory_catalog_categories enable row level security;
alter table public.inventory_catalog_items enable row level security;
alter table public.inventory_local_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

-- Catálogo global: solo lectura desde la app (carga masiva con service role en SQL Editor)
drop policy if exists "inventory_catalog_categories read all" on public.inventory_catalog_categories;
create policy "inventory_catalog_categories read all"
on public.inventory_catalog_categories
for select
to authenticated
using (true);

drop policy if exists "inventory_catalog_items read all" on public.inventory_catalog_items;
create policy "inventory_catalog_items read all"
on public.inventory_catalog_items
for select
to authenticated
using (true);

-- Categorías locales
drop policy if exists "inventory_local_categories same local read" on public.inventory_local_categories;
create policy "inventory_local_categories same local read"
on public.inventory_local_categories
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "inventory_local_categories same local write" on public.inventory_local_categories;
create policy "inventory_local_categories same local write"
on public.inventory_local_categories
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- Líneas de stock
drop policy if exists "inventory_items same local read" on public.inventory_items;
create policy "inventory_items same local read"
on public.inventory_items
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "inventory_items same local write" on public.inventory_items;
create policy "inventory_items same local write"
on public.inventory_items
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- Movimientos: mismo local que el ítem
drop policy if exists "inventory_movements same local read" on public.inventory_movements;
create policy "inventory_movements same local read"
on public.inventory_movements
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "inventory_movements same local insert" on public.inventory_movements;
create policy "inventory_movements same local insert"
on public.inventory_movements
for insert
to authenticated
with check (
  local_id = public.current_local_id()
  and exists (
    select 1
    from public.inventory_items i
    where i.id = inventory_item_id
      and i.local_id = public.current_local_id()
  )
);

-- Opcional: permitir delete de movimientos al mismo local (si la app lo necesita)
drop policy if exists "inventory_movements same local delete" on public.inventory_movements;
create policy "inventory_movements same local delete"
on public.inventory_movements
for delete
to authenticated
using (local_id = public.current_local_id());

-- =============================================================================
-- Carga masiva del catálogo (ejecutar en SQL Editor con permisos suficientes)
-- =============================================================================
-- 1) Categorías:
--    insert into public.inventory_catalog_categories (name, sort_order)
--    values ('Bebidas', 10), ('Seco', 20)
--    on conflict do nothing;  -- si usas unique por nombre, ajusta
--
-- 2) Artículos (sustituye :cat_id por el uuid de la categoría):
--    insert into public.inventory_catalog_items
--      (catalog_category_id, name, unit, default_price_per_unit, format_label, sort_order)
--    values
--      ('00000000-0000-0000-0000-000000000001', 'Agua mineral', 'caja', 4.50, '6x1,5L', 1);
--
-- Cuando pases el listado (CSV/Excel), se puede generar un script INSERT único.
-- La app creará filas en inventory_items al “activar” un artículo del catálogo
-- o al dar de alta manual, copiando nombre/unidad/precio base y permitiendo edición.
--
-- Carga Champanillo (categorías + ~300 artículos con coste/unidad del Excel):
--   supabase-inventory-seed-champanillo.sql
--   (generado con: python3 scripts/build_inventory_seed_sql.py > supabase-inventory-seed-champanillo.sql)
--   Datos fuente: data/inventory_champanillo_pipe.txt
-- =============================================================================
