-- Marca pedidos enviados que se editaron tras el primer envío (líneas/cantidades).
-- Ejecutar en Supabase SQL Editor si ya tenías el esquema de pedidos desplegado.

alter table public.purchase_orders
  add column if not exists content_revised_after_sent_at timestamptz;

create or replace function public.save_purchase_order_with_items(
  p_order_id uuid,
  p_local_id uuid,
  p_supplier_id uuid,
  p_status text,
  p_notes text,
  p_sent_at timestamptz,
  p_delivery_date date,
  p_items jsonb,
  p_expected_order_updated_at timestamptz default null,
  p_mark_content_revised_after_sent boolean default false
)
returns table(order_id uuid, order_updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_updated_at timestamptz;
begin
  if p_status not in ('draft', 'sent', 'received') then
    raise exception 'Estado de pedido inválido';
  end if;

  if p_order_id is null then
    insert into public.purchase_orders (
      local_id,
      supplier_id,
      status,
      notes,
      sent_at,
      delivery_date
    ) values (
      p_local_id,
      p_supplier_id,
      p_status,
      btrim(coalesce(p_notes, '')),
      case when p_status = 'sent' then coalesce(p_sent_at, now()) else null end,
      p_delivery_date
    )
    returning id, updated_at into v_order_id, v_order_updated_at;
  else
    update public.purchase_orders
    set
      supplier_id = p_supplier_id,
      status = p_status,
      notes = btrim(coalesce(p_notes, '')),
      sent_at = case when p_status = 'sent' then coalesce(p_sent_at, now()) else null end,
      delivery_date = p_delivery_date,
      content_revised_after_sent_at = case
        when coalesce(p_mark_content_revised_after_sent, false) then now()
        when p_status = 'draft' then null
        else content_revised_after_sent_at
      end
    where id = p_order_id
      and local_id = p_local_id
      and (p_expected_order_updated_at is null or updated_at = p_expected_order_updated_at)
    returning id, updated_at into v_order_id, v_order_updated_at;

    if v_order_id is null then
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

    delete from public.purchase_order_items
    where order_id = v_order_id
      and local_id = p_local_id;
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' then
    raise exception 'p_items debe ser un array JSON';
  end if;

  insert into public.purchase_order_items (
    local_id,
    order_id,
    supplier_product_id,
    product_name,
    unit,
    quantity,
    received_quantity,
    price_per_unit,
    base_price_per_unit,
    vat_rate,
    line_total,
    estimated_kg_per_unit,
    received_weight_kg,
    received_price_per_kg,
    incident_type,
    incident_notes
  )
  select
    p_local_id,
    v_order_id,
    i.supplier_product_id,
    i.product_name,
    i.unit,
    i.quantity,
    coalesce(i.received_quantity, 0),
    i.price_per_unit,
    i.base_price_per_unit,
    coalesce(i.vat_rate, 0),
    i.line_total,
    i.estimated_kg_per_unit,
    i.received_weight_kg,
    i.received_price_per_kg,
    i.incident_type,
    i.incident_notes
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(
    supplier_product_id uuid,
    product_name text,
    unit text,
    quantity numeric,
    received_quantity numeric,
    price_per_unit numeric,
    base_price_per_unit numeric,
    vat_rate numeric,
    line_total numeric,
    estimated_kg_per_unit numeric,
    received_weight_kg numeric,
    received_price_per_kg numeric,
    incident_type text,
    incident_notes text
  );

  select updated_at into v_order_updated_at
  from public.purchase_orders
  where id = v_order_id;

  return query select v_order_id, v_order_updated_at;
end;
$$;
