-- Unificación de proveedores hacia SERHS S.L. (sin borrar históricos)
-- Proveedores origen:
-- - DDI PROVEA SL
-- - DISTERRI
-- - COCACOLA
-- - DAMM BARRIL
-- Proveedor destino:
-- - SERHS S.L.
--
-- Idempotente y seguro: migra referencias y desactiva proveedores origen.

begin;

alter table public.pedido_suppliers
  add column if not exists is_active boolean not null default true;

create index if not exists idx_pedido_suppliers_local_active
  on public.pedido_suppliers(local_id, is_active, name);

with supplier_name_map as (
  select unnest(array['DDI PROVEA SL', 'DISTERRI', 'COCACOLA', 'DAMM BARRIL']) as old_name
),
targets as (
  select
    s.local_id,
    s.id as serhs_id
  from public.pedido_suppliers s
  where upper(trim(s.name)) = 'SERHS S.L.'
),
old_suppliers as (
  select
    s.local_id,
    s.id as old_supplier_id,
    t.serhs_id
  from public.pedido_suppliers s
  join supplier_name_map m
    on upper(trim(s.name)) = m.old_name
  join targets t
    on t.local_id = s.local_id
  where s.id <> t.serhs_id
),
moved_products as (
  update public.pedido_supplier_products psp
  set supplier_id = os.serhs_id
  from old_suppliers os
  where psp.local_id = os.local_id
    and psp.supplier_id = os.old_supplier_id
  returning psp.id, psp.local_id, os.serhs_id
),
moved_orders as (
  update public.purchase_orders po
  set supplier_id = os.serhs_id
  from old_suppliers os
  where po.local_id = os.local_id
    and po.supplier_id = os.old_supplier_id
  returning po.id
),
moved_delivery_notes as (
  update public.delivery_notes dn
  set supplier_id = os.serhs_id
  from old_suppliers os
  where dn.local_id = os.local_id
    and dn.supplier_id = os.old_supplier_id
  returning dn.id
),
moved_exceptions as (
  update public.pedido_supplier_delivery_exceptions ex
  set supplier_id = os.serhs_id
  from old_suppliers os
  where ex.local_id = os.local_id
    and ex.supplier_id = os.old_supplier_id
  returning ex.id
),
moved_preferred_articles as (
  update public.purchase_articles pa
  set proveedor_preferido_id = os.serhs_id
  from old_suppliers os
  where pa.local_id = os.local_id
    and pa.proveedor_preferido_id = os.old_supplier_id
  returning pa.id
),
synced_inventory_from_product as (
  update public.inventory_items i
  set supplier_id = psp.supplier_id
  from public.pedido_supplier_products psp
  where i.local_id = psp.local_id
    and i.supplier_product_id = psp.id
    and i.supplier_id is distinct from psp.supplier_id
  returning i.id
),
synced_inventory_direct as (
  update public.inventory_items i
  set supplier_id = os.serhs_id
  from old_suppliers os
  where i.local_id = os.local_id
    and i.supplier_id = os.old_supplier_id
  returning i.id
)
update public.pedido_suppliers s
set is_active = false
from old_suppliers os
where s.local_id = os.local_id
  and s.id = os.old_supplier_id;

commit;
