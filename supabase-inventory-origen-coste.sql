-- =============================================================================
-- Inventario: origen de coste (manual, artículo máster, producción propia / subreceta)
-- =============================================================================
-- Requiere: inventory_items, purchase_articles (opcional), escandallo_recipes (opcional)
-- Idempotente. Ejecutar en Supabase SQL Editor.
-- =============================================================================

alter table public.inventory_items
  add column if not exists origen_coste text not null default 'manual';

alter table public.inventory_items
  drop constraint if exists inventory_items_origen_coste_chk;

alter table public.inventory_items
  add constraint inventory_items_origen_coste_chk
  check (origen_coste in ('manual', 'master', 'produccion_propia'));

alter table public.inventory_items
  add column if not exists master_article_id uuid;

alter table public.inventory_items
  add column if not exists escandallo_recipe_id uuid;

alter table public.inventory_items
  add column if not exists precio_manual numeric(12, 4);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_master_article_fkey') then
    alter table public.inventory_items
      add constraint inventory_items_master_article_fkey
      foreign key (master_article_id)
      references public.purchase_articles(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_escandallo_recipe_fkey') then
    alter table public.inventory_items
      add constraint inventory_items_escandallo_recipe_fkey
      foreign key (escandallo_recipe_id)
      references public.escandallo_recipes(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_inventory_items_master_article
  on public.inventory_items (local_id, master_article_id)
  where master_article_id is not null;

create index if not exists idx_inventory_items_escandallo_recipe
  on public.inventory_items (local_id, escandallo_recipe_id)
  where escandallo_recipe_id is not null;

comment on column public.inventory_items.origen_coste is
  'manual: price_per_unit editado. master: coste_unitario_uso vía master_article_id. produccion_propia: coste/ud de yield vía escandallo_recipe_id.';

comment on column public.inventory_items.precio_manual is
  'Snapshot €/ud si origen=manual; null si el coste sale de máster o subreceta.';

-- Rellenar legado: todo manual con precio en precio_manual
update public.inventory_items
set
  origen_coste = 'manual',
  precio_manual = price_per_unit
where origen_coste = 'manual'
  and precio_manual is null;
