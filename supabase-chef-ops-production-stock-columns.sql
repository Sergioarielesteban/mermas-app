-- Chef-One: producción con stocks Lun–Jue / Vie–Dom y registro Hecho / Hacer por ejecución.
-- Ejecutar en Supabase SQL Editor después de supabase-chef-ops-checklist-production.sql.

alter table public.chef_production_tasks
  add column if not exists stock_lun_jue numeric,
  add column if not exists stock_vie_dom numeric;

comment on column public.chef_production_tasks.stock_lun_jue is 'Objetivo de stock lunes–jueves (ajustable por temporada).';
comment on column public.chef_production_tasks.stock_vie_dom is 'Objetivo de stock viernes–domingo.';

alter table public.chef_production_run_tasks
  add column if not exists qty_on_hand numeric,
  add column if not exists qty_to_make numeric;

comment on column public.chef_production_run_tasks.qty_on_hand is 'Cantidad en cocina ahora (Hecho).';
comment on column public.chef_production_run_tasks.qty_to_make is 'Cantidad a elaborar (Hacer); editable, puede diferir del sugerido.';
