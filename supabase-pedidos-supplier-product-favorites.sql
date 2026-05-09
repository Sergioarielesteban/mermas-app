-- Favoritos por usuario para productos de catálogo (nuevo pedido).
-- El producto ya pertenece a un proveedor (`pedido_supplier_products.supplier_id`); en la app se filtran por proveedor activo.
-- Ejecutar en Supabase SQL Editor tras el schema base de pedidos.

create table if not exists public.supplier_product_favorites (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_product_id uuid not null references public.pedido_supplier_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  sort_order int,
  unique (user_id, supplier_product_id)
);

create index if not exists idx_supplier_product_favorites_local_id
  on public.supplier_product_favorites(local_id);
create index if not exists idx_supplier_product_favorites_user_id
  on public.supplier_product_favorites(user_id);
create index if not exists idx_supplier_product_favorites_product_id
  on public.supplier_product_favorites(supplier_product_id);

alter table public.supplier_product_favorites enable row level security;

drop policy if exists "supplier_product_favorites same local user read" on public.supplier_product_favorites;
create policy "supplier_product_favorites same local user read"
on public.supplier_product_favorites
for select
to authenticated
using (
  local_id = public.current_local_id()
  and user_id = auth.uid()
);

drop policy if exists "supplier_product_favorites same local user write" on public.supplier_product_favorites;
create policy "supplier_product_favorites same local user write"
on public.supplier_product_favorites
for all
to authenticated
using (
  local_id = public.current_local_id()
  and user_id = auth.uid()
)
with check (
  local_id = public.current_local_id()
  and user_id = auth.uid()
);

-- Últimos productos recibidos por proveedor (recepciones reales).
create or replace function public.pedidos_catalog_last_purchased(
  p_local_id uuid,
  p_supplier_id uuid,
  p_limit int default 20
)
returns table (supplier_product_id uuid, last_received_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select poi.supplier_product_id,
         max(coalesce(po.received_at, po.updated_at)) as last_received_at
  from purchase_order_items poi
  inner join purchase_orders po on po.id = poi.order_id
  where po.local_id = p_local_id
    and po.supplier_id = p_supplier_id
    and po.status = 'received'
    and poi.supplier_product_id is not null
  group by poi.supplier_product_id
  order by max(coalesce(po.received_at, po.updated_at)) desc nulls last
  limit greatest(p_limit, 1);
$$;

-- Top cantidades recibidas en ventana de días (hábitos del local).
create or replace function public.pedidos_catalog_most_purchased(
  p_local_id uuid,
  p_supplier_id uuid,
  p_days int default 60,
  p_limit int default 50
)
returns table (supplier_product_id uuid, total_received numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select poi.supplier_product_id,
         sum(poi.received_quantity)::numeric as total_received
  from purchase_order_items poi
  inner join purchase_orders po on po.id = poi.order_id
  where po.local_id = p_local_id
    and po.supplier_id = p_supplier_id
    and po.status = 'received'
    and poi.supplier_product_id is not null
    and coalesce(po.received_at, po.updated_at) >= now() - (interval '1 day' * greatest(p_days, 1))
  group by poi.supplier_product_id
  order by sum(poi.received_quantity) desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.pedidos_catalog_last_purchased(uuid, uuid, int) to authenticated;
grant execute on function public.pedidos_catalog_most_purchased(uuid, uuid, int, int) to authenticated;
