-- Excepciones de reparto por proveedor (festivos, cambios puntuales de semana).
-- Si una fecha está aquí, en Nuevo pedido se acepta como válida aunque no coincida
-- con el día habitual del ciclo semanal.

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

alter table public.pedido_supplier_delivery_exceptions enable row level security;

drop policy if exists "pedido supplier delivery exceptions same local read"
  on public.pedido_supplier_delivery_exceptions;
create policy "pedido supplier delivery exceptions same local read"
on public.pedido_supplier_delivery_exceptions
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedido supplier delivery exceptions same local write"
  on public.pedido_supplier_delivery_exceptions;
create policy "pedido supplier delivery exceptions same local write"
on public.pedido_supplier_delivery_exceptions
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
