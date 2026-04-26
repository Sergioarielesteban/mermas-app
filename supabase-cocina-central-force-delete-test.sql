-- Eliminación forzada (modo pruebas) de lotes y órdenes de producción.
-- Requiere frase de confirmación 'ELIMINAR'. Borra delivery_items, entregas que quedan
-- vacías, y el lote (cascada: stock, movimientos, trazas de ingredientes, incidencias).
-- Uso en app: solo si NEXT_PUBLIC_ALLOW_FORCE_DELETE_TEST_DATA o ALLOW_FORCE_DELETE_TEST_DATA.
-- ---------------------------------------------------------------------------
create or replace function public.cc_force_delete_production_batch_central(
  p_batch_id uuid,
  p_confirm_phrase text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local uuid;
  v_affected uuid[];
begin
  if p_confirm_phrase is distinct from 'ELIMINAR' then
    raise exception 'Confirmación inválida';
  end if;
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.profile_can_access_cocina_central_module() then
    raise exception 'Sin permiso para cocina central';
  end if;
  if not public.profile_local_is_central() then
    raise exception 'Solo cocina central puede eliminar lotes';
  end if;

  select b.local_central_id
  into v_local
  from public.production_batches b
  where b.id = p_batch_id
  for update;

  if not found then
    raise exception 'Lote no encontrado';
  end if;
  if v_local is distinct from public.current_local_id() then
    raise exception 'El lote no pertenece a tu cocina central';
  end if;

  select coalesce(
    (select array_agg(distinct x.delivery_id)
     from public.delivery_items x
     where x.batch_id = p_batch_id),
    '{}'::uuid[]
  ) into v_affected;

  delete from public.delivery_items where batch_id = p_batch_id;

  delete from public.deliveries d
  where d.id = any (v_affected)
    and not exists (select 1 from public.delivery_items di2 where di2.delivery_id = d.id);

  delete from public.production_batches where id = p_batch_id;
end;
$$;

revoke all on function public.cc_force_delete_production_batch_central(uuid, text) from public;
grant execute on function public.cc_force_delete_production_batch_central(uuid, text) to authenticated;

comment on function public.cc_force_delete_production_batch_central(uuid, text) is
  'Modo pruebas: elimina lote, líneas de entrega, entregas quedan vacías, cascada. Frase: ELIMINAR.';

-- ---------------------------------------------------------------------------
create or replace function public.cc_force_delete_production_order_central(
  p_order_id uuid,
  p_confirm_phrase text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local uuid;
  v_bid uuid;
begin
  if p_confirm_phrase is distinct from 'ELIMINAR' then
    raise exception 'Confirmación inválida';
  end if;
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.profile_can_access_cocina_central_module() then
    raise exception 'Sin permiso para cocina central';
  end if;
  if not public.profile_local_is_central() then
    raise exception 'Solo cocina central puede eliminar órdenes de producción';
  end if;

  select po.local_central_id
  into v_local
  from public.production_orders po
  where po.id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;
  if v_local is distinct from public.current_local_id() then
    raise exception 'La orden no pertenece a tu cocina central';
  end if;

  for v_bid in
    select b.id
    from public.production_batches b
    where b.production_order_id = p_order_id
    order by b.id
  loop
    perform public.cc_force_delete_production_batch_central(v_bid, p_confirm_phrase);
  end loop;

  delete from public.production_orders where id = p_order_id;
end;
$$;

revoke all on function public.cc_force_delete_production_order_central(uuid, text) from public;
grant execute on function public.cc_force_delete_production_order_central(uuid, text) to authenticated;

comment on function public.cc_force_delete_production_order_central(uuid, text) is
  'Modo pruebas: elimina lotes vinculados a la orden (vía frase ELIMINAR) y luego la orden.';
