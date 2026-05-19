-- Amplia las unidades permitidas en productos de mermas para coincidir con la UI.
-- Ejecutar en Supabase SQL Editor sobre entornos existentes.

alter table public.products
  drop constraint if exists products_unit_check;

alter table public.products
  add constraint products_unit_check
  check (
    unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja', 'docena', 'litro', 'ml', 'g')
  );
