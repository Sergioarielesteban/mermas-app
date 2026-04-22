-- =============================================================================
-- Artículos Master: coste de compra vs coste unitario de uso (cocina)
-- =============================================================================
-- Objetivo: purchase_articles como núcleo de coste interno reutilizable.
-- - referencia_principal_supplier_product_id: línea de catálogo que alimenta el coste de compra
-- - coste_compra_actual: € por unidad de compra (sincronizado con esa línea)
-- - unidades_uso_por_unidad_compra: cuántas unidades de uso (cocina) salen de 1 unidad de compra
-- - rendimiento_pct: % útil (100 = sin merma; 95 = 5 % pérdida sobre las unidades de uso)
-- - coste_unitario_uso: € por unidad de uso
--
-- Requisitos: purchase_articles, pedido_supplier_products, set_updated_at()
-- Idempotente: se puede ejecutar varias veces.
-- =============================================================================

-- 1) Columnas nuevas
alter table public.purchase_articles
  add column if not exists referencia_principal_supplier_product_id uuid;

alter table public.purchase_articles
  add column if not exists unidad_compra text;

alter table public.purchase_articles
  add column if not exists coste_compra_actual numeric(14, 6);

alter table public.purchase_articles
  add column if not exists iva_compra_pct numeric(8, 4);

alter table public.purchase_articles
  add column if not exists unidad_uso text;

alter table public.purchase_articles
  add column if not exists unidades_uso_por_unidad_compra numeric(18, 8);

alter table public.purchase_articles
  add column if not exists rendimiento_pct numeric(8, 2) not null default 100;

alter table public.purchase_articles
  add column if not exists coste_unitario_uso numeric(18, 10);

alter table public.purchase_articles
  add column if not exists origen_coste text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchase_articles_ref_principal_supplier_fkey'
  ) then
    alter table public.purchase_articles
      add constraint purchase_articles_ref_principal_supplier_fkey
      foreign key (referencia_principal_supplier_product_id)
      references public.pedido_supplier_products(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_purchase_articles_ref_principal_sp
  on public.purchase_articles(referencia_principal_supplier_product_id);

alter table public.purchase_articles
  drop constraint if exists purchase_articles_rendimiento_pct_chk;

alter table public.purchase_articles
  add constraint purchase_articles_rendimiento_pct_chk
  check (rendimiento_pct > 0 and rendimiento_pct <= 100);

-- 2) Trigger BEFORE INSERT/UPDATE: mantener coste_unitario_uso coherente
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
  iva_compra_pct
on public.purchase_articles
for each row
execute procedure public.trg_purchase_articles_usage_cost_biub();

-- 4) Trigger en catálogo proveedor: propagar precio a artículos que referencian esta línea
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
    where a.referencia_principal_supplier_product_id = new.id
       or (
         a.referencia_principal_supplier_product_id is null
         and a.created_from_supplier_product_id = new.id
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

drop trigger if exists trg_pedido_supplier_products_propagate_article_cost
  on public.pedido_supplier_products;

create trigger trg_pedido_supplier_products_propagate_article_cost
after insert or update of price_per_unit, units_per_pack, recipe_unit, vat_rate
on public.pedido_supplier_products
for each row
execute procedure public.trg_pedido_supplier_products_propagate_article_cost();

-- 5) Backfill inicial desde catálogo / migración previa
update public.purchase_articles a
set
  referencia_principal_supplier_product_id = coalesce(
    a.referencia_principal_supplier_product_id,
    a.created_from_supplier_product_id,
    (
      select p.id
      from public.pedido_supplier_products p
      where p.article_id = a.id
      order by p.is_active desc, p.price_per_unit asc nulls last
      limit 1
    )
  )
where a.referencia_principal_supplier_product_id is null;

update public.purchase_articles a
set
  coste_compra_actual = coalesce(a.coste_compra_actual, p.price_per_unit, a.coste_master),
  unidad_compra = coalesce(a.unidad_compra, p.unit::text),
  iva_compra_pct = coalesce(a.iva_compra_pct, p.vat_rate),
  unidad_uso = coalesce(
    a.unidad_uso,
    case
      when coalesce(p.units_per_pack, 1) > 1 and p.recipe_unit is not null then p.recipe_unit::text
      else p.unit::text
    end
  ),
  unidades_uso_por_unidad_compra = coalesce(
    a.unidades_uso_por_unidad_compra,
    case when coalesce(p.units_per_pack, 1) > 0 then p.units_per_pack::numeric else 1 end
  ),
  origen_coste = coalesce(a.origen_coste, 'migracion_v2')
from public.pedido_supplier_products p
where p.id = a.referencia_principal_supplier_product_id
  and a.referencia_principal_supplier_product_id is not null;

-- Forzar recalculo vía trigger (touch updated_at)
update public.purchase_articles
set updated_at = now()
where referencia_principal_supplier_product_id is not null
   or created_from_supplier_product_id is not null;
