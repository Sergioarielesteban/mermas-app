-- Cocina central: producción, lotes, stock por ubicación, entregas, trazabilidad, incidencias
-- Requiere: public.locals, public.profiles, public.products, public.current_local_id(), public.set_updated_at()
-- 1) Marca qué local es cocina central (ej. UPDATE locals SET is_central_kitchen = true WHERE code = 'CENTRAL';)

alter table public.locals
  add column if not exists is_central_kitchen boolean not null default false;

-- ---------------------------------------------------------------------------
-- Contador diario para códigos de lote
-- ---------------------------------------------------------------------------
create table if not exists public.cc_lote_counters (
  local_id uuid not null references public.locals(id) on delete cascade,
  day date not null,
  seq integer not null default 0,
  primary key (local_id, day)
);

-- ---------------------------------------------------------------------------
-- Órdenes de producción (cocina central)
-- ---------------------------------------------------------------------------
create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  local_central_id uuid not null references public.locals(id) on delete restrict,
  fecha date not null default ((timezone('Europe/Madrid', now()))::date),
  cantidad_objetivo numeric(14,4) not null check (cantidad_objetivo > 0),
  estado text not null default 'borrador' check (estado in ('borrador', 'en_curso', 'completada', 'cancelada')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_orders_local on public.production_orders(local_central_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Lotes
-- ---------------------------------------------------------------------------
create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid references public.production_orders(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  local_central_id uuid not null references public.locals(id) on delete restrict,
  codigo_lote text not null unique,
  fecha_elaboracion date not null,
  fecha_caducidad date,
  cantidad_producida numeric(14,4) not null check (cantidad_producida > 0),
  unidad text not null check (unidad in ('kg', 'ud', 'bolsa', 'racion')),
  estado text not null default 'disponible' check (
    estado in (
      'disponible', 'abierto', 'consumido', 'congelado', 'descongelado',
      'expedido', 'bloqueado', 'retirado'
    )
  ),
  qr_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_batches_central on public.production_batches(local_central_id);
create index if not exists idx_batches_qr on public.production_batches(qr_token);
create index if not exists idx_batches_product on public.production_batches(product_id);

-- ---------------------------------------------------------------------------
-- Trazabilidad ingredientes (hacia atrás)
-- ---------------------------------------------------------------------------
create table if not exists public.batch_ingredient_trace (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  ingredient_product_id uuid not null references public.products(id) on delete restrict,
  cantidad numeric(14,4) not null check (cantidad > 0),
  unidad text not null check (unidad in ('kg', 'ud', 'bolsa', 'racion')),
  created_at timestamptz not null default now()
);

create index if not exists idx_batch_ing_trace_batch on public.batch_ingredient_trace(batch_id);

-- ---------------------------------------------------------------------------
-- Stock físico por lote y local (misma fila = cantidad en ese local)
-- ---------------------------------------------------------------------------
create table if not exists public.batch_stock (
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  local_id uuid not null references public.locals(id) on delete cascade,
  cantidad numeric(14,4) not null check (cantidad >= 0),
  updated_at timestamptz not null default now(),
  primary key (batch_id, local_id)
);

create index if not exists idx_batch_stock_local on public.batch_stock(local_id);

-- ---------------------------------------------------------------------------
-- Entregas
-- ---------------------------------------------------------------------------
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  local_origen_id uuid not null references public.locals(id) on delete restrict,
  local_destino_id uuid not null references public.locals(id) on delete restrict,
  fecha date not null default ((timezone('Europe/Madrid', now()))::date),
  estado text not null default 'borrador' check (
    estado in ('borrador', 'preparado', 'en_reparto', 'entregado', 'firmado', 'cancelado')
  ),
  firmado boolean not null default false,
  firma_url text,
  signature_data_url text,
  nombre_receptor text,
  -- Denormalizado: RLS de locals solo permite leer el propio local; PDF y destino usan estas etiquetas.
  local_origen_label text,
  local_destino_label text,
  created_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (local_origen_id is distinct from local_destino_id)
);

create index if not exists idx_deliveries_origen on public.deliveries(local_origen_id, fecha desc);
create index if not exists idx_deliveries_destino on public.deliveries(local_destino_id, fecha desc);

create table if not exists public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  batch_id uuid not null references public.production_batches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  cantidad numeric(14,4) not null check (cantidad > 0),
  unidad text not null check (unidad in ('kg', 'ud', 'bolsa', 'racion')),
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_items_delivery on public.delivery_items(delivery_id);

-- ---------------------------------------------------------------------------
-- Movimientos de inventario por lote
-- ---------------------------------------------------------------------------
create table if not exists public.batch_movements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  local_from uuid references public.locals(id) on delete set null,
  local_to uuid references public.locals(id) on delete set null,
  cantidad numeric(14,4) not null check (cantidad > 0),
  movimiento_en timestamptz not null default now(),
  tipo text not null check (
    tipo in (
      'produccion', 'transferencia_salida', 'transferencia_entrega',
      'ajuste_apertura', 'ajuste_consumo', 'entrega_salida', 'entrega_entrada',
      'incidencia'
    )
  ),
  delivery_id uuid references public.deliveries(id) on delete set null,
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_batch_mov_batch on public.batch_movements(batch_id, movimiento_en desc);

-- ---------------------------------------------------------------------------
-- Incidencias de trazabilidad
-- ---------------------------------------------------------------------------
create table if not exists public.traceability_incidents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  tipo text not null,
  descripcion text,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trace_inc_batch on public.traceability_incidents(batch_id);

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_production_orders_u on public.production_orders;
create trigger trg_production_orders_u before update on public.production_orders
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_production_batches_u on public.production_batches;
create trigger trg_production_batches_u before update on public.production_batches
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_deliveries_u on public.deliveries;
create trigger trg_deliveries_u before update on public.deliveries
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_trace_inc_u on public.traceability_incidents;
create trigger trg_trace_inc_u before update on public.traceability_incidents
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.profile_local_is_central()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(l.is_central_kitchen, false)
  from public.profiles p
  join public.locals l on l.id = p.local_id
  where p.user_id = auth.uid()
  limit 1
$$;

-- Encargados en cocina central: pueden crear/gestionar entregas salientes (admin o manager).
create or replace function public.profile_can_manage_central_shipments()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.locals l on l.id = p.local_id
    where p.user_id = auth.uid()
      and coalesce(l.is_central_kitchen, false)
      and lower(p.role) in ('admin', 'manager')
  );
$$;

-- App Cocina central: solo administrador o encargado (staff sin acceso al módulo).
create or replace function public.profile_can_access_cocina_central_module()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and lower(p.role) in ('admin', 'manager')
  );
$$;

-- Listado de locales destino para entregas (solo cocina central).
-- Nota: en un único proyecto Supabase por cadena, todos los locals activos son candidatos.
-- Si conviven varios clientes en un proyecto, añade organization_id y filtra aquí.
create or replace function public.cc_list_delivery_destinations()
returns table (id uuid, code text, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.profile_can_manage_central_shipments() then
    raise exception 'Solo administradores o encargados de cocina central pueden listar destinos';
  end if;
  return query
  select l.id, l.code, l.name
  from public.locals l
  where coalesce(l.is_active, true)
    and l.id is distinct from public.current_local_id()
  order by l.name asc, l.code asc;
end;
$$;

revoke all on function public.cc_list_delivery_destinations() from public;
grant execute on function public.cc_list_delivery_destinations() to authenticated;

create or replace function public.cc_next_codigo_lote(p_local uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  d date := (timezone('Europe/Madrid', now()))::date;
  n int;
  pref text := to_char(d, 'YYYYMMDD');
begin
  insert into public.cc_lote_counters (local_id, day, seq)
  values (p_local, d, 1)
  on conflict (local_id, day) do update
  set seq = public.cc_lote_counters.seq + 1
  returning seq into n;

  return 'CC-' || pref || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: crear lote + stock inicial (producción)
-- ---------------------------------------------------------------------------
create or replace function public.cc_register_production_batch(
  p_order_id uuid,
  p_product_id uuid,
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

  v_code := public.cc_next_codigo_lote(p_local_central_id);

  insert into public.production_batches (
    production_order_id, product_id, local_central_id, codigo_lote,
    fecha_elaboracion, fecha_caducidad, cantidad_producida, unidad, estado
  ) values (
    p_order_id, p_product_id, p_local_central_id, v_code,
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

  -- ingredientes opcionales: [{ "product_id": "uuid", "cantidad": 1, "unidad": "kg" }, ...]
  if p_ingredients is not null and jsonb_typeof(p_ingredients) = 'array' then
    insert into public.batch_ingredient_trace (batch_id, ingredient_product_id, cantidad, unidad)
    select
      v_batch_id,
      (x->>'product_id')::uuid,
      (x->>'cantidad')::numeric,
      coalesce(x->>'unidad', p_unidad)
    from jsonb_array_elements(p_ingredients) x
    where (x->>'product_id') is not null and (x->>'cantidad') is not null;
  end if;

  return v_batch_id;
end;
$$;

revoke all on function public.cc_register_production_batch(uuid, uuid, uuid, date, date, numeric, text, jsonb) from public;
grant execute on function public.cc_register_production_batch(uuid, uuid, uuid, date, date, numeric, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: confirmar entrega — ÚNICO momento que mueve stock (central -> destino)
-- ---------------------------------------------------------------------------
create or replace function public.cc_confirm_delivery_dispatch(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  d record;
  it record;
  v_orig numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.profile_can_manage_central_shipments() then
    raise exception 'Solo administradores o encargados pueden confirmar la salida';
  end if;

  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Entrega no encontrada'; end if;
  if d.local_origen_id is distinct from public.current_local_id() then
    raise exception 'Solo el origen puede confirmar la salida';
  end if;
  if d.estado in ('entregado', 'firmado', 'cancelado') then
    raise exception 'Estado de entrega no permite confirmar';
  end if;
  if d.estado not in ('preparado', 'en_reparto') then
    raise exception 'La entrega debe estar preparada o en reparto';
  end if;

  for it in select * from public.delivery_items where delivery_id = p_delivery_id loop
    select coalesce(cantidad, 0) into v_orig
    from public.batch_stock
    where batch_id = it.batch_id and local_id = d.local_origen_id;

    if v_orig < it.cantidad then
      raise exception 'Stock insuficiente para lote % en origen', it.batch_id;
    end if;

    update public.batch_stock
    set cantidad = cantidad - it.cantidad, updated_at = now()
    where batch_id = it.batch_id and local_id = d.local_origen_id;

    insert into public.batch_stock (batch_id, local_id, cantidad)
    values (it.batch_id, d.local_destino_id, it.cantidad)
    on conflict (batch_id, local_id) do update
    set cantidad = batch_stock.cantidad + excluded.cantidad, updated_at = now();

    insert into public.batch_movements (
      batch_id, local_from, local_to, cantidad, tipo, delivery_id, created_by
    ) values (
      it.batch_id, d.local_origen_id, d.local_destino_id, it.cantidad,
      'transferencia_entrega', p_delivery_id, v_uid
    );
  end loop;

  update public.production_batches b
  set estado = 'expedido', updated_at = now()
  where b.local_central_id = d.local_origen_id
    and exists (
      select 1 from public.delivery_items di
      where di.delivery_id = p_delivery_id and di.batch_id = b.id
    )
    and not exists (
      select 1 from public.batch_stock s
      where s.batch_id = b.id
        and s.local_id = d.local_origen_id
        and s.cantidad > 0
    );

  update public.deliveries
  set estado = 'entregado', confirmed_at = now(), updated_at = now()
  where id = p_delivery_id;
end;
$$;

revoke all on function public.cc_confirm_delivery_dispatch(uuid) from public;
grant execute on function public.cc_confirm_delivery_dispatch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: firma en destino (no mueve stock)
-- ---------------------------------------------------------------------------
create or replace function public.cc_sign_delivery_receipt(
  p_delivery_id uuid,
  p_nombre_receptor text,
  p_signature_data_url text,
  p_firma_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  d record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.profile_can_access_cocina_central_module() then
    raise exception 'Solo administradores o encargados pueden firmar albaranes';
  end if;
  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Entrega no encontrada'; end if;
  if d.local_destino_id is distinct from public.current_local_id() then
    raise exception 'Solo el local destinatario puede firmar';
  end if;
  if d.estado is distinct from 'entregado' then
    raise exception 'La entrega debe estar en estado entregado';
  end if;

  update public.deliveries
  set
    firmado = true,
    nombre_receptor = nullif(trim(p_nombre_receptor), ''),
    signature_data_url = p_signature_data_url,
    firma_url = p_firma_url,
    estado = 'firmado',
    updated_at = now()
  where id = p_delivery_id;
end;
$$;

revoke all on function public.cc_sign_delivery_receipt(uuid, text, text, text) from public;
grant execute on function public.cc_sign_delivery_receipt(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: actualizar estado de lote (central o local con stock)
-- ---------------------------------------------------------------------------
create or replace function public.cc_set_batch_estado(p_batch_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.profile_can_access_cocina_central_module() then
    raise exception 'Solo administradores o encargados pueden cambiar el estado del lote';
  end if;
  if not exists (
    select 1 from public.batch_stock s
    where s.batch_id = p_batch_id and s.local_id = public.current_local_id() and s.cantidad > 0
  ) and not exists (
    select 1 from public.production_batches b
    where b.id = p_batch_id and b.local_central_id = public.current_local_id()
  ) then
    raise exception 'Sin acceso a este lote';
  end if;
  if p_estado not in (
    'disponible', 'abierto', 'consumido', 'congelado', 'descongelado',
    'expedido', 'bloqueado', 'retirado'
  ) then
    raise exception 'Estado inválido';
  end if;
  update public.production_batches set estado = p_estado, updated_at = now() where id = p_batch_id;
end;
$$;

revoke all on function public.cc_set_batch_estado(uuid, text) from public;
grant execute on function public.cc_set_batch_estado(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.production_orders enable row level security;
alter table public.production_batches enable row level security;
alter table public.batch_ingredient_trace enable row level security;
alter table public.batch_stock enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_items enable row level security;
alter table public.batch_movements enable row level security;
alter table public.traceability_incidents enable row level security;

-- production_orders: central del usuario
drop policy if exists cc_prod_orders_rw on public.production_orders;
create policy cc_prod_orders_rw on public.production_orders
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

-- batches: ver si soy central que lo creó o tengo stock en mi local
drop policy if exists cc_batches_select on public.production_batches;
create policy cc_batches_select on public.production_batches
for select to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and (
    local_central_id = public.current_local_id()
    or exists (
      select 1 from public.batch_stock s
      where s.batch_id = production_batches.id and s.local_id = public.current_local_id()
    )
  )
);

drop policy if exists cc_batches_central_all on public.production_batches;
drop policy if exists cc_batches_insert on public.production_batches;
drop policy if exists cc_batches_update on public.production_batches;
drop policy if exists cc_batches_delete on public.production_batches;

create policy cc_batches_insert on public.production_batches
for insert to authenticated
with check (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_batches_update on public.production_batches
for update to authenticated
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

create policy cc_batches_delete on public.production_batches
for delete to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

-- ingredient trace
drop policy if exists cc_bit_select on public.batch_ingredient_trace;
create policy cc_bit_select on public.batch_ingredient_trace
for select to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.production_batches b
    where b.id = batch_ingredient_trace.batch_id
    and (
      b.local_central_id = public.current_local_id()
      or exists (
        select 1 from public.batch_stock s
        where s.batch_id = b.id and s.local_id = public.current_local_id()
      )
    )
  )
);

drop policy if exists cc_bit_write on public.batch_ingredient_trace;
drop policy if exists cc_bit_insert on public.batch_ingredient_trace;
drop policy if exists cc_bit_update on public.batch_ingredient_trace;
drop policy if exists cc_bit_delete on public.batch_ingredient_trace;

create policy cc_bit_insert on public.batch_ingredient_trace
for insert to authenticated
with check (
  exists (
    select 1 from public.production_batches b
    where b.id = batch_ingredient_trace.batch_id
      and b.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
  )
  and public.profile_can_access_cocina_central_module()
);

create policy cc_bit_update on public.batch_ingredient_trace
for update to authenticated
using (
  exists (
    select 1 from public.production_batches b
    where b.id = batch_ingredient_trace.batch_id
      and b.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
  )
  and public.profile_can_access_cocina_central_module()
)
with check (
  exists (
    select 1 from public.production_batches b
    where b.id = batch_ingredient_trace.batch_id
      and b.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
  )
  and public.profile_can_access_cocina_central_module()
);

create policy cc_bit_delete on public.batch_ingredient_trace
for delete to authenticated
using (
  exists (
    select 1 from public.production_batches b
    where b.id = batch_ingredient_trace.batch_id
      and b.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
  )
  and public.profile_can_access_cocina_central_module()
);

-- batch_stock
drop policy if exists cc_stock_select on public.batch_stock;
create policy cc_stock_select on public.batch_stock
for select to authenticated
using (
  local_id = public.current_local_id()
  and public.profile_can_access_cocina_central_module()
);

drop policy if exists cc_stock_no_direct on public.batch_stock;
-- Sin inserts directos salvo RPC interno; permitimos upsert solo vía service o RPC.
-- Política mínima: nadie inserta desde cliente; solo SECURITY DEFINER RPC.
-- Excepción: lectura. Escritura vía cc_confirm y cc_register.

-- deliveries
drop policy if exists cc_deliveries_select on public.deliveries;
create policy cc_deliveries_select on public.deliveries
for select to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and (
    local_origen_id = public.current_local_id()
    or local_destino_id = public.current_local_id()
  )
);

drop policy if exists cc_deliveries_insert on public.deliveries;
create policy cc_deliveries_insert on public.deliveries
for insert to authenticated
with check (
  local_origen_id = public.current_local_id()
  and public.profile_can_manage_central_shipments()
  and public.profile_can_access_cocina_central_module()
);

drop policy if exists cc_deliveries_update_origin on public.deliveries;
create policy cc_deliveries_update_origin on public.deliveries
for update to authenticated
using (
  local_origen_id = public.current_local_id()
  and public.profile_can_manage_central_shipments()
  and public.profile_can_access_cocina_central_module()
)
with check (local_origen_id = public.current_local_id());

drop policy if exists cc_deliveries_update_dest on public.deliveries;
create policy cc_deliveries_update_dest on public.deliveries
for update to authenticated
using (
  local_destino_id = public.current_local_id()
  and public.profile_can_access_cocina_central_module()
)
with check (local_destino_id = public.current_local_id());

-- delivery_items
drop policy if exists cc_di_all on public.delivery_items;
drop policy if exists cc_di_select on public.delivery_items;
drop policy if exists cc_di_insert on public.delivery_items;
drop policy if exists cc_di_update on public.delivery_items;
drop policy if exists cc_di_delete on public.delivery_items;

create policy cc_di_select on public.delivery_items
for select to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and (
        d.local_origen_id = public.current_local_id()
        or d.local_destino_id = public.current_local_id()
      )
  )
);

create policy cc_di_insert on public.delivery_items
for insert to authenticated
with check (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and d.local_origen_id = public.current_local_id()
      and public.profile_can_manage_central_shipments()
  )
);

create policy cc_di_update on public.delivery_items
for update to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and d.local_origen_id = public.current_local_id()
      and public.profile_can_manage_central_shipments()
  )
)
with check (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and d.local_origen_id = public.current_local_id()
      and public.profile_can_manage_central_shipments()
  )
);

create policy cc_di_delete on public.delivery_items
for delete to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and d.local_origen_id = public.current_local_id()
      and public.profile_can_manage_central_shipments()
  )
);

-- movements: lectura si involucra mi local
drop policy if exists cc_mov_select on public.batch_movements;
create policy cc_mov_select on public.batch_movements
for select to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and (
    local_from = public.current_local_id()
    or local_to = public.current_local_id()
  )
);

-- incidents
drop policy if exists cc_inc_select on public.traceability_incidents;
create policy cc_inc_select on public.traceability_incidents
for select to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.production_batches b
    where b.id = traceability_incidents.batch_id
    and (
      b.local_central_id = public.current_local_id()
      or exists (
        select 1 from public.batch_stock s
        where s.batch_id = b.id and s.local_id = public.current_local_id()
      )
    )
  )
);

drop policy if exists cc_inc_write on public.traceability_incidents;
create policy cc_inc_write on public.traceability_incidents
for all to authenticated
using (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.production_batches b
    where b.id = traceability_incidents.batch_id
      and (
        (
          public.profile_local_is_central()
          and b.local_central_id = public.current_local_id()
        )
        or exists (
          select 1 from public.batch_stock s
          where s.batch_id = b.id
            and s.local_id = public.current_local_id()
            and s.cantidad > 0
        )
      )
  )
)
with check (
  public.profile_can_access_cocina_central_module()
  and exists (
    select 1 from public.production_batches b
    where b.id = traceability_incidents.batch_id
      and (
        (
          public.profile_local_is_central()
          and b.local_central_id = public.current_local_id()
        )
        or exists (
          select 1 from public.batch_stock s
          where s.batch_id = b.id
            and s.local_id = public.current_local_id()
            and s.cantidad > 0
        )
      )
  )
);

-- Si `deliveries` ya existía sin etiquetas de nombre:
alter table public.deliveries add column if not exists local_origen_label text;
alter table public.deliveries add column if not exists local_destino_label text;
