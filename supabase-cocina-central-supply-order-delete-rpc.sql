-- Eliminación definitiva de pedidos de suministro sede → central (pruebas / errores).
-- Las líneas `central_supply_order_items` se borran en cascada.
-- Requiere el mismo permiso que actualizar estado: profile_can_manage_central_shipments().

create or replace function public.cc_delete_supply_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.profile_can_manage_central_shipments() then
    raise exception 'Sin permiso para eliminar pedidos';
  end if;
  select * into d from public.central_supply_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if d.local_central_id is distinct from public.current_local_id() then
    raise exception 'Solo la cocina central de este pedido puede eliminarlo';
  end if;
  -- CASCADE en líneas: basta con borrar el pedido
  delete from public.central_supply_orders where id = p_order_id;
end;
$$;

revoke all on function public.cc_delete_supply_order(uuid) from public;
grant execute on function public.cc_delete_supply_order(uuid) to authenticated;
