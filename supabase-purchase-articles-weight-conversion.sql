-- Equivalencia por artículo para escandallos: volumen usado en receta -> peso de entrada.
-- Ejemplos:
--   Nata:  1 l = 1 kg
--   Aceite: 1 l = 0.92 kg
--   Leche: 1 l = 1.03 kg

alter table if exists public.purchase_articles
  add column if not exists conversion_to_weight_enabled boolean not null default false,
  add column if not exists conversion_weight_unit text,
  add column if not exists conversion_volume_unit text,
  add column if not exists conversion_factor numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_articles_conversion_weight_unit_chk'
  ) then
    alter table public.purchase_articles
      add constraint purchase_articles_conversion_weight_unit_chk
      check (conversion_weight_unit is null or conversion_weight_unit in ('kg', 'g'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_articles_conversion_volume_unit_chk'
  ) then
    alter table public.purchase_articles
      add constraint purchase_articles_conversion_volume_unit_chk
      check (conversion_volume_unit is null or conversion_volume_unit in ('l', 'ml'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_articles_conversion_factor_chk'
  ) then
    alter table public.purchase_articles
      add constraint purchase_articles_conversion_factor_chk
      check (conversion_factor is null or conversion_factor > 0);
  end if;
end $$;

comment on column public.purchase_articles.conversion_to_weight_enabled is
  'Activa equivalencia de volumen a peso para entrada total en escandallos.';
comment on column public.purchase_articles.conversion_volume_unit is
  'Unidad de volumen base de la equivalencia: l o ml.';
comment on column public.purchase_articles.conversion_weight_unit is
  'Unidad de peso resultado de la equivalencia: kg o g.';
comment on column public.purchase_articles.conversion_factor is
  'Peso equivalente para 1 unidad de volumen configurada. Ej: 1 l = 0.92 kg.';
