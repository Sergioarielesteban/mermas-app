-- Recepción: precio por kg real en bandeja/caja (subtotal = kg reales × €/kg).
-- Ejecutar en Supabase → SQL Editor si ya tienes purchase_order_items sin esta columna.

alter table public.purchase_order_items
  add column if not exists received_price_per_kg numeric(10,4);

comment on column public.purchase_order_items.received_price_per_kg is
  '€/kg reales en recepción (bandeja/caja). Si hay kg reales y este valor, line_total = kg × €/kg; price_per_unit pasa a ser €/envase efectivo.';
