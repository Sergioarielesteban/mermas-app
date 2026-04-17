-- Pedidos de suministro: sedes satélite → cocina central (precios del catálogo central, snapshot en líneas).
-- Requiere: locals.is_central_kitchen, products por local, current_local_id(), set_updated_at(), profiles

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.central_supply_orders (
  id uuid primary key default gen_random_uuid(),
  local_solicitante_id uuid not null references public.locals(id) on delete restrict,
  local_central_id uuid not null references public.locals(id) on delete restrict,
  fecha_entrega_deseada date not null,
  estado text not null default 'enviado' check (
    estado in ('enviado', 'visto', 'en_preparacion', 'servido', 'cancelado')
  ),
  notas text,
  local_solicitante_label text,
  local_central_label text,
  total_eur numeric(14,2) not null default 0 check (total_eur >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (local_solicitante_id is distinct from local_central_id)
);

create index if not exists idx_central_supply_orders_solicitante
  on public.central_supply_orders(local_solicitante_id, created_at desc);
create index if not exists idx_central_supply_orders_central
  on public.central_supply_orders(local_central_id, fecha_entrega_deseada desc);

create table if not exists public.central_supply_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.central_supply_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  cantidad numeric(14,4) not null check (cantidad > 0),
  unidad text not null check (unidad in ('kg', 'ud', 'bolsa', 'racion')),
  precio_unitario_eur numeric(14,4) not null check (precio_unitario_eur >= 0),
  line_total_eur numeric(14,4) not null check (line_total_eur >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_central_supply_items_order on public.central_supply_order_items(order_id);

drop trigger if exists trg_central_supply_orders_u on public.central_supply_orders;
create trigger trg_central_supply_orders_u before update on public.central_supply_orders
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Catálogo (precios según productos dados de alta en la cocina central)
-- ---------------------------------------------------------------------------
create or replace function public.cc_list_central_supply_catalog()
returns table (
  product_id uuid,
  product_name text,
  unit text,
  price_per_unit numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_central uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if public.profile_local_is_central() then
    raise exception 'El catálogo de pedido es solo para sedes satélite';
  end if;
  select l.id into v_central
  from public.locals l
  where l.is_central_kitchen = true and coalesce(l.is_active, true)
  order by l.name
  limit 1;
  if v_central is null then
    raise exception 'No hay cocina central configurada';
  end if;
  return query
  select p.id, p.name, p.unit::text, p.price_per_unit
  from public.products p
  where p.local_id = v_central and p.is_active = true
  order by p.name;
end;
$$;

revoke all on function public.cc_list_central_supply_catalog() from public;
grant execute on function public.cc_list_central_supply_catalog() to authenticated;

-- ---------------------------------------------------------------------------
-- Enviar pedido (precios recalculados en servidor; no confiar en el cliente)
-- ---------------------------------------------------------------------------
create or replace function public.cc_submit_supply_order(
  p_fecha_entrega date,
  p_items jsonb,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_solicitante uuid;
  v_central uuid;
  v_order uuid;
  v_lab_sol text;
  v_lab_cen text;
  x jsonb;
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

  select l.id into v_central
  from public.locals l
  where l.is_central_kitchen = true and coalesce(l.is_active, true)
  order by l.name
  limit 1;
  if v_central is null then raise exception 'No hay cocina central'; end if;

  select l.name into v_lab_sol from public.locals l where l.id = v_solicitante limit 1;
  select l.name into v_lab_cen from public.locals l where l.id = v_central limit 1;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Añade al menos una línea al pedido';
  end if;

  insert into public.central_supply_orders (
    local_solicitante_id, local_central_id, fecha_entrega_deseada, estado, notas,
    local_solicitante_label, local_central_label, created_by, total_eur
  ) values (
    v_solicitante, v_central, p_fecha_entrega, 'enviado', nullif(trim(p_notas), ''),
    v_lab_sol, v_lab_cen, v_uid, 0
  )
  returning id into v_order;

  for x in select * from jsonb_array_elements(p_items) loop
    v_pid := (x->>'product_id')::uuid;
    v_qty := (x->>'cantidad')::numeric;
    if v_pid is null or v_qty is null or v_qty <= 0 then
      raise exception 'Línea inválida en el pedido';
    end if;
    select p.name, p.unit::text, p.price_per_unit
    into v_name, v_unit, v_pu
    from public.products p
    where p.id = v_pid and p.local_id = v_central and p.is_active = true;
    if v_name is null then
      raise exception 'Producto no disponible en catálogo central';
    end if;
    v_line := round(v_qty * v_pu, 2);
    v_sum := v_sum + v_line;
    insert into public.central_supply_order_items (
      order_id, product_id, product_name, cantidad, unidad, precio_unitario_eur, line_total_eur
    ) values (
      v_order, v_pid, v_name, v_qty, v_unit, v_pu, v_line
    );
  end loop;

  update public.central_supply_orders set total_eur = round(v_sum, 2) where id = v_order;
  return v_order;
end;
$$;

revoke all on function public.cc_submit_supply_order(date, jsonb, text) from public;
grant execute on function public.cc_submit_supply_order(date, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Actualizar estado (solo cocina central, admin/manager)
-- ---------------------------------------------------------------------------
create or replace function public.cc_update_supply_order_estado(
  p_order_id uuid,
  p_estado text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.profile_can_manage_central_shipments() then
    raise exception 'Sin permiso para actualizar pedidos';
  end if;
  if p_estado not in ('enviado', 'visto', 'en_preparacion', 'servido', 'cancelado') then
    raise exception 'Estado inválido';
  end if;
  select * into d from public.central_supply_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if d.local_central_id is distinct from public.current_local_id() then
    raise exception 'Solo la cocina central de este pedido puede cambiar el estado';
  end if;
  update public.central_supply_orders
  set estado = p_estado, updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.cc_update_supply_order_estado(uuid, text) from public;
grant execute on function public.cc_update_supply_order_estado(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.central_supply_orders enable row level security;
alter table public.central_supply_order_items enable row level security;

drop policy if exists cc_supply_orders_select on public.central_supply_orders;
create policy cc_supply_orders_select on public.central_supply_orders
for select to authenticated
using (
  local_solicitante_id = public.current_local_id()
  or local_central_id = public.current_local_id()
);

-- Sin insert/update/delete directo salvo RPC; coherencia vía funciones SECURITY DEFINER

drop policy if exists cc_supply_items_select on public.central_supply_order_items;
create policy cc_supply_items_select on public.central_supply_order_items
for select to authenticated
using (
  exists (
    select 1 from public.central_supply_orders o
    where o.id = central_supply_order_items.order_id
      and (
        o.local_solicitante_id = public.current_local_id()
        or o.local_central_id = public.current_local_id()
      )
  )
);

-- Si la tabla ya existía sin etiquetas:
alter table public.central_supply_orders add column if not exists local_solicitante_label text;
alter table public.central_supply_orders add column if not exists local_central_label text;
