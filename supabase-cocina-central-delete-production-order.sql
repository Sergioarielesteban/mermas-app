-- Eliminar orden de producción (solo cancelada o completada) y lotes vinculados.
-- No elimina si algún lote de la orden tiene líneas en delivery_items.
create or replace function public.cc_delete_production_order_central(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local uuid;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.profile_can_access_cocina_central_module() then
    raise exception 'Sin permiso para cocina central';
  end if;
  if not public.profile_local_is_central() then
    raise exception 'Solo cocina central puede eliminar órdenes de producción';
  end if;

  select local_central_id, estado
    into v_local, v_estado
  from public.production_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  if v_local is distinct from public.current_local_id() then
    raise exception 'La orden no pertenece a tu cocina central';
  end if;

  if v_estado not in ('cancelada', 'completada') then
    raise exception 'Solo se pueden eliminar órdenes canceladas o completadas';
  end if;

  if exists (
    select 1
    from public.delivery_items di
    inner join public.production_batches b on b.id = di.batch_id
    where b.production_order_id = p_order_id
  ) then
    raise exception 'No se puede eliminar: el lote está vinculado a entregas.';
  end if;

  delete from public.production_batches
  where production_order_id = p_order_id;

  delete from public.production_orders
  where id = p_order_id;
end;
$$;

revoke all on function public.cc_delete_production_order_central(uuid) from public;
grant execute on function public.cc_delete_production_order_central(uuid) to authenticated;

comment on function public.cc_delete_production_order_central(uuid) is
  'Elimina orden de producción y lotes asociados (stock/movimientos en cascada). Requiere estado cancelada o completada.';
