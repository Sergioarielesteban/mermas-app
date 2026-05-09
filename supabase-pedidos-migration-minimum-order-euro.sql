-- Pedido mínimo por proveedor (€ sin IVA), referencia operativa en «Nuevo pedido».
-- Opcional: ejecutar solo si quieres el campo en Supabase; la app funciona sin él.

alter table public.pedido_suppliers
  add column if not exists minimum_order_euro numeric(12, 2)
  check (minimum_order_euro is null or minimum_order_euro >= 0);

comment on column public.pedido_suppliers.minimum_order_euro is
  'Importe mínimo del pedido en € sin IVA (referencia UI). Null = sin mínimo configurado.';
