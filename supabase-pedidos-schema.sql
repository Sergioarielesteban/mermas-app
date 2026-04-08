-- Pedidos module schema (multi-local)
-- Run this in Supabase SQL Editor

create table if not exists public.pedido_suppliers (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  contact text not null default '',
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
  unit text not null check (unit in ('kg', 'ud', 'bolsa', 'racion')),
  price_per_unit numeric(10,2) not null check (price_per_unit >= 0),
  vat_rate numeric(6,4) not null default 0 check (vat_rate >= 0 and vat_rate <= 1),
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
  unit text not null check (unit in ('kg', 'ud', 'bolsa', 'racion')),
  quantity numeric(10,2) not null check (quantity >= 0),
  received_quantity numeric(10,2) not null default 0 check (received_quantity >= 0),
  price_per_unit numeric(10,2) not null check (price_per_unit >= 0),
  vat_rate numeric(6,4) not null default 0 check (vat_rate >= 0 and vat_rate <= 1),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_order_items_local_id on public.purchase_order_items(local_id);
create index if not exists idx_purchase_order_items_order_id on public.purchase_order_items(order_id);

-- Safe migrations for existing databases
alter table public.pedido_supplier_products
  add column if not exists vat_rate numeric(6,4) not null default 0;

alter table public.purchase_order_items
  add column if not exists vat_rate numeric(6,4) not null default 0;

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
