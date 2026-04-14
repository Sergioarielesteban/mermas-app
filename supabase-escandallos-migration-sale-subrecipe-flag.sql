-- Escandallos: precio venta (PVP con IVA), tipo IVA, y marca sub-receta.
-- Ejecutar en Supabase SQL Editor tras supabase-escandallos-schema.sql

alter table public.escandallo_recipes add column if not exists is_sub_recipe boolean not null default false;

alter table public.escandallo_recipes add column if not exists sale_vat_rate_pct numeric(5, 2);
alter table public.escandallo_recipes add column if not exists sale_price_gross_eur numeric(12, 4);

comment on column public.escandallo_recipes.is_sub_recipe is 'true = base intermedia (picadillo); false = plato / escandallo principal';
comment on column public.escandallo_recipes.sale_vat_rate_pct is 'IVA % aplicado al PVP (ej. 10)';
comment on column public.escandallo_recipes.sale_price_gross_eur is 'Precio venta público con IVA incluido (por unidad de yield)';
