-- Sub-elaboraciones: líneas de receta que referencian otra receta (ej. picadillo en nachos).
-- Ejecutar en Supabase SQL Editor si ya aplicaste supabase-escandallos-schema.sql antes de este cambio.

alter table public.escandallo_recipe_lines add column if not exists sub_recipe_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'escandallo_recipe_lines_sub_recipe_id_fkey'
  ) then
    alter table public.escandallo_recipe_lines
      add constraint escandallo_recipe_lines_sub_recipe_id_fkey
      foreign key (sub_recipe_id) references public.escandallo_recipes(id) on delete restrict;
  end if;
exception when duplicate_object then null;
end $$;

alter table public.escandallo_recipe_lines
  drop constraint if exists escandallo_recipe_lines_source_type_check;
alter table public.escandallo_recipe_lines
  add constraint escandallo_recipe_lines_source_type_check
  check (source_type in ('raw', 'processed', 'manual', 'subrecipe'));

create index if not exists idx_escandallo_lines_sub_recipe_id on public.escandallo_recipe_lines(sub_recipe_id);
