-- Pedidos/Recepciones: persistir último precio real recibido por artículo proveedor.
-- Idempotente. Ejecutar en Supabase SQL Editor.

alter table public.pedido_supplier_products
  add column if not exists ultimo_precio_recibido numeric(10, 2);

alter table public.pedido_supplier_products
  add column if not exists fecha_ultimo_precio timestamptz;

alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_ultimo_precio_recibido_chk;

alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_ultimo_precio_recibido_chk
  check (ultimo_precio_recibido is null or ultimo_precio_recibido >= 0);

create index if not exists idx_pedido_supplier_products_last_received_price
  on public.pedido_supplier_products (local_id, fecha_ultimo_precio desc);

comment on column public.pedido_supplier_products.ultimo_precio_recibido is
  'Último precio unitario real recibido en albarán validado.';

comment on column public.pedido_supplier_products.fecha_ultimo_precio is
  'Fecha/hora del último precio real recibido (albarán validado).';
