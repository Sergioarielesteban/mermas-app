-- =============================================================================
-- Inventario: catálogo por local (categorías y artículos solo de tu cuenta)
-- =============================================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de:
--   supabase-inventory-schema.sql
--   supabase-inventory-catalog-write-and-snapshots.sql
--   (y supabase-inventory-catalog-update.sql si ya lo aplicaste; este archivo lo sustituye en RLS/UPDATE)
--
-- Efecto: cada fila de inventory_catalog_* tiene local_id. Solo ves y editas el
-- catálogo del local de tu perfil (current_local_id()).
--
-- MIGRACIÓN DE DATOS: el UPDATE siguiente asigna el catálogo existente (sin local)
-- al local más antiguo (created_at). Otros locales quedan con catálogo vacío hasta
-- que creen categorías desde la app o importes SQL con su local_id.
-- =============================================================================

-- 1) Columnas
alter table public.inventory_catalog_categories
  add column if not exists local_id uuid references public.locals (id) on delete cascade;

alter table public.inventory_catalog_items
  add column if not exists local_id uuid references public.locals (id) on delete cascade;

-- 2) Asignar catálogo histórico al primer local (ajusta si tu caso es distinto)
update public.inventory_catalog_categories
set local_id = (select id from public.locals order by created_at asc limit 1)
where local_id is null;

update public.inventory_catalog_items i
set local_id = c.local_id
from public.inventory_catalog_categories c
where c.id = i.catalog_category_id
  and i.local_id is null;

-- 3) NOT NULL (falla si no hay locals o quedan filas sin local_id)
alter table public.inventory_catalog_categories
  alter column local_id set not null;

alter table public.inventory_catalog_items
  alter column local_id set not null;

-- 4) Índice único por local + nombre (sustituye el único global por nombre)
drop index if exists uq_inventory_catalog_categories_name_lower;

create unique index if not exists uq_inventory_catalog_categories_local_name_lower
  on public.inventory_catalog_categories (local_id, lower(trim(name)));

create index if not exists idx_inventory_catalog_categories_local
  on public.inventory_catalog_categories (local_id, sort_order);

create index if not exists idx_inventory_catalog_items_local
  on public.inventory_catalog_items (local_id, catalog_category_id);

-- 5) local_id del artículo = local_id de su categoría
create or replace function public.inventory_catalog_items_set_local_from_category()
returns trigger
language plpgsql
as $$
begin
  select c.local_id into strict new.local_id
  from public.inventory_catalog_categories c
  where c.id = new.catalog_category_id;
  return new;
exception
  when no_data_found then
    raise exception 'inventory_catalog_items: categoría no encontrada';
end;
$$;

drop trigger if exists trg_inventory_catalog_items_local on public.inventory_catalog_items;
create trigger trg_inventory_catalog_items_local
before insert or update of catalog_category_id on public.inventory_catalog_items
for each row execute procedure public.inventory_catalog_items_set_local_from_category();

-- 6) RLS: solo el catálogo del local actual
drop policy if exists "inventory_catalog_categories read all" on public.inventory_catalog_categories;
drop policy if exists "inventory_catalog_items read all" on public.inventory_catalog_items;
drop policy if exists "inventory_catalog_categories insert auth" on public.inventory_catalog_categories;
drop policy if exists "inventory_catalog_items insert auth" on public.inventory_catalog_items;
drop policy if exists "inventory_catalog_categories update auth" on public.inventory_catalog_categories;
drop policy if exists "inventory_catalog_items update auth" on public.inventory_catalog_items;

create policy "inventory_catalog_categories read same local"
on public.inventory_catalog_categories
for select
to authenticated
using (local_id = public.current_local_id());

create policy "inventory_catalog_items read same local"
on public.inventory_catalog_items
for select
to authenticated
using (local_id = public.current_local_id());

create policy "inventory_catalog_categories insert same local"
on public.inventory_catalog_categories
for insert
to authenticated
with check (local_id = public.current_local_id());

create policy "inventory_catalog_items insert same local"
on public.inventory_catalog_items
for insert
to authenticated
with check (local_id = public.current_local_id());

create policy "inventory_catalog_categories update same local"
on public.inventory_catalog_categories
for update
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

create policy "inventory_catalog_items update same local"
on public.inventory_catalog_items
for update
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

comment on column public.inventory_catalog_categories.local_id is 'Local propietario del catálogo; aislado de otros locales.';
comment on column public.inventory_catalog_items.local_id is 'Denormalizado desde la categoría; debe coincidir con current_local_id() en RLS.';
