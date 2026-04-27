-- Peso final real para bases/subrecetas (rendimiento real)
-- Ejecutar en Supabase SQL Editor.

alter table public.escandallo_recipes
  add column if not exists final_weight_qty numeric(12,4),
  add column if not exists final_weight_unit text;

alter table public.escandallo_recipes
  drop constraint if exists escandallo_recipes_final_weight_qty_positive;
alter table public.escandallo_recipes
  add constraint escandallo_recipes_final_weight_qty_positive
  check (final_weight_qty is null or final_weight_qty > 0);

alter table public.escandallo_recipes
  drop constraint if exists escandallo_recipes_final_weight_unit_check;
alter table public.escandallo_recipes
  add constraint escandallo_recipes_final_weight_unit_check
  check (final_weight_unit is null or final_weight_unit in ('kg', 'l'));

comment on column public.escandallo_recipes.final_weight_qty is
  'Peso/volumen final util para coste real de base/subreceta.';
comment on column public.escandallo_recipes.final_weight_unit is
  'Unidad de final_weight_qty: kg o l.';
