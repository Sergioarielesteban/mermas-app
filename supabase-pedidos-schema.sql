-- Pedidos module schema (multi-local)
-- Run this in Supabase SQL Editor
--
-- Artículos base (purchase_articles) y vínculo article_id: ejecutar además
-- supabase-pedidos-migration-purchase-articles.sql cuando quieras esa capa.
-- Coste por unidad de uso + propagación desde catálogo: opcionalmente
-- supabase-pedidos-migration-master-article-usage-cost.sql

create table if not exists public.pedido_suppliers (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  contact text not null default '',
  /** Días de entrega 0=dom..6=sáb (Date.getDay). Vacío = cobertura 7 días en sugerencias. */
  delivery_cycle_weekdays smallint[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (local_id, name)
);

create index if not exists idx_pedido_suppliers_local_id on public.pedido_suppliers(local_id);

create table if not exists public.pedido_supplier_delivery_exceptions (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  supplier_id uuid not null references public.pedido_suppliers(id) on delete cascade,
  delivery_date date not null,
  reason text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (supplier_id, delivery_date)
);

create index if not exists idx_pedido_supplier_delivery_exceptions_local_id
  on public.pedido_supplier_delivery_exceptions(local_id);
create index if not exists idx_pedido_supplier_delivery_exceptions_supplier_id
  on public.pedido_supplier_delivery_exceptions(supplier_id);
create index if not exists idx_pedido_supplier_delivery_exceptions_date
  on public.pedido_supplier_delivery_exceptions(delivery_date);

create table if not exists public.pedido_supplier_products (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  supplier_id uuid not null references public.pedido_suppliers(id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')),
  price_per_unit numeric(10,2) not null check (price_per_unit >= 0),
  /** Piezas usables en receta por cada unidad de pedido (envase). 1 = el precio ya es por esa unidad. */
  units_per_pack numeric(12,4) not null default 1 check (units_per_pack > 0),
  /** Unidad en escandallo cuando units_per_pack > 1 (ej. ud). null si no aplica. */
  recipe_unit text check (
    recipe_unit is null
    or recipe_unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  ),
  vat_rate numeric(6,4) not null default 0 check (vat_rate >= 0 and vat_rate <= 1),
  par_stock numeric(10,2) not null default 0 check (par_stock >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_pedido_supplier_products_local_id on public.pedido_supplier_products(local_id);
create index if not exists idx_pedido_supplier_products_supplier_id on public.pedido_supplier_products(supplier_id);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  supplier_id uuid not null references public.pedido_suppliers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'sent', 'received')),
  notes text not null default '',
  delivery_date date,
  sent_at timestamptz,
  received_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_orders_local_id on public.purchase_orders(local_id);
create index if not exists idx_purchase_orders_status on public.purchase_orders(status);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  supplier_product_id uuid references public.pedido_supplier_products(id) on delete set null,
  product_name text not null,
  unit text not null check (unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')),
  quantity numeric(10,2) not null check (quantity >= 0),
  received_quantity numeric(10,2) not null default 0 check (received_quantity >= 0),
  price_per_unit numeric(10,2) not null check (price_per_unit >= 0),
  vat_rate numeric(6,4) not null default 0 check (vat_rate >= 0 and vat_rate <= 1),
  line_total numeric(12,2) not null check (line_total >= 0),
  incident_type text check (incident_type in ('missing', 'damaged', 'wrong-item')),
  incident_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_order_items_local_id on public.purchase_order_items(local_id);
create index if not exists idx_purchase_order_items_order_id on public.purchase_order_items(order_id);

-- Safe migrations for existing databases
alter table public.pedido_supplier_products
  add column if not exists vat_rate numeric(6,4) not null default 0;
alter table public.pedido_supplier_products
  add column if not exists par_stock numeric(10,2) not null default 0;

alter table public.purchase_order_items
  add column if not exists vat_rate numeric(6,4) not null default 0;
alter table public.purchase_orders
  add column if not exists delivery_date date;
alter table public.purchase_order_items
  add column if not exists incident_type text;
alter table public.purchase_order_items
  add column if not exists incident_notes text;
alter table public.purchase_orders
  add column if not exists price_review_archived_at timestamptz;

-- Precio unitario del pedido al crear/enviar; no se altera al cotejar albarán en Recepción (price_per_unit sí).
alter table public.purchase_order_items
  add column if not exists base_price_per_unit numeric(10,2);
update public.purchase_order_items
set base_price_per_unit = price_per_unit
where base_price_per_unit is null;

-- Align unit constraints with app units
alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_unit_check;
alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_unit_check
  check (unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja'));

alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_unit_check;
alter table public.purchase_order_items
  add constraint purchase_order_items_unit_check
  check (unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja'));

alter table public.pedido_suppliers enable row level security;
alter table public.pedido_supplier_delivery_exceptions enable row level security;
alter table public.pedido_supplier_products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists "pedido suppliers same local read" on public.pedido_suppliers;
create policy "pedido suppliers same local read"
on public.pedido_suppliers
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedido suppliers same local write" on public.pedido_suppliers;
create policy "pedido suppliers same local write"
on public.pedido_suppliers
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "pedido supplier products same local read" on public.pedido_supplier_products;
create policy "pedido supplier products same local read"
on public.pedido_supplier_products
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedido supplier delivery exceptions same local read" on public.pedido_supplier_delivery_exceptions;
create policy "pedido supplier delivery exceptions same local read"
on public.pedido_supplier_delivery_exceptions
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedido supplier delivery exceptions same local write" on public.pedido_supplier_delivery_exceptions;
create policy "pedido supplier delivery exceptions same local write"
on public.pedido_supplier_delivery_exceptions
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "pedido supplier products same local write" on public.pedido_supplier_products;
create policy "pedido supplier products same local write"
on public.pedido_supplier_products
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "purchase orders same local read" on public.purchase_orders;
create policy "purchase orders same local read"
on public.purchase_orders
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "purchase orders same local write" on public.purchase_orders;
create policy "purchase orders same local write"
on public.purchase_orders
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "purchase order items same local read" on public.purchase_order_items;
create policy "purchase order items same local read"
on public.purchase_order_items
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "purchase order items same local write" on public.purchase_order_items;
create policy "purchase order items same local write"
on public.purchase_order_items
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

alter table public.pedido_suppliers
  add column if not exists delivery_cycle_weekdays smallint[] not null default '{}';

create table if not exists public.pedido_supplier_delivery_exceptions (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  supplier_id uuid not null references public.pedido_suppliers(id) on delete cascade,
  delivery_date date not null,
  reason text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (supplier_id, delivery_date)
);

-- Bandeja/caja: kg estimado por envase en catálogo y kg reales en recepción (precio sigue en €/envase)
alter table public.pedido_supplier_products
  add column if not exists estimated_kg_per_unit numeric(10,3);

alter table public.pedido_supplier_products
  add column if not exists units_per_pack numeric(12,4) not null default 1;
alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_units_per_pack_chk;
alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_units_per_pack_chk
  check (units_per_pack > 0);
alter table public.pedido_supplier_products
  add column if not exists recipe_unit text;
alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_recipe_unit_check;
alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_recipe_unit_check
  check (
    recipe_unit is null
    or recipe_unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  );

-- Cobro en unidad distinta a la de pedido (ej. bandeja → €/kg).
alter table public.pedido_supplier_products
  add column if not exists billing_unit text;
alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_billing_unit_check;
alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_billing_unit_check
  check (
    billing_unit is null
    or billing_unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  );
alter table public.pedido_supplier_products
  add column if not exists billing_qty_per_order_unit numeric(12,4);
alter table public.pedido_supplier_products
  add column if not exists price_per_billing_unit numeric(12,4);
alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_billing_qty_chk;
alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_billing_qty_chk
  check (billing_qty_per_order_unit is null or billing_qty_per_order_unit > 0);
alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_price_billing_chk;
alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_price_billing_chk
  check (price_per_billing_unit is null or price_per_billing_unit >= 0);

alter table public.purchase_order_items
  add column if not exists estimated_kg_per_unit numeric(10,3);
alter table public.purchase_order_items
  add column if not exists received_weight_kg numeric(10,3);
alter table public.purchase_order_items
  add column if not exists received_price_per_kg numeric(10,4);

alter table public.purchase_order_items
  add column if not exists billing_unit text;
alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_billing_unit_check;
alter table public.purchase_order_items
  add constraint purchase_order_items_billing_unit_check
  check (
    billing_unit is null
    or billing_unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  );
alter table public.purchase_order_items
  add column if not exists billing_qty_per_order_unit numeric(12,4);
alter table public.purchase_order_items
  add column if not exists price_per_billing_unit numeric(12,4);

-- Concurrencia optimista (última actualización) en cabecera y líneas.
alter table public.purchase_orders
  add column if not exists updated_at timestamptz not null default now();
alter table public.purchase_order_items
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_purchase_orders_updated_at on public.purchase_orders;
create trigger trg_purchase_orders_updated_at
before update on public.purchase_orders
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_purchase_order_items_updated_at on public.purchase_order_items;
create trigger trg_purchase_order_items_updated_at
before update on public.purchase_order_items
for each row execute procedure public.set_updated_at();

alter table public.purchase_orders
  add column if not exists content_revised_after_sent_at timestamptz;

alter table public.purchase_orders
  add column if not exists usuario_nombre text;

alter table public.purchase_order_items
  add column if not exists exclude_from_price_evolution boolean not null default false;

-- Guardado atómico de pedido + líneas (evita cabecera sin líneas en fallos intermedios).
create or replace function public.save_purchase_order_with_items(
  p_order_id uuid,
  p_local_id uuid,
  p_supplier_id uuid,
  p_status text,
  p_notes text,
  p_sent_at timestamptz,
  p_delivery_date date,
  p_items jsonb,
  p_expected_order_updated_at timestamptz default null,
  p_mark_content_revised_after_sent boolean default false,
  p_usuario_nombre text default null
)
returns table(order_id uuid, order_updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_updated_at timestamptz;
  v_nombre text;
begin
  v_nombre := nullif(btrim(coalesce(p_usuario_nombre, '')), '');

  if p_status not in ('draft', 'sent', 'received') then
    raise exception 'Estado de pedido inválido';
  end if;

  if p_order_id is null then
    insert into public.purchase_orders (
      local_id,
      supplier_id,
      status,
      notes,
      sent_at,
      delivery_date,
      usuario_nombre
    ) values (
      p_local_id,
      p_supplier_id,
      p_status,
      btrim(coalesce(p_notes, '')),
      case when p_status = 'sent' then coalesce(p_sent_at, now()) else null end,
      p_delivery_date,
      v_nombre
    )
    returning id, updated_at into v_order_id, v_order_updated_at;
  else
    update public.purchase_orders
    set
      supplier_id = p_supplier_id,
      status = p_status,
      notes = btrim(coalesce(p_notes, '')),
      sent_at = case when p_status = 'sent' then coalesce(p_sent_at, now()) else null end,
      delivery_date = p_delivery_date,
      content_revised_after_sent_at = case
        when coalesce(p_mark_content_revised_after_sent, false) then now()
        when p_status = 'draft' then null
        else content_revised_after_sent_at
      end,
      usuario_nombre = coalesce(v_nombre, usuario_nombre)
    where id = p_order_id
      and local_id = p_local_id
      and (p_expected_order_updated_at is null or updated_at = p_expected_order_updated_at)
    returning id, updated_at into v_order_id, v_order_updated_at;

    if v_order_id is null then
      if exists (
        select 1
        from public.purchase_orders po
        where po.id = p_order_id
          and po.local_id = p_local_id
      ) then
        raise exception 'Order updated by another user (concurrency conflict)';
      end if;
      raise exception 'Pedido no encontrado o sin permisos para este local';
    end if;

    delete from public.purchase_order_items
    where order_id = v_order_id
      and local_id = p_local_id;
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' then
    raise exception 'p_items debe ser un array JSON';
  end if;

  insert into public.purchase_order_items (
    local_id,
    order_id,
    supplier_product_id,
    product_name,
    unit,
    quantity,
    received_quantity,
    price_per_unit,
    base_price_per_unit,
    vat_rate,
    line_total,
    estimated_kg_per_unit,
    received_weight_kg,
    received_price_per_kg,
    incident_type,
    incident_notes,
    billing_unit,
    billing_qty_per_order_unit,
    price_per_billing_unit,
    exclude_from_price_evolution
  )
  select
    p_local_id,
    v_order_id,
    i.supplier_product_id,
    i.product_name,
    i.unit,
    i.quantity,
    coalesce(i.received_quantity, 0),
    i.price_per_unit,
    i.base_price_per_unit,
    coalesce(i.vat_rate, 0),
    i.line_total,
    i.estimated_kg_per_unit,
    i.received_weight_kg,
    i.received_price_per_kg,
    i.incident_type,
    i.incident_notes,
    i.billing_unit,
    i.billing_qty_per_order_unit,
    i.price_per_billing_unit,
    coalesce(i.exclude_from_price_evolution, false)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(
    supplier_product_id uuid,
    product_name text,
    unit text,
    quantity numeric,
    received_quantity numeric,
    price_per_unit numeric,
    base_price_per_unit numeric,
    vat_rate numeric,
    line_total numeric,
    estimated_kg_per_unit numeric,
    received_weight_kg numeric,
    received_price_per_kg numeric,
    incident_type text,
    incident_notes text,
    billing_unit text,
    billing_qty_per_order_unit numeric,
    price_per_billing_unit numeric,
    exclude_from_price_evolution boolean
  );

  select updated_at into v_order_updated_at
  from public.purchase_orders
  where id = v_order_id;

  return query select v_order_id, v_order_updated_at;
end;
$$;

-- Unidades de pedido extra (docena, litro, ml, g): ampliar CHECK con
-- supabase-pedidos-order-units-migration.sql
