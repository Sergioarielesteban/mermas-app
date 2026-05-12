-- Pedidos: plan de consumo avanzado por producto de proveedor
-- Seguro e idempotente: añade columna JSONB si no existe y rellena valores por defecto.

ALTER TABLE public.pedido_supplier_products
ADD COLUMN IF NOT EXISTS consumption_plan jsonb;

ALTER TABLE public.pedido_supplier_products
ALTER COLUMN consumption_plan SET DEFAULT '{"mode":"simple","weekly_reference":0,"segments":[]}'::jsonb;

UPDATE public.pedido_supplier_products
SET consumption_plan = jsonb_build_object(
  'mode', 'simple',
  'weekly_reference', COALESCE(par_stock, 0),
  'segments', '[]'::jsonb
)
WHERE consumption_plan IS NULL;
