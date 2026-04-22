-- Escandallos: unidades de línea y elaborados alineadas con purchase_articles.unidad_uso
-- (loncha, g, ml, servicio, ración…). Idempotente.
-- Ejecutar después de supabase-escandallos-schema.sql.

alter table public.escandallo_recipe_lines
  drop constraint if exists escandallo_recipe_lines_unit_check;

alter table public.escandallo_recipe_lines
  add constraint escandallo_recipe_lines_unit_check
  check (char_length(trim(unit)) between 1 and 48);

alter table public.escandallo_processed_products
  drop constraint if exists escandallo_processed_products_output_unit_check;

alter table public.escandallo_processed_products
  add constraint escandallo_processed_products_output_unit_check
  check (char_length(trim(output_unit)) between 1 and 48);
