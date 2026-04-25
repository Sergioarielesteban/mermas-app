-- Pedidos: convención de `purchase_order_items.product_name`
-- -----------------------------------------------------------------
-- Este campo es el **snapshot de nombre al crear o editar la línea** y debe
-- rellenarse con `pedido_supplier_products.name` (texto albarán / proveedor),
-- no con `purchase_articles.nombre` (artículo máster / uso interno).
-- No añade columnas: documentación para quienes revisen el esquema.
-- Ejecuta en Supabase si quieres dejarlo registrado (idempotente).
 comment on column public.purchase_order_items.product_name is
  'Snapshot del nombre de producto al guardar la línea (típ. catálogo proveedor; no titular de artículo máster).';
