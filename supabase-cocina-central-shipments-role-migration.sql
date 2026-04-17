-- Migración: entregas salientes solo admin/manager en cocina central (operario staff queda fuera).
-- Ejecutar en SQL Editor si ya tenías el módulo cocina-central desplegado antes de este cambio.

create or replace function public.profile_can_manage_central_shipments()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.locals l on l.id = p.local_id
    where p.user_id = auth.uid()
      and coalesce(l.is_central_kitchen, false)
      and lower(p.role) in ('admin', 'manager')
  );
$$;

create or replace function public.cc_list_delivery_destinations()
returns table (id uuid, code text, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.profile_can_manage_central_shipments() then
    raise exception 'Solo administradores o encargados de cocina central pueden listar destinos';
  end if;
  return query
  select l.id, l.code, l.name
  from public.locals l
  where coalesce(l.is_active, true)
    and l.id is distinct from public.current_local_id()
  order by l.name asc, l.code asc;
end;
$$;

create or replace function public.cc_confirm_delivery_dispatch(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  d record;
  it record;
  v_orig numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.profile_can_manage_central_shipments() then
    raise exception 'Solo administradores o encargados pueden confirmar la salida';
  end if;

  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Entrega no encontrada'; end if;
  if d.local_origen_id is distinct from public.current_local_id() then
    raise exception 'Solo el origen puede confirmar la salida';
  end if;
  if d.estado in ('entregado', 'firmado', 'cancelado') then
    raise exception 'Estado de entrega no permite confirmar';
  end if;
  if d.estado not in ('preparado', 'en_reparto') then
    raise exception 'La entrega debe estar preparada o en reparto';
  end if;

  for it in select * from public.delivery_items where delivery_id = p_delivery_id loop
    select coalesce(cantidad, 0) into v_orig
    from public.batch_stock
    where batch_id = it.batch_id and local_id = d.local_origen_id;

    if v_orig < it.cantidad then
      raise exception 'Stock insuficiente para lote % en origen', it.batch_id;
    end if;

    update public.batch_stock
    set cantidad = cantidad - it.cantidad, updated_at = now()
    where batch_id = it.batch_id and local_id = d.local_origen_id;

    insert into public.batch_stock (batch_id, local_id, cantidad)
    values (it.batch_id, d.local_destino_id, it.cantidad)
    on conflict (batch_id, local_id) do update
    set cantidad = batch_stock.cantidad + excluded.cantidad, updated_at = now();

    insert into public.batch_movements (
      batch_id, local_from, local_to, cantidad, tipo, delivery_id, created_by
    ) values (
      it.batch_id, d.local_origen_id, d.local_destino_id, it.cantidad,
      'transferencia_entrega', p_delivery_id, v_uid
    );
  end loop;

  update public.production_batches b
  set estado = 'expedido', updated_at = now()
  where b.local_central_id = d.local_origen_id
    and exists (
      select 1 from public.delivery_items di
      where di.delivery_id = p_delivery_id and di.batch_id = b.id
    )
    and not exists (
      select 1 from public.batch_stock s
      where s.batch_id = b.id
        and s.local_id = d.local_origen_id
        and s.cantidad > 0
    );

  update public.deliveries
  set estado = 'entregado', confirmed_at = now(), updated_at = now()
  where id = p_delivery_id;
end;
$$;

drop policy if exists cc_deliveries_insert on public.deliveries;
create policy cc_deliveries_insert on public.deliveries
for insert to authenticated
with check (
  local_origen_id = public.current_local_id()
  and public.profile_can_manage_central_shipments()
);

drop policy if exists cc_deliveries_update_origin on public.deliveries;
create policy cc_deliveries_update_origin on public.deliveries
for update to authenticated
using (local_origen_id = public.current_local_id() and public.profile_can_manage_central_shipments())
with check (local_origen_id = public.current_local_id());

drop policy if exists cc_di_insert on public.delivery_items;
create policy cc_di_insert on public.delivery_items
for insert to authenticated
with check (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and d.local_origen_id = public.current_local_id()
      and public.profile_can_manage_central_shipments()
  )
);

drop policy if exists cc_di_update on public.delivery_items;
create policy cc_di_update on public.delivery_items
for update to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and d.local_origen_id = public.current_local_id()
      and public.profile_can_manage_central_shipments()
  )
)
with check (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and d.local_origen_id = public.current_local_id()
      and public.profile_can_manage_central_shipments()
  )
);

drop policy if exists cc_di_delete on public.delivery_items;
create policy cc_di_delete on public.delivery_items
for delete to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and d.local_origen_id = public.current_local_id()
      and public.profile_can_manage_central_shipments()
  )
);
