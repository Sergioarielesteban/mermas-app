-- Agenda operativa de pedidos: cortes por proveedor y productos a revisar antes de pedir.
-- Ejecutar en Supabase SQL Editor tras el esquema base de pedidos.

create table if not exists public.pedido_supplier_order_schedules (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  supplier_id uuid not null references public.pedido_suppliers(id) on delete cascade,
  enabled boolean not null default false,
  /** Días en los que toca pedir (0=dom … 6=sáb, mismo criterio que Date.getDay). */
  order_weekdays smallint[] not null default '{}',
  cutoff_time time not null default '17:00:00',
  reminder_minutes_before integer not null default 30
    check (reminder_minutes_before >= 0 and reminder_minutes_before <= 1440),
  /** Días de entrega opcional (referencia; puede quedar vacío). */
  delivery_weekdays smallint[] null,
  /** mandatory = corte obligatorio; review = solo checklist «Revisar proveedores». */
  agenda_mode text not null default 'mandatory'
    check (agenda_mode in ('mandatory', 'review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, supplier_id)
);

create index if not exists idx_pedido_supplier_order_schedules_local
  on public.pedido_supplier_order_schedules(local_id);
create index if not exists idx_pedido_supplier_order_schedules_supplier
  on public.pedido_supplier_order_schedules(supplier_id);

create table if not exists public.pedido_supplier_review_items (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  supplier_id uuid not null references public.pedido_suppliers(id) on delete cascade,
  supplier_product_id uuid references public.pedido_supplier_products(id) on delete set null,
  product_name_snapshot text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pedido_supplier_review_items_local_supplier
  on public.pedido_supplier_review_items(local_id, supplier_id);

alter table public.pedido_supplier_order_schedules enable row level security;
alter table public.pedido_supplier_review_items enable row level security;

drop policy if exists "pedido supplier order schedules same local read" on public.pedido_supplier_order_schedules;
create policy "pedido supplier order schedules same local read"
on public.pedido_supplier_order_schedules
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedido supplier order schedules same local write" on public.pedido_supplier_order_schedules;
create policy "pedido supplier order schedules same local write"
on public.pedido_supplier_order_schedules
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "pedido supplier review items same local read" on public.pedido_supplier_review_items;
create policy "pedido supplier review items same local read"
on public.pedido_supplier_review_items
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedido supplier review items same local write" on public.pedido_supplier_review_items;
create policy "pedido supplier review items same local write"
on public.pedido_supplier_review_items
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
