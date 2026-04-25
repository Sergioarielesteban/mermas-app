-- Histórico de precios de catálogo: borrado (RLS) y metadatos opcionales.
-- Ejecutar en Supabase SQL Editor si ya existe pedido_supplier_product_price_history
-- (ver supabase-pedidos-delivery-notes.sql).

alter table public.pedido_supplier_product_price_history
  add column if not exists is_test boolean not null default false;

alter table public.pedido_supplier_product_price_history
  add column if not exists notes text;

drop policy if exists "psp price history same local delete" on public.pedido_supplier_product_price_history;
create policy "psp price history same local delete"
on public.pedido_supplier_product_price_history
for delete
to authenticated
using (local_id = public.current_local_id());

comment on column public.pedido_supplier_product_price_history.is_test is
  'Metadato opcional (p. ej. datos de prueba). El borrado en Evolución de precios se hace por producto, no en lote global.';

comment on column public.pedido_supplier_product_price_history.notes is
  'Notas internas (opcional).';
