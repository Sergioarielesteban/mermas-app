-- =============================================================================
-- Cocina central: inventario interno vs catálogo para sedes (venta a locales)
-- Ejecutar después de supabase-cocina-central-schema.sql y supabase-cocina-central-supply-orders.sql
--
-- IMPORTANTE: ejecuta el archivo COMPLETO en el SQL Editor (no solo un trozo).
-- Si copias solo el SELECT interior, fallará: los identificadores como variables
-- solo existen dentro del bloque PL/pgSQL.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Inventario interno (solo cocina central; no visible para satélites)
-- ---------------------------------------------------------------------------
create table if not exists public.central_inventory_products (
  id uuid primary key default gen_random_uuid(),
  local_central_id uuid not null references public.locals(id) on delete cascade,
  nombre text not null,
  unidad_base text not null check (unidad_base in ('kg', 'litros', 'unidades')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_central_inventory_products_local
  on public.central_inventory_products (local_central_id, nombre);

comment on table public.central_inventory_products is 'Referencia interna de producto (stock/lotes); los locales no leen esta tabla.';

drop trigger if exists trg_central_inventory_products_u on public.central_inventory_products;
create trigger trg_central_inventory_products_u
before update on public.central_inventory_products
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- B) Catálogo vendible a locales (independiente del stock real)
-- ---------------------------------------------------------------------------
create table if not exists public.central_catalog_products (
  id uuid primary key default gen_random_uuid(),
  local_central_id uuid not null references public.locals(id) on delete cascade,
  nombre_producto text not null,
  descripcion text,
  precio_venta numeric(14,4) not null check (precio_venta >= 0),
  unidad_venta text not null,
  activo boolean not null default true,
  visible_para_locales boolean not null default true,
  orden integer not null default 0,
  inventory_product_id uuid references public.central_inventory_products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_central_catalog_products_local_order
  on public.central_catalog_products (local_central_id, orden, nombre_producto);

comment on table public.central_catalog_products is 'Catálogo de venta a sedes; precio y unidad de venta; sin stock.';

drop trigger if exists trg_central_catalog_products_u on public.central_catalog_products;
create trigger trg_central_catalog_products_u
before update on public.central_catalog_products
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- C) Líneas de pedido: enlace al catálogo + compatibilidad legado (products)
-- ---------------------------------------------------------------------------
alter table public.central_supply_order_items
  add column if not exists catalog_product_id uuid references public.central_catalog_products(id) on delete restrict;

alter table public.central_supply_order_items
  alter column product_id drop not null;

alter table public.central_supply_order_items
  drop constraint if exists central_supply_order_items_unidad_check;

alter table public.central_supply_order_items
  drop constraint if exists central_supply_order_items_unidad_non_empty;

alter table public.central_supply_order_items
  add constraint central_supply_order_items_unidad_non_empty check (btrim(unidad) <> '');

alter table public.central_supply_order_items
  drop constraint if exists central_supply_order_items_catalog_or_legacy;

alter table public.central_supply_order_items
  add constraint central_supply_order_items_catalog_or_legacy check (
    catalog_product_id is not null or product_id is not null
  );

-- ---------------------------------------------------------------------------
-- D) RLS: solo cocina central del mismo local; satélites no SELECT directo
-- ---------------------------------------------------------------------------
alter table public.central_inventory_products enable row level security;
alter table public.central_catalog_products enable row level security;

drop policy if exists cc_inv_products_rw on public.central_inventory_products;
create policy cc_inv_products_rw on public.central_inventory_products
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

drop policy if exists cc_catalog_products_rw on public.central_catalog_products;
create policy cc_catalog_products_rw on public.central_catalog_products
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

-- ---------------------------------------------------------------------------
-- E) Catálogo para sedes (RPC; sin stock)
-- ---------------------------------------------------------------------------
-- Postgres no permite cambiar el tipo de fila devuelto con CREATE OR REPLACE.
drop function if exists public.cc_list_central_supply_catalog();

create or replace function public.cc_list_central_supply_catalog()
returns table (
  catalog_product_id uuid,
  nombre_producto text,
  descripcion text,
  unidad_venta text,
  precio_venta numeric
)
language plpgsql
security definer
set search_path = public
as $cc_list$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if public.profile_local_is_central() then
    raise exception 'El catálogo de pedido es solo para sedes satélite';
  end if;
  if not exists (
    select 1
    from public.locals l
    where l.is_central_kitchen = true and coalesce(l.is_active, true)
  ) then
    raise exception 'No hay cocina central configurada';
  end if;
  return query select
    c.id,
    c.nombre_producto,
    coalesce(c.descripcion, '')::text,
    c.unidad_venta,
    c.precio_venta
  from public.central_catalog_products c
  where c.local_central_id = (
    select l.id
    from public.locals l
    where l.is_central_kitchen = true and coalesce(l.is_active, true)
    order by l.name
    limit 1
  )
  and c.activo = true
  and c.visible_para_locales = true
  order by c.orden asc, c.nombre_producto asc;
end;
$cc_list$;

revoke all on function public.cc_list_central_supply_catalog() from public;
grant execute on function public.cc_list_central_supply_catalog() to authenticated;

-- ---------------------------------------------------------------------------
-- F) Enviar pedido: prioridad catalog_product_id; legado product_id (products)
-- ---------------------------------------------------------------------------
drop function if exists public.cc_submit_supply_order(date, jsonb, text);

create or replace function public.cc_submit_supply_order(
  p_fecha_entrega date,
  p_items jsonb,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_solicitante uuid;
  v_order uuid;
  v_lab_sol text;
  v_lab_cen text;
  x jsonb;
  v_cid uuid;
  v_pid uuid;
  v_qty numeric;
  v_name text;
  v_unit text;
  v_pu numeric;
  v_line numeric;
  v_sum numeric := 0;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if public.profile_local_is_central() then
    raise exception 'Solo sedes satélite pueden crear pedidos de suministro';
  end if;
  v_solicitante := public.current_local_id();
  if v_solicitante is null then raise exception 'Sin local en perfil'; end if;

  if not exists (
    select 1
    from public.locals l
    where l.is_central_kitchen = true and coalesce(l.is_active, true)
  ) then
    raise exception 'No hay cocina central';
  end if;

  select l.name into v_lab_sol from public.locals l where l.id = v_solicitante limit 1;
  select k.name into v_lab_cen
  from public.locals k
  where k.id = (
    select l.id
    from public.locals l
    where l.is_central_kitchen = true and coalesce(l.is_active, true)
    order by l.name
    limit 1
  )
  limit 1;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Añade al menos una línea al pedido';
  end if;

  insert into public.central_supply_orders (
    local_solicitante_id, local_central_id, fecha_entrega_deseada, estado, notas,
    local_solicitante_label, local_central_label, created_by, total_eur
  )
  select
    v_solicitante,
    (select l.id from public.locals l where l.is_central_kitchen = true and coalesce(l.is_active, true) order by l.name limit 1),
    p_fecha_entrega,
    'enviado',
    nullif(trim(p_notas), ''),
    v_lab_sol,
    v_lab_cen,
    v_uid,
    0
  returning id into v_order;

  for x in select * from jsonb_array_elements(p_items) loop
    v_qty := (x->>'cantidad')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida en una línea';
    end if;

    if (x ? 'catalog_product_id') and (x->>'catalog_product_id') is not null
       and btrim(x->>'catalog_product_id') <> '' then
      v_cid := (x->>'catalog_product_id')::uuid;
      select c.nombre_producto, c.unidad_venta, c.precio_venta
      into v_name, v_unit, v_pu
      from public.central_catalog_products c
      where c.id = v_cid
        and c.local_central_id = (select l.id from public.locals l where l.is_central_kitchen = true and coalesce(l.is_active, true) order by l.name limit 1)
        and c.activo = true
        and c.visible_para_locales = true;
      if v_name is null then
        raise exception 'Producto de catálogo no disponible';
      end if;
      v_line := round(v_qty * v_pu, 2);
      v_sum := v_sum + v_line;
      insert into public.central_supply_order_items (
        order_id, catalog_product_id, product_id, product_name, cantidad, unidad, precio_unitario_eur, line_total_eur
      ) values (
        v_order, v_cid, null, v_name, v_qty, v_unit, v_pu, v_line
      );
    elsif (x ? 'product_id') and (x->>'product_id') is not null
          and btrim(x->>'product_id') <> '' then
      v_pid := (x->>'product_id')::uuid;
      select p.name, p.unit::text, p.price_per_unit
      into v_name, v_unit, v_pu
      from public.products p
      where p.id = v_pid
        and p.local_id = (select l.id from public.locals l where l.is_central_kitchen = true and coalesce(l.is_active, true) order by l.name limit 1)
        and p.is_active = true;
      if v_name is null then
        raise exception 'Producto no disponible en catálogo central (legado)';
      end if;
      v_line := round(v_qty * v_pu, 2);
      v_sum := v_sum + v_line;
      insert into public.central_supply_order_items (
        order_id, catalog_product_id, product_id, product_name, cantidad, unidad, precio_unitario_eur, line_total_eur
      ) values (
        v_order, null, v_pid, v_name, v_qty, v_unit, v_pu, v_line
      );
    else
      raise exception 'Cada línea debe incluir catalog_product_id o product_id (legado)';
    end if;
  end loop;

  update public.central_supply_orders set total_eur = round(v_sum, 2) where id = v_order;
  return v_order;
end;
$fn$;

revoke all on function public.cc_submit_supply_order(date, jsonb, text) from public;
grant execute on function public.cc_submit_supply_order(date, jsonb, text) to authenticated;

-- Opcional: copiar productos activos de `products` de la cocina central al catálogo (una vez).
-- Descomenta y ejecuta si quieres arranque rápido:
/*
insert into public.central_catalog_products (
  local_central_id, nombre_producto, descripcion, precio_venta, unidad_venta,
  activo, visible_para_locales, orden
)
select
  p.local_id,
  p.name,
  null,
  p.price_per_unit,
  p.unit::text,
  p.is_active,
  p.is_active,
  row_number() over (order by p.name)
from public.products p
where p.local_id = (select id from public.locals where is_central_kitchen limit 1)
  and p.is_active = true
  and not exists (
    select 1 from public.central_catalog_products c
    where c.local_central_id = p.local_id and c.nombre_producto = p.name
  );
*/
