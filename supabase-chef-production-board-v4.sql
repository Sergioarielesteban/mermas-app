-- Producción v4: agrupación tipo pizarra (sección cocina) + caducidad en etiquetas.
-- Ejecutar en Supabase SQL Editor sobre un proyecto que ya tiene chef_production_block_items.

alter table public.chef_production_block_items
  add column if not exists kitchen_section text not null default '';

alter table public.chef_production_block_items
  add column if not exists shelf_life_days int null;

comment on column public.chef_production_block_items.kitchen_section is
  'Título de bloque en la pizarra (ej. PLANCHA Y FRITOS). Vacío = sin agrupación explícita.';
comment on column public.chef_production_block_items.shelf_life_days is
  'Días de vida útil desde la fecha de elaboración, para etiquetas. NULL = sin caducidad en etiqueta.';
