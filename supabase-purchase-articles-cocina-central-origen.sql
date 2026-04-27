-- =============================================================================
-- Artículos Máster: origen proveedor vs Cocina Central (coste sin receta pública)
-- =============================================================================
-- Requisitos: purchase_articles, production_recipes, trg_purchase_articles_usage_cost_biub,
--             trg_pedido_supplier_products_propagate_article_cost (migración master-article-usage-cost)
--
-- Efecto:
-- - origen_articulo: proveedor (defecto) | cocina_central
-- - central_production_recipe_id: vínculo 1:1 con fórmula interna (salida)
-- - central_cost_synced_at: última sincronización de coste desde la fórmula
-- - El trigger de coste unitario NO recalcula desde compra cuando origen = cocina_central
-- - La propagación de precios desde catálogo proveedor ignora artículos cocina_central
-- =============================================================================

alter table public.purchase_articles
  add column if not exists origen_articulo text not null default 'proveedor';

alter table public.purchase_articles
  drop constraint if exists purchase_articles_origen_articulo_chk;

alter table public.purchase_articles
  add constraint purchase_articles_origen_articulo_chk
  check (origen_articulo in ('proveedor', 'cocina_central'));

alter table public.purchase_articles
  add column if not exists central_production_recipe_id uuid;

alter table public.purchase_articles
  add column if not exists central_cost_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchase_articles_central_production_recipe_fkey'
  ) then
    alter table public.purchase_articles
      add constraint purchase_articles_central_production_recipe_fkey
      foreign key (central_production_recipe_id)
      references public.production_recipes(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists uq_purchase_articles_local_central_recipe
  on public.purchase_articles (local_id, central_production_recipe_id)
  where central_production_recipe_id is not null;

comment on column public.purchase_articles.origen_articulo is
  'proveedor: coste desde compra/catálogo. cocina_central: coste sincronizado desde fórmula interna (sin exponer receta en este registro).';
comment on column public.purchase_articles.central_production_recipe_id is
  'Fórmula interna de Cocina Central que alimenta nombre/unidad/coste de este artículo máster.';
comment on column public.purchase_articles.central_cost_synced_at is
  'Momento del último cálculo de coste_unitario_uso desde ingredientes de la fórmula.';

-- Coste unitario: no recalcular desde compra para salidas de cocina central
create or replace function public.trg_purchase_articles_usage_cost_biub()
returns trigger
language plpgsql
as $$
declare
  compra numeric;
  factor_u numeric;
  rend numeric;
  denom numeric;
begin
  if coalesce(new.origen_articulo, 'proveedor') = 'cocina_central' then
    return new;
  end if;

  compra := coalesce(new.coste_compra_actual, new.coste_master);
  if compra is null or compra < 0 then
    new.coste_unitario_uso := null;
    return new;
  end if;
  factor_u := coalesce(new.unidades_uso_por_unidad_compra, 1);
  if factor_u is null or factor_u <= 0 then
    factor_u := 1;
  end if;
  rend := coalesce(new.rendimiento_pct, 100);
  if rend is null or rend <= 0 then
    rend := 100;
  end if;
  if rend > 100 then
    rend := 100;
  end if;
  denom := factor_u * (rend / 100.0);
  if denom <= 0 then
    new.coste_unitario_uso := null;
    return new;
  end if;
  new.coste_unitario_uso := round((compra / denom)::numeric, 8);
  return new;
end;
$$;

drop trigger if exists trg_purchase_articles_usage_cost_biub on public.purchase_articles;
create trigger trg_purchase_articles_usage_cost_biub
before insert or update of
  coste_compra_actual,
  coste_master,
  unidades_uso_por_unidad_compra,
  rendimiento_pct,
  referencia_principal_supplier_product_id,
  unidad_uso,
  unidad_compra,
  iva_compra_pct,
  origen_articulo
on public.purchase_articles
for each row
execute procedure public.trg_purchase_articles_usage_cost_biub();

-- Propagación catálogo → artículo: no tocar filas de Cocina Central
create or replace function public.trg_pedido_supplier_products_propagate_article_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if tg_op = 'UPDATE'
     and new.price_per_unit is not distinct from old.price_per_unit
     and coalesce(new.units_per_pack, 1) is not distinct from coalesce(old.units_per_pack, 1)
     and coalesce(new.recipe_unit, '') is not distinct from coalesce(old.recipe_unit, '') then
    return new;
  end if;

  for p in
    select a.id
    from public.purchase_articles a
    where coalesce(a.origen_articulo, 'proveedor') is distinct from 'cocina_central'
      and (
        a.referencia_principal_supplier_product_id = new.id
        or (
          a.referencia_principal_supplier_product_id is null
          and a.created_from_supplier_product_id = new.id
        )
      )
  loop
    update public.purchase_articles a
    set
      coste_compra_actual = new.price_per_unit,
      unidad_compra = new.unit::text,
      iva_compra_pct = coalesce(new.vat_rate, a.iva_compra_pct),
      origen_coste = coalesce(a.origen_coste, 'proveedor_catalogo'),
      updated_at = now()
    where a.id = p.id;
  end loop;

  return new;
end;
$$;
