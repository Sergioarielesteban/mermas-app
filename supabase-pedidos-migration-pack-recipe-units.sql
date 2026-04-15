-- Escandallos: precio por envase de compra vs unidad de uso en receta
-- Ejecutar en Supabase SQL Editor si ya tienes pedido_supplier_products.

alter table public.pedido_supplier_products
  add column if not exists units_per_pack numeric(12,4) not null default 1;

alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_units_per_pack_chk;
alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_units_per_pack_chk
  check (units_per_pack > 0);

alter table public.pedido_supplier_products
  add column if not exists recipe_unit text;

alter table public.pedido_supplier_products
  drop constraint if exists pedido_supplier_products_recipe_unit_check;
alter table public.pedido_supplier_products
  add constraint pedido_supplier_products_recipe_unit_check
  check (
    recipe_unit is null
    or recipe_unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  );

update public.pedido_supplier_products
set recipe_unit = null
where coalesce(units_per_pack, 1) <= 1;
