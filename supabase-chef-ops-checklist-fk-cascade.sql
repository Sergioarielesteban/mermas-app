-- Chef-One: permitir borrar listas e ítems de checklist aunque existan ejecuciones en historial.
-- Sin esto, Postgres devuelve:
--   chef_checklist_run_items_item_id_fkey
--   chef_checklist_runs_checklist_id_fkey
-- Ejecutar en Supabase SQL Editor (una vez por proyecto).

alter table public.chef_checklist_run_items
  drop constraint if exists chef_checklist_run_items_item_id_fkey;

alter table public.chef_checklist_run_items
  add constraint chef_checklist_run_items_item_id_fkey
  foreign key (item_id) references public.chef_checklist_items(id) on delete cascade;

alter table public.chef_checklist_runs
  drop constraint if exists chef_checklist_runs_checklist_id_fkey;

alter table public.chef_checklist_runs
  add constraint chef_checklist_runs_checklist_id_fkey
  foreign key (checklist_id) references public.chef_checklists(id) on delete cascade;
