-- Módulo Pedidos · Operaciones críticas atómicas
-- Ejecutar tras supabase-pedidos-schema.sql, delivery_notes e historico_precios.

create or replace function public.receive_purchase_order_atomic(
  p_order_id uuid,
  p_local_id uuid,
  p_received_at timestamptz,
  p_items jsonb,
  p_expected_order_updated_at timestamptz default null
)
returns table(order_id uuid, order_updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated_at timestamptz;
  v_expected_items int;
  v_updated_items int;
begin
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' then
    raise exception 'p_items debe ser un array JSON';
  end if;

  select count(*) into v_expected_items
  from jsonb_array_elements(p_items);

  if v_expected_items <= 0 then
    raise exception 'No se puede recibir un pedido sin líneas';
  end if;

  if not exists (
    select 1
    from public.purchase_orders po
    where po.id = p_order_id
      and po.local_id = p_local_id
      and po.status in ('sent', 'received')
      and (p_expected_order_updated_at is null or po.updated_at = p_expected_order_updated_at)
  ) then
    if exists (
      select 1
      from public.purchase_orders po
      where po.id = p_order_id
        and po.local_id = p_local_id
    ) then
      raise exception 'Order updated by another user (concurrency conflict)';
    end if;
    raise exception 'Pedido no encontrado o sin permisos para este local';
  end if;

  with incoming as (
    select *
    from jsonb_to_recordset(p_items) as x(
      item_id uuid,
      received_quantity numeric,
      received_weight_kg numeric,
      received_price_per_kg numeric,
      price_per_unit numeric,
      line_total numeric
    )
  )
  update public.purchase_order_items poi
  set
    received_quantity = greatest(0, round(coalesce(i.received_quantity, 0)::numeric, 2)),
    received_weight_kg = case
      when i.received_weight_kg is not null and i.received_weight_kg > 0
        then round(i.received_weight_kg::numeric, 3)
      else null
    end,
    received_price_per_kg = case
      when i.received_price_per_kg is not null and i.received_price_per_kg > 0
        then round(i.received_price_per_kg::numeric, 4)
      else null
    end,
    price_per_unit = greatest(0, round(coalesce(i.price_per_unit, 0)::numeric, 4)),
    line_total = greatest(0, round(coalesce(i.line_total, 0)::numeric, 2))
  from incoming i
  where poi.id = i.item_id
    and poi.order_id = p_order_id
    and poi.local_id = p_local_id;

  get diagnostics v_updated_items = row_count;

  if v_updated_items <> v_expected_items then
    raise exception 'No se pudieron actualizar todas las líneas de recepción';
  end if;

  update public.purchase_orders po
  set
    status = 'received',
    received_at = coalesce(p_received_at, now()),
    price_review_archived_at = null
  where po.id = p_order_id
    and po.local_id = p_local_id
  returning po.updated_at into v_updated_at;

  if v_updated_at is null then
    raise exception 'No se pudo marcar el pedido como recibido';
  end if;

  return query select p_order_id, v_updated_at;
end;
$$;

create or replace function public.confirm_delivery_note_atomic(
  p_delivery_note_id uuid,
  p_local_id uuid,
  p_validated_by uuid default null,
  p_reception_date date default null
)
returns table(delivery_note_id uuid, note_updated_at timestamptz, updated_count int, unchanged_count int, skipped_count int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_note_updated_at timestamptz;
  v_updated int := 0;
  v_unchanged int := 0;
  v_skipped int := 0;
  r record;
  v_new_price numeric;
  v_old_comparable numeric;
  v_new_comparable numeric;
  v_baseline numeric;
  v_diff numeric;
  v_diff_pct numeric;
  v_unit text;
  v_qty numeric;
  v_amount numeric;
  v_inserted_count int;
begin
  update public.delivery_notes dn
  set
    status = 'validated',
    validated_at = now(),
    validated_by = p_validated_by
  where dn.id = p_delivery_note_id
    and dn.local_id = p_local_id
    and dn.status <> 'archived'
  returning dn.updated_at into v_note_updated_at;

  if v_note_updated_at is null then
    raise exception 'Albarán no encontrado o archivado';
  end if;

  for r in
    select
      dni.internal_product_id as supplier_product_id,
      dni.unit_price,
      dni.quantity,
      dni.unit as note_unit,
      p.article_id,
      p.supplier_id,
      p.unit as catalog_unit,
      p.price_per_unit,
      p.billing_unit,
      p.billing_qty_per_order_unit,
      p.estimated_kg_per_unit
    from public.delivery_note_items dni
    join public.pedido_supplier_products p
      on p.id = dni.internal_product_id
     and p.local_id = p_local_id
    where dni.delivery_note_id = p_delivery_note_id
      and dni.local_id = p_local_id
  loop
    if r.supplier_product_id is null
      or r.unit_price is null
      or r.unit_price < 0
      or coalesce(r.catalog_unit::text, '') <> coalesce(r.note_unit::text, '')
    then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_new_price := round(r.unit_price::numeric, 2);

    if r.catalog_unit::text = 'kg' then
      v_old_comparable := round(coalesce(r.price_per_unit, 0)::numeric, 4);
      v_new_comparable := round(v_new_price, 4);
      v_unit := 'kg';
    elsif r.billing_unit::text = 'kg' and coalesce(r.billing_qty_per_order_unit, 0) > 0 then
      v_old_comparable := round((coalesce(r.price_per_unit, 0) / r.billing_qty_per_order_unit)::numeric, 4);
      v_new_comparable := round((v_new_price / r.billing_qty_per_order_unit)::numeric, 4);
      v_unit := 'kg';
    elsif coalesce(r.estimated_kg_per_unit, 0) > 0 then
      v_old_comparable := round((coalesce(r.price_per_unit, 0) / r.estimated_kg_per_unit)::numeric, 4);
      v_new_comparable := round((v_new_price / r.estimated_kg_per_unit)::numeric, 4);
      v_unit := 'kg';
    else
      v_old_comparable := round(coalesce(r.price_per_unit, 0)::numeric, 4);
      v_new_comparable := round(v_new_price, 4);
      v_unit := coalesce(r.catalog_unit::text, 'ud');
    end if;

    select hp.precio_nuevo into v_baseline
    from public.historico_precios hp
    where hp.local_id = p_local_id
      and hp.supplier_product_id = r.supplier_product_id
    order by hp.created_at desc
    limit 1;

    v_baseline := coalesce(v_baseline, v_old_comparable);
    v_qty := case when r.quantity is not null and r.quantity > 0 then round(r.quantity::numeric, 6) else null end;
    v_amount := case when v_qty is not null then round((v_new_comparable * v_qty)::numeric, 6) else null end;

    if abs(v_new_comparable - v_baseline) < 0.005 and coalesce(v_amount, 0) <= 0 then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;

    v_diff := case when abs(v_new_comparable - v_baseline) >= 0.005 then round((v_new_comparable - v_baseline)::numeric, 4) else 0 end;
    v_diff_pct := case when v_diff <> 0 and v_baseline > 0 then round((v_diff / v_baseline * 100)::numeric, 4) else 0 end;

    insert into public.historico_precios (
      local_id,
      articulo_id,
      proveedor_id,
      supplier_product_id,
      fecha,
      precio_anterior,
      precio_nuevo,
      diferencia,
      diferencia_pct,
      unidad_comparacion,
      cantidad_comparable,
      importe_comparable,
      albaran_id,
      created_by
    )
    values (
      p_local_id,
      r.article_id,
      r.supplier_id,
      r.supplier_product_id,
      coalesce(p_reception_date, current_date),
      v_baseline,
      v_new_comparable,
      v_diff,
      v_diff_pct,
      v_unit,
      v_qty,
      v_amount,
      p_delivery_note_id,
      p_validated_by
    )
    on conflict (albaran_id, supplier_product_id) where albaran_id is not null do nothing;

    get diagnostics v_inserted_count = row_count;

    update public.pedido_supplier_products p
    set
      ultimo_precio_recibido = v_new_price,
      fecha_ultimo_precio = now()
    where p.id = r.supplier_product_id
      and p.local_id = p_local_id;

    if v_inserted_count > 0 then
      v_updated := v_updated + 1;
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  return query select p_delivery_note_id, v_note_updated_at, v_updated, v_unchanged, v_skipped;
end;
$$;
