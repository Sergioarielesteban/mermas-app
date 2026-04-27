-- Campos de consulta rápida (matriz carta / sin gluten) en platos de carta.
-- Ejecutar en Supabase SQL Editor tras supabase-appcc-carta-alergenos-schema.sql

alter table public.escandallo_recipes
  add column if not exists carta_category text;

alter table public.escandallo_recipes
  add column if not exists gluten_free_option text
  check (gluten_free_option is null or gluten_free_option in ('yes', 'no', 'ask'));

comment on column public.escandallo_recipes.carta_category is
  'Categoría de carta para mostrar en matriz (entrante, principal, etc.). Opcional.';

comment on column public.escandallo_recipes.gluten_free_option is
  'Posibilidad sin gluten: yes | no | ask (consultar). NULL se trata como consultar en UI.';

alter table public.escandallo_recipes
  add column if not exists gluten_free_option_note text;

comment on column public.escandallo_recipes.gluten_free_option_note is
  'Motivo u orientación para el cliente (cómo se adapta o por qué no).';

alter table public.escandallo_recipes
  add column if not exists gluten_cross_contamination_warning text;

comment on column public.escandallo_recipes.gluten_cross_contamination_warning is
  'Advertencia explícita de contaminación cruzada si aplica.';
