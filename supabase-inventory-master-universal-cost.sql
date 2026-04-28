-- Motor universal de coste para inventario + equivalencias por formato.
-- Idempotente. Ejecutar en Supabase SQL Editor.

-- 1) Artículos máster: unidad/coste base y formato de compra opcional.
alter table public.purchase_articles
  add column if not exists unidad_base_coste text;

alter table public.purchase_articles
  add column if not exists coste_base numeric(12, 6);

alter table public.purchase_articles
  add column if not exists formato_compra_nombre text;

alter table public.purchase_articles
  add column if not exists cantidad_por_formato numeric(14, 6);

alter table public.purchase_articles
  add column if not exists unidad_por_formato text;

-- Backfill inicial desde campos legacy (uso/compra), normalizando a kg/L/ud.
update public.purchase_articles
set
  unidad_base_coste = coalesce(
    unidad_base_coste,
    case
      when lower(trim(unidad_uso)) in ('kg', 'kilo', 'kilogramo', 'kilogramos', 'kilos') then 'kg'
      when lower(trim(unidad_uso)) in ('l', 'lt', 'litro', 'litros') then 'l'
      when lower(trim(unidad_uso)) in ('ud', 'uds', 'unidad', 'unidades') then 'ud'
      -- Formatos físicos/discretos legacy pasan a base ud
      when lower(trim(unidad_uso)) in ('caja', 'bandeja', 'bolsa', 'paquete', 'racion') then 'ud'
      when lower(trim(unidad_compra)) in ('kg', 'kilo', 'kilogramo', 'kilogramos', 'kilos') then 'kg'
      when lower(trim(unidad_compra)) in ('l', 'lt', 'litro', 'litros') then 'l'
      when lower(trim(unidad_compra)) in ('ud', 'uds', 'unidad', 'unidades') then 'ud'
      when lower(trim(unidad_compra)) in ('caja', 'bandeja', 'bolsa', 'paquete', 'racion') then 'ud'
      else null
    end
  ),
  coste_base = coalesce(coste_base, coste_unitario_uso)
where (unidad_base_coste is null or trim(unidad_base_coste) = '')
   or coste_base is null;

-- Reparación por si hubo ejecuciones parciales con valores inválidos en unidad_base_coste.
update public.purchase_articles
set unidad_base_coste = case
  when lower(trim(unidad_base_coste)) in ('kg', 'kilo', 'kilogramo', 'kilogramos', 'kilos') then 'kg'
  when lower(trim(unidad_base_coste)) in ('l', 'lt', 'litro', 'litros') then 'l'
  when lower(trim(unidad_base_coste)) in ('ud', 'uds', 'unidad', 'unidades') then 'ud'
  when lower(trim(unidad_base_coste)) in ('caja', 'bandeja', 'bolsa', 'paquete', 'racion') then 'ud'
  else null
end
where unidad_base_coste is not null;

update public.purchase_articles
set unidad_por_formato = case
  when lower(trim(unidad_por_formato)) in ('kg', 'kilo', 'kilogramo', 'kilogramos', 'kilos') then 'kg'
  when lower(trim(unidad_por_formato)) in ('l', 'lt', 'litro', 'litros') then 'l'
  when lower(trim(unidad_por_formato)) in ('ud', 'uds', 'unidad', 'unidades') then 'ud'
  else null
end
where unidad_por_formato is not null;

-- Constraints (después del backfill/normalización).
alter table public.purchase_articles
  drop constraint if exists purchase_articles_unidad_base_coste_chk;

alter table public.purchase_articles
  add constraint purchase_articles_unidad_base_coste_chk
  check (unidad_base_coste is null or unidad_base_coste in ('kg', 'l', 'ud'));

alter table public.purchase_articles
  drop constraint if exists purchase_articles_unidad_por_formato_chk;

alter table public.purchase_articles
  add constraint purchase_articles_unidad_por_formato_chk
  check (unidad_por_formato is null or unidad_por_formato in ('kg', 'l', 'ud'));

alter table public.purchase_articles
  drop constraint if exists purchase_articles_coste_base_nonneg_chk;

alter table public.purchase_articles
  add constraint purchase_articles_coste_base_nonneg_chk
  check (coste_base is null or coste_base >= 0);

alter table public.purchase_articles
  drop constraint if exists purchase_articles_cantidad_por_formato_pos_chk;

alter table public.purchase_articles
  add constraint purchase_articles_cantidad_por_formato_pos_chk
  check (cantidad_por_formato is null or cantidad_por_formato > 0);

-- 2) Inventario: equivalencia manual por línea (1 unidad inventario = X unidad_coste).
alter table public.inventory_items
  add column if not exists factor_conversion_manual numeric(14, 6);

alter table public.inventory_items
  drop constraint if exists inventory_items_factor_conversion_manual_pos_chk;

alter table public.inventory_items
  add constraint inventory_items_factor_conversion_manual_pos_chk
  check (factor_conversion_manual is null or factor_conversion_manual > 0);

comment on column public.purchase_articles.unidad_base_coste is
  'Unidad real del coste base del artículo máster (kg/L/ud).';
comment on column public.purchase_articles.coste_base is
  'Coste base por unidad_base_coste (ej. €/kg).';
comment on column public.purchase_articles.formato_compra_nombre is
  'Formato físico opcional (bandeja, caja, bolsa, paquete...) para conversiones automáticas.';
comment on column public.purchase_articles.cantidad_por_formato is
  'Cantidad de unidad_por_formato contenida en 1 formato_compra_nombre.';
comment on column public.purchase_articles.unidad_por_formato is
  'Unidad (kg/L/ud) usada por cantidad_por_formato.';
comment on column public.inventory_items.factor_conversion_manual is
  'Equivalencia manual: 1 unidad inventario (unit) = X unidad_coste.';

