-- Inventario: coste desde artículos proveedor (pedido_supplier_products) + equivalencias reutilizables.
-- Idempotente. Ejecutar en Supabase SQL Editor.
-- No elimina Artículos Máster; el inventario deja de usar origen_coste = 'master'.

-- -----------------------------------------------------------------------------
-- 1) inventory_items: vínculo a catálogo proveedor y precio calculado
-- -----------------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists supplier_product_id uuid;

alter table public.inventory_items
  add column if not exists supplier_id uuid;

alter table public.inventory_items
  add column if not exists precio_unitario_calculado numeric(14, 6);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_supplier_product_fkey'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_supplier_product_fkey
      foreign key (supplier_product_id)
      references public.pedido_supplier_products(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_supplier_fkey'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_supplier_fkey
      foreign key (supplier_id)
      references public.pedido_suppliers(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_inventory_items_supplier_product
  on public.inventory_items (local_id, supplier_product_id)
  where supplier_product_id is not null;

-- Permitir litros en unidad de conteo de inventario (y catálogo global coherente)
alter table public.inventory_items
  drop constraint if exists inventory_items_unit_check;

alter table public.inventory_items
  add constraint inventory_items_unit_check
  check (
    unit in ('kg', 'l', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  );

alter table public.inventory_catalog_items
  drop constraint if exists inventory_catalog_items_unit_check;

alter table public.inventory_catalog_items
  add constraint inventory_catalog_items_unit_check
  check (
    unit in ('kg', 'l', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  );

-- Permitir articulo_proveedor antes de migrar filas (el check previo suele incluir solo 'master').
alter table public.inventory_items
  drop constraint if exists inventory_items_origen_coste_chk;

alter table public.inventory_items
  add constraint inventory_items_origen_coste_chk
  check (
    origen_coste in ('manual', 'master', 'articulo_proveedor', 'produccion_propia', 'recetario_cc')
  );

-- -----------------------------------------------------------------------------
-- 2) Migración origen máster → artículo proveedor (cuando hay ref en máster)
-- -----------------------------------------------------------------------------
update public.inventory_items i
set
  supplier_product_id = pa.referencia_principal_supplier_product_id,
  supplier_id = psp.supplier_id
from public.purchase_articles pa
join public.pedido_supplier_products psp on psp.id = pa.referencia_principal_supplier_product_id
where i.origen_coste = 'master'
  and i.master_article_id = pa.id
  and pa.referencia_principal_supplier_product_id is not null
  and pa.local_id = i.local_id
  and psp.local_id = i.local_id;

update public.inventory_items
set origen_coste = 'articulo_proveedor'
where origen_coste = 'master'
  and supplier_product_id is not null;

-- Máster sin ref proveedor: pasar a manual (el usuario debe enlazar de nuevo)
update public.inventory_items
set
  origen_coste = 'manual',
  master_article_id = null,
  master_cost_source = 'uso'
where origen_coste = 'master';

-- -----------------------------------------------------------------------------
-- 3) Check origen_coste definitivo (sin 'master')
-- -----------------------------------------------------------------------------
alter table public.inventory_items
  drop constraint if exists inventory_items_origen_coste_chk;

alter table public.inventory_items
  add constraint inventory_items_origen_coste_chk
  check (
    origen_coste in ('manual', 'articulo_proveedor', 'produccion_propia', 'recetario_cc')
  );

comment on column public.inventory_items.supplier_product_id is
  'Catálogo proveedor (pedido_supplier_products) cuando origen_coste = articulo_proveedor.';
comment on column public.inventory_items.supplier_id is
  'Proveedor (pedido_suppliers), denormalizado para coherencia con la línea de catálogo.';
comment on column public.inventory_items.precio_unitario_calculado is
  'Último precio unitario calculado desde proveedor (€ por unidad de conteo / valoración).';

-- -----------------------------------------------------------------------------
-- 4) Equivalencias entre unidades por artículo proveedor (reutilizable)
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_cost_conversions (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  supplier_product_id uuid not null references public.pedido_supplier_products(id) on delete cascade,
  unidad_origen text not null,
  unidad_destino text not null,
  factor numeric(18, 8) not null check (factor > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint inventory_cost_conversions_unidad_origen_nonempty check (char_length(trim(unidad_origen)) > 0),
  constraint inventory_cost_conversions_unidad_destino_nonempty check (char_length(trim(unidad_destino)) > 0),
  constraint inventory_cost_conversions_uq unique (local_id, supplier_product_id, unidad_origen, unidad_destino)
);

create index if not exists idx_inventory_cost_conversions_local_sp
  on public.inventory_cost_conversions (local_id, supplier_product_id);

drop trigger if exists trg_inventory_cost_conversions_updated_at on public.inventory_cost_conversions;
create trigger trg_inventory_cost_conversions_updated_at
before update on public.inventory_cost_conversions
for each row execute procedure public.set_updated_at();

alter table public.inventory_cost_conversions enable row level security;

drop policy if exists "inventory_cost_conversions same local read" on public.inventory_cost_conversions;
create policy "inventory_cost_conversions same local read"
on public.inventory_cost_conversions
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "inventory_cost_conversions same local write" on public.inventory_cost_conversions;
create policy "inventory_cost_conversions same local write"
on public.inventory_cost_conversions
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

comment on table public.inventory_cost_conversions is
  'Equivalencia: 1 unidad_origen = factor × unidad_destino (ej. 1 caja = 6 kg → factor 6).';
comment on column public.inventory_cost_conversions.factor is
  'Cantidad de unidad_destino que equivalen a 1 unidad_origen.';
