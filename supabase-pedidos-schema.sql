-- Pedidos module schema (multi-local)
-- Run this in Supabase SQL Editor

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

alter table public.purchase_order_items
  add column if not exists estimated_kg_per_unit numeric(10,3);
alter table public.purchase_order_items
  add column if not exists received_weight_kg numeric(10,3);
alter table public.purchase_order_items
  add column if not exists received_price_per_kg numeric(10,4);
