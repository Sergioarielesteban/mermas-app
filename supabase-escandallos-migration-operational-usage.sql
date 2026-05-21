-- Escandallos · Producción real y uso operativo de bases/elaboraciones
-- Ejecutar en Supabase SQL Editor.

alter table public.escandallo_recipe_technical_sheets
  add column if not exists yield_quantity numeric(12,4),
  add column if not exists yield_unit text,
  add column if not exists yield_merma_pct numeric(8,4),
  add column if not exists yield_cost_total numeric(12,4),
  add column if not exists yield_cost_per_unit numeric(12,6),
  add column if not exists operational_usage_type text,
  add column if not exists operational_quantity numeric(12,4),
  add column if not exists operational_unit text,
  add column if not exists operational_cost numeric(12,6);

alter table public.escandallo_recipe_technical_sheets
  drop constraint if exists escandallo_recipe_technical_sheets_yield_quantity_positive;
alter table public.escandallo_recipe_technical_sheets
  add constraint escandallo_recipe_technical_sheets_yield_quantity_positive
  check (yield_quantity is null or yield_quantity > 0);

alter table public.escandallo_recipe_technical_sheets
  drop constraint if exists escandallo_recipe_technical_sheets_yield_cost_total_nonneg;
alter table public.escandallo_recipe_technical_sheets
  add constraint escandallo_recipe_technical_sheets_yield_cost_total_nonneg
  check (yield_cost_total is null or yield_cost_total >= 0);

alter table public.escandallo_recipe_technical_sheets
  drop constraint if exists escandallo_recipe_technical_sheets_yield_cost_per_unit_nonneg;
alter table public.escandallo_recipe_technical_sheets
  add constraint escandallo_recipe_technical_sheets_yield_cost_per_unit_nonneg
  check (yield_cost_per_unit is null or yield_cost_per_unit >= 0);

alter table public.escandallo_recipe_technical_sheets
  drop constraint if exists escandallo_recipe_technical_sheets_operational_quantity_positive;
alter table public.escandallo_recipe_technical_sheets
  add constraint escandallo_recipe_technical_sheets_operational_quantity_positive
  check (operational_quantity is null or operational_quantity > 0);

alter table public.escandallo_recipe_technical_sheets
  drop constraint if exists escandallo_recipe_technical_sheets_operational_cost_nonneg;
alter table public.escandallo_recipe_technical_sheets
  add constraint escandallo_recipe_technical_sheets_operational_cost_nonneg
  check (operational_cost is null or operational_cost >= 0);

alter table public.escandallo_recipe_technical_sheets
  drop constraint if exists escandallo_recipe_technical_sheets_yield_unit_check;
alter table public.escandallo_recipe_technical_sheets
  add constraint escandallo_recipe_technical_sheets_yield_unit_check
  check (yield_unit is null or yield_unit in ('kg', 'g', 'l', 'ml', 'ud'));

alter table public.escandallo_recipe_technical_sheets
  drop constraint if exists escandallo_recipe_technical_sheets_operational_unit_check;
alter table public.escandallo_recipe_technical_sheets
  add constraint escandallo_recipe_technical_sheets_operational_unit_check
  check (operational_unit is null or operational_unit in ('kg', 'g', 'l', 'ml', 'ud'));

alter table public.escandallo_recipe_technical_sheets
  drop constraint if exists escandallo_recipe_technical_sheets_operational_usage_type_check;
alter table public.escandallo_recipe_technical_sheets
  add constraint escandallo_recipe_technical_sheets_operational_usage_type_check
  check (
    operational_usage_type is null
    or operational_usage_type in ('weight', 'volume', 'unit', 'standard_portion')
  );

alter table public.escandallo_recipe_lines
  add column if not exists sub_recipe_usage_mode text,
  add column if not exists sub_recipe_operational_quantity numeric(12,4),
  add column if not exists sub_recipe_operational_unit text;

alter table public.escandallo_recipe_lines
  drop constraint if exists escandallo_recipe_lines_sub_recipe_usage_mode_check;
alter table public.escandallo_recipe_lines
  add constraint escandallo_recipe_lines_sub_recipe_usage_mode_check
  check (sub_recipe_usage_mode is null or sub_recipe_usage_mode in ('custom', 'standard_portion'));

alter table public.escandallo_recipe_lines
  drop constraint if exists escandallo_recipe_lines_sub_recipe_operational_quantity_positive;
alter table public.escandallo_recipe_lines
  add constraint escandallo_recipe_lines_sub_recipe_operational_quantity_positive
  check (sub_recipe_operational_quantity is null or sub_recipe_operational_quantity > 0);

alter table public.escandallo_recipe_lines
  drop constraint if exists escandallo_recipe_lines_sub_recipe_operational_unit_check;
alter table public.escandallo_recipe_lines
  add constraint escandallo_recipe_lines_sub_recipe_operational_unit_check
  check (sub_recipe_operational_unit is null or sub_recipe_operational_unit in ('kg', 'g', 'l', 'ml', 'ud'));

comment on column public.escandallo_recipe_technical_sheets.yield_quantity is
  'Salida real útil de una base/elaboración.';
comment on column public.escandallo_recipe_technical_sheets.yield_unit is
  'Unidad de salida real: kg, g, l, ml o ud.';
comment on column public.escandallo_recipe_technical_sheets.yield_merma_pct is
  'Merma % calculada entre entrada comparable y salida real.';
comment on column public.escandallo_recipe_technical_sheets.yield_cost_total is
  'Coste total de producción de la base/elaboración.';
comment on column public.escandallo_recipe_technical_sheets.yield_cost_per_unit is
  'Coste real por unidad de salida útil.';
comment on column public.escandallo_recipe_technical_sheets.operational_usage_type is
  'Modo operativo de uso: peso, volumen, unidad o ración estándar.';
comment on column public.escandallo_recipe_technical_sheets.operational_quantity is
  'Cantidad operativa por uso o ración estándar.';
comment on column public.escandallo_recipe_technical_sheets.operational_unit is
  'Unidad operativa asociada a operational_quantity.';
comment on column public.escandallo_recipe_technical_sheets.operational_cost is
  'Coste operativo resultante por uso/ración estándar.';

comment on column public.escandallo_recipe_lines.sub_recipe_usage_mode is
  'Uso de la base/elaboración dentro de una receta: personalizado o ración estándar.';
comment on column public.escandallo_recipe_lines.sub_recipe_operational_quantity is
  'Cantidad base asociada al modo estándar o personalizado mostrado.';
comment on column public.escandallo_recipe_lines.sub_recipe_operational_unit is
  'Unidad asociada al uso operativo mostrado de la base/elaboración.';
