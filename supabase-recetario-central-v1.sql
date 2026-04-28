-- =============================================================================
-- Recetario Cocina Central v1
-- - Metadatos de receta (categoría, formato operativo, procedimiento privado)
-- - Líneas: artículo máster | subreceta CC interna | manual (coste excepcional)
-- - Escandallos: origen de coste manual vs receta CC (sin tocar cálculo legacy por defecto)
-- - Inventario: origen recetario_cc + cantidad de formato (multiplicador €/ud salida)
-- Idempotente. Ejecutar en Supabase SQL Editor después de production_recipes existentes.
-- =============================================================================

-- A) production_recipes: categoría y texto privado
-- -----------------------------------------------------------------------------
alter table public.production_recipes
  add column if not exists recipe_category text not null default 'otro';

alter table public.production_recipes
  drop constraint if exists production_recipes_recipe_category_chk;

alter table public.production_recipes
  add constraint production_recipes_recipe_category_chk
  check (recipe_category in ('salsa', 'base', 'elaborado', 'postre', 'otro'));

alter table public.production_recipes
  add column if not exists operative_format_label text;

alter table public.production_recipes
  add column if not exists procedure_notes text;

comment on column public.production_recipes.recipe_category is
  'Clasificación Recetario Central (salsa, base, elaborado, postre, otro).';
comment on column public.production_recipes.operative_format_label is
  'Etiqueta humana de formato (ej. bolsa 4 kg, cubo 10 L). Para UI y coste por formato.';
comment on column public.production_recipes.procedure_notes is
  'Procedimiento privado; solo editable en Cocina Central con permiso de módulo CC.';

-- B) production_recipe_lines: tipos de línea
-- -----------------------------------------------------------------------------
alter table public.production_recipe_lines
  add column if not exists line_kind text not null default 'articulo_master';

alter table public.production_recipe_lines
  drop constraint if exists production_recipe_lines_line_kind_chk;

alter table public.production_recipe_lines
  add constraint production_recipe_lines_line_kind_chk
  check (line_kind in ('articulo_master', 'receta_cc_interna', 'manual'));

alter table public.production_recipe_lines
  add column if not exists nested_production_recipe_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'production_recipe_lines_nested_recipe_fkey'
  ) then
    alter table public.production_recipe_lines
      add constraint production_recipe_lines_nested_recipe_fkey
      foreign key (nested_production_recipe_id)
      references public.production_recipes(id)
      on delete restrict;
  end if;
end $$;

alter table public.production_recipe_lines
  add column if not exists manual_unit_cost_eur numeric(14,6);

-- Permitir artículo null en líneas no-master
alter table public.production_recipe_lines
  alter column article_id drop not null;

alter table public.production_recipe_lines
  drop constraint if exists production_recipe_lines_line_consistency_chk;

alter table public.production_recipe_lines
  add constraint production_recipe_lines_line_consistency_chk
  check (
    (
      line_kind = 'articulo_master'
      and article_id is not null
      and nested_production_recipe_id is null
    )
    or (
      line_kind = 'receta_cc_interna'
      and nested_production_recipe_id is not null
      and article_id is null
    )
    or (
      line_kind = 'manual'
      and article_id is null
      and nested_production_recipe_id is null
      and manual_unit_cost_eur is not null
      and manual_unit_cost_eur > 0
    )
  );

comment on column public.production_recipe_lines.line_kind is
  'articulo_master: purchase_articles; receta_cc_interna: otra fórmula CC; manual: coste €/ud manual.';
comment on column public.production_recipe_lines.nested_production_recipe_id is
  'Si line_kind=receta_cc_interna, referencia a otra production_recipes del mismo local.';
comment on column public.production_recipe_lines.manual_unit_cost_eur is
  'Si line_kind=manual: coste € por unidad de línea (cantidad × este coste = € línea).';

update public.production_recipe_lines set line_kind = 'articulo_master' where line_kind is null;

-- C) Escandallo: enlace opcional a Recetario CC (subrecetas/bases)
-- -----------------------------------------------------------------------------
alter table public.escandallo_recipes
  add column if not exists recipe_cost_source text not null default 'manual';

alter table public.escandallo_recipes
  drop constraint if exists escandallo_recipes_recipe_cost_source_chk;

alter table public.escandallo_recipes
  add constraint escandallo_recipes_recipe_cost_source_chk
  check (recipe_cost_source in ('manual', 'cocina_central'));

alter table public.escandallo_recipes
  add column if not exists central_production_recipe_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'escandallo_recipes_central_production_recipe_fkey'
  ) then
    alter table public.escandallo_recipes
      add constraint escandallo_recipes_central_production_recipe_fkey
      foreign key (central_production_recipe_id)
      references public.production_recipes(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_escandallo_recipes_cc_recipe
  on public.escandallo_recipes (local_id, central_production_recipe_id)
  where central_production_recipe_id is not null;

comment on column public.escandallo_recipes.recipe_cost_source is
  'manual: ingredientes escandallo como hasta ahora; cocina_central: coste desde Recetario CC.';
comment on column public.escandallo_recipes.central_production_recipe_id is
  'Si recipe_cost_source=cocina_central: production_recipes del mismo local (cocina central).';

-- D) Inventario: origen recetario CC
-- -----------------------------------------------------------------------------
alter table public.inventory_items
  drop constraint if exists inventory_items_origen_coste_chk;

alter table public.inventory_items
  add constraint inventory_items_origen_coste_chk
  check (
    origen_coste in ('manual', 'master', 'produccion_propia', 'recetario_cc')
  );

alter table public.inventory_items
  add column if not exists central_production_recipe_id uuid;

alter table public.inventory_items
  add column if not exists cc_recipe_format_qty numeric(14,6);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_central_production_recipe_fkey'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_central_production_recipe_fkey
      foreign key (central_production_recipe_id)
      references public.production_recipes(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_inventory_items_cc_recipe
  on public.inventory_items (local_id, central_production_recipe_id)
  where central_production_recipe_id is not null;

comment on column public.inventory_items.origen_coste is
  'recetario_cc: coste desde fórmula CC × cc_recipe_format_qty (ej. kg por bolsa).';
comment on column public.inventory_items.cc_recipe_format_qty is
  'Cantidad en unidades de salida de la receta por una unidad de inventario (ej. 4 si cada línea es bolsa de 4 kg).';
