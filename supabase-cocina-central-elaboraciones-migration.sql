-- =============================================================================
-- Cocina central: separar elaboraciones internas de products (restaurante general)
-- Ejecutar DESPUÉS de:
--   - supabase-cocina-central-schema.sql
--   - supabase-cocina-central-catalog-locales.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Entidad de elaboraciones internas
-- ---------------------------------------------------------------------------
create table if not exists public.central_preparations (
  id uuid primary key default gen_random_uuid(),
  local_central_id uuid not null references public.locals(id) on delete cascade,
  nombre text not null,
  descripcion text,
  categoria text not null default 'General',
  unidad_base text not null check (unidad_base in ('kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades')),
  activo boolean not null default true,
  rendimiento numeric(14,4),
  caducidad_dias integer check (caducidad_dias is null or caducidad_dias >= 0),
  observaciones text,
  -- Compatibilidad: referencia opcional al producto legacy si existía mapeo previo.
  legacy_product_id uuid references public.products(id) on delete set null,
  -- Puentes opcionales para separar interno vs vendible.
  inventory_product_id uuid references public.central_inventory_products(id) on delete set null,
  catalog_product_id uuid references public.central_catalog_products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_central_id, nombre)
);

create unique index if not exists idx_cc_preparations_local_legacy
  on public.central_preparations (local_central_id, legacy_product_id)
  where legacy_product_id is not null;

create index if not exists idx_cc_preparations_local_nombre
  on public.central_preparations (local_central_id, nombre);

drop trigger if exists trg_central_preparations_u on public.central_preparations;
create trigger trg_central_preparations_u
before update on public.central_preparations
for each row execute procedure public.set_updated_at();

-- Ingredientes base por elaboración (estructura receta; no sustituye trazabilidad de lote).
create table if not exists public.central_preparation_ingredients (
  id uuid primary key default gen_random_uuid(),
  preparation_id uuid not null references public.central_preparations(id) on delete cascade,
  ingredient_preparation_id uuid not null references public.central_preparations(id) on delete restrict,
  cantidad numeric(14,4) not null check (cantidad > 0),
  unidad text not null check (unidad in ('kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades')),
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (preparation_id, ingredient_preparation_id)
);

create index if not exists idx_cc_prep_ingredients_preparation
  on public.central_preparation_ingredients (preparation_id);

drop trigger if exists trg_central_preparation_ingredients_u on public.central_preparation_ingredients;
create trigger trg_central_preparation_ingredients_u
before update on public.central_preparation_ingredients
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Producción/lotes/entregas: añadir referencia a elaboración
-- ---------------------------------------------------------------------------
alter table public.production_orders
  add column if not exists preparation_id uuid references public.central_preparations(id) on delete restrict;

alter table public.production_batches
  add column if not exists preparation_id uuid references public.central_preparations(id) on delete restrict;

alter table public.batch_ingredient_trace
  add column if not exists ingredient_preparation_id uuid references public.central_preparations(id) on delete restrict;

alter table public.delivery_items
  add column if not exists preparation_id uuid references public.central_preparations(id) on delete restrict;

-- Permitir convivencia temporal con columnas legacy.
alter table public.production_orders alter column product_id drop not null;
alter table public.production_batches alter column product_id drop not null;
alter table public.batch_ingredient_trace alter column ingredient_product_id drop not null;
alter table public.delivery_items alter column product_id drop not null;

create index if not exists idx_prod_orders_preparation on public.production_orders(preparation_id);
create index if not exists idx_prod_batches_preparation on public.production_batches(preparation_id);
create index if not exists idx_batch_ing_trace_preparation on public.batch_ingredient_trace(ingredient_preparation_id);
create index if not exists idx_delivery_items_preparation on public.delivery_items(preparation_id);

-- ---------------------------------------------------------------------------
-- 3) Backfill: mapear registros antiguos (product_id) -> preparación
-- ---------------------------------------------------------------------------
with src as (
  -- órdenes
  select distinct
    po.local_central_id as local_id,
    po.product_id as legacy_product_id
  from public.production_orders po
  where po.product_id is not null
  union
  -- lotes
  select distinct
    pb.local_central_id as local_id,
    pb.product_id as legacy_product_id
  from public.production_batches pb
  where pb.product_id is not null
  union
  -- líneas de entrega (origen de la entrega)
  select distinct
    d.local_origen_id as local_id,
    di.product_id as legacy_product_id
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where di.product_id is not null
  union
  -- trazabilidad de ingredientes por lote
  select distinct
    pb.local_central_id as local_id,
    bit.ingredient_product_id as legacy_product_id
  from public.batch_ingredient_trace bit
  join public.production_batches pb on pb.id = bit.batch_id
  where bit.ingredient_product_id is not null
)
insert into public.central_preparations (
  local_central_id,
  nombre,
  descripcion,
  categoria,
  unidad_base,
  activo,
  legacy_product_id
)
select
  s.local_id,
  p.name,
  'Migrado desde products',
  'Migrado',
  case
    when p.unit in ('kg', 'ud', 'bolsa', 'racion') then p.unit
    else 'unidades'
  end,
  coalesce(p.is_active, true),
  s.legacy_product_id
from src s
join public.products p on p.id = s.legacy_product_id
where not exists (
  select 1
  from public.central_preparations cp
  where cp.local_central_id = s.local_id
    and cp.legacy_product_id = s.legacy_product_id
);

update public.production_orders po
set preparation_id = cp.id
from public.central_preparations cp
where po.preparation_id is null
  and po.product_id is not null
  and cp.local_central_id = po.local_central_id
  and cp.legacy_product_id = po.product_id;

update public.production_batches pb
set preparation_id = cp.id
from public.central_preparations cp
where pb.preparation_id is null
  and pb.product_id is not null
  and cp.local_central_id = pb.local_central_id
  and cp.legacy_product_id = pb.product_id;

update public.batch_ingredient_trace bit
set ingredient_preparation_id = cp.id
from public.production_batches pb
join public.central_preparations cp
  on cp.local_central_id = pb.local_central_id
 and cp.legacy_product_id = bit.ingredient_product_id
where bit.batch_id = pb.id
  and bit.ingredient_preparation_id is null
  and bit.ingredient_product_id is not null;

update public.delivery_items di
set preparation_id = cp.id
from public.deliveries d
join public.central_preparations cp
  on cp.local_central_id = d.local_origen_id
 and cp.legacy_product_id = di.product_id
where di.delivery_id = d.id
  and di.preparation_id is null
  and di.product_id is not null;

-- ---------------------------------------------------------------------------
-- 4) RPC v2: registrar lote por elaboración (mantiene lógica stock/movimientos)
-- ---------------------------------------------------------------------------
create or replace function public.cc_register_production_batch_v2(
  p_order_id uuid,
  p_preparation_id uuid,
  p_local_central_id uuid,
  p_fecha_elaboracion date,
  p_fecha_caducidad date,
  p_cantidad numeric,
  p_unidad text,
  p_ingredients jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_code text;
  v_product_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.profile_can_access_cocina_central_module() then
    raise exception 'Solo administradores o encargados pueden registrar producción en cocina central';
  end if;
  if p_local_central_id is distinct from public.current_local_id() then
    raise exception 'Solo puedes producir en tu local';
  end if;
  if not public.profile_local_is_central() then
    raise exception 'Solo cocina central puede registrar lotes';
  end if;
  if not exists (select 1 from public.locals l where l.id = p_local_central_id and l.is_central_kitchen) then
    raise exception 'El local no está marcado como cocina central';
  end if;
  if p_preparation_id is null then
    raise exception 'Elaboración obligatoria';
  end if;

  select cp.legacy_product_id
    into v_product_id
  from public.central_preparations cp
  where cp.id = p_preparation_id
    and cp.local_central_id = p_local_central_id
  limit 1;

  if not found then
    raise exception 'Elaboración no válida para este local';
  end if;

  v_code := public.cc_next_codigo_lote(p_local_central_id);

  insert into public.production_batches (
    production_order_id, product_id, preparation_id, local_central_id, codigo_lote,
    fecha_elaboracion, fecha_caducidad, cantidad_producida, unidad, estado
  ) values (
    p_order_id, v_product_id, p_preparation_id, p_local_central_id, v_code,
    p_fecha_elaboracion, p_fecha_caducidad, p_cantidad, p_unidad, 'disponible'
  )
  returning id into v_batch_id;

  insert into public.batch_stock (batch_id, local_id, cantidad)
  values (v_batch_id, p_local_central_id, p_cantidad)
  on conflict (batch_id, local_id) do update set cantidad = batch_stock.cantidad + excluded.cantidad;

  insert into public.batch_movements (
    batch_id, local_from, local_to, cantidad, tipo, created_by
  ) values (
    v_batch_id, null, p_local_central_id, p_cantidad, 'produccion', v_uid
  );

  -- ingredientes opcionales: [{ "preparation_id": "uuid", "cantidad": 1, "unidad": "kg" }, ...]
  if p_ingredients is not null and jsonb_typeof(p_ingredients) = 'array' then
    insert into public.batch_ingredient_trace (
      batch_id, ingredient_preparation_id, ingredient_product_id, cantidad, unidad
    )
    select
      v_batch_id,
      (x->>'preparation_id')::uuid,
      (
        select cp.legacy_product_id
        from public.central_preparations cp
        where cp.id = (x->>'preparation_id')::uuid
          and cp.local_central_id = p_local_central_id
        limit 1
      ),
      (x->>'cantidad')::numeric,
      coalesce(x->>'unidad', p_unidad)
    from jsonb_array_elements(p_ingredients) x
    where (x->>'preparation_id') is not null
      and (x->>'cantidad') is not null;
  end if;

  return v_batch_id;
end;
$$;

revoke all on function public.cc_register_production_batch_v2(uuid, uuid, uuid, date, date, numeric, text, jsonb) from public;
grant execute on function public.cc_register_production_batch_v2(uuid, uuid, uuid, date, date, numeric, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) RLS para nuevas tablas
-- ---------------------------------------------------------------------------
alter table public.central_preparations enable row level security;
alter table public.central_preparation_ingredients enable row level security;

drop policy if exists cc_preparations_rw on public.central_preparations;
create policy cc_preparations_rw on public.central_preparations
for all to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
)
with check (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

drop policy if exists cc_preparation_ingredients_rw on public.central_preparation_ingredients;
create policy cc_preparation_ingredients_rw on public.central_preparation_ingredients
for all to authenticated
using (
  exists (
    select 1
    from public.central_preparations cp
    where cp.id = central_preparation_ingredients.preparation_id
      and cp.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
      and public.profile_can_access_cocina_central_module()
  )
)
with check (
  exists (
    select 1
    from public.central_preparations cp
    where cp.id = central_preparation_ingredients.preparation_id
      and cp.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
      and public.profile_can_access_cocina_central_module()
  )
  and exists (
    select 1
    from public.central_preparations cp_ing
    where cp_ing.id = central_preparation_ingredients.ingredient_preparation_id
      and cp_ing.local_central_id = public.current_local_id()
  )
);
