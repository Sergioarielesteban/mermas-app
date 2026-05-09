-- Señales para Nuevo pedido: última recepción por producto + frecuencia de pedidos (30 días).
-- Ejecutar en Supabase tras `supabase-pedidos-supplier-product-favorites.sql`.

-- Última línea de recepción por producto (cantidad pedida, precio real unitario en recepción, fecha).
create or replace function public.pedidos_catalog_last_reception_context(
  p_local_id uuid,
  p_supplier_id uuid,
  p_limit int default 80
)
returns table (
  supplier_product_id uuid,
  last_at timestamptz,
  last_qty numeric,
  last_received_unit_price numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with ranked as (
    select
      poi.supplier_product_id,
      coalesce(po.received_at, po.updated_at) as la,
      poi.quantity as lqty,
      poi.price_per_unit as pup,
      row_number() over (
        partition by poi.supplier_product_id
        order by coalesce(po.received_at, po.updated_at) desc nulls last
      ) as rn
    from purchase_order_items poi
    inner join purchase_orders po on po.id = poi.order_id
    where po.local_id = p_local_id
      and po.supplier_id = p_supplier_id
      and po.status = 'received'
      and poi.supplier_product_id is not null
  )
  select supplier_product_id, la as last_at, lqty as last_qty, pup as last_received_unit_price
  from ranked
  where rn = 1
  order by la desc nulls last
  limit greatest(p_limit, 1);
$$;

-- Veces que el producto aparece en pedidos distintos (enviados o recibidos), ventana 30 días.
create or replace function public.pedidos_catalog_order_frequency_30d(
  p_local_id uuid,
  p_supplier_id uuid,
  p_limit int default 60
)
returns table (
  supplier_product_id uuid,
  order_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    poi.supplier_product_id,
    count(distinct po.id)::bigint as order_count
  from purchase_order_items poi
  inner join purchase_orders po on po.id = poi.order_id
  where po.local_id = p_local_id
    and po.supplier_id = p_supplier_id
    and poi.supplier_product_id is not null
    and poi.quantity > 0
    and po.status in ('sent', 'received')
    and coalesce(po.sent_at, po.created_at) >= now() - interval '30 days'
  group by poi.supplier_product_id
  order by count(distinct po.id) desc, sum(poi.quantity) desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.pedidos_catalog_last_reception_context(uuid, uuid, int) to authenticated;
grant execute on function public.pedidos_catalog_order_frequency_30d(uuid, uuid, int) to authenticated;
