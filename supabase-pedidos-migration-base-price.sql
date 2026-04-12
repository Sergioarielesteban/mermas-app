-- Precio base del pedido vs precio facturado en albarán (revisión en Recepción)
-- Ejecutar en Supabase → SQL Editor si ya tenías purchase_order_items sin esta columna.

alter table public.purchase_order_items
  add column if not exists base_price_per_unit numeric(10,2);

update public.purchase_order_items
set base_price_per_unit = price_per_unit
where base_price_per_unit is null;
