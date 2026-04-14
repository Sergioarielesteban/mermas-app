-- Código artículo TPV / POS por receta (matching import ventas)
-- Ejecutar en Supabase SQL Editor tras el schema base de escandallos.

alter table public.escandallo_recipes
  add column if not exists pos_article_code text;

comment on column public.escandallo_recipes.pos_article_code is
  'Código del artículo en el TPV (ej. 00042). Opcional; único por local si se informa.';

-- Un mismo código no puede asignarse a dos recetas del mismo local
create unique index if not exists idx_escandallo_recipes_local_pos_code_unique
  on public.escandallo_recipes (local_id, pos_article_code)
  where pos_article_code is not null and btrim(pos_article_code) <> '';
