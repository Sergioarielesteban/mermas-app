-- Migración suave: origen dinámico de coste en productos/mermas.
-- Todos los productos existentes quedan como manual y conservan precio actual.

alter table public.products
  add column if not exists tipo_origen text not null default 'manual',
  add column if not exists master_article_id uuid null references public.purchase_articles(id) on delete set null,
  add column if not exists escandallo_id uuid null references public.escandallo_recipes(id) on delete set null,
  add column if not exists precio_manual numeric(10,2) null,
  add column if not exists composicion_json jsonb null;

update public.products
set
  tipo_origen = coalesce(tipo_origen, 'manual'),
  precio_manual = coalesce(precio_manual, price_per_unit)
where true;

alter table public.products
  drop constraint if exists products_tipo_origen_check;
alter table public.products
  add constraint products_tipo_origen_check
  check (tipo_origen in ('manual', 'master', 'escandallo', 'composicion'));

create index if not exists idx_products_master_article_id on public.products(master_article_id);
create index if not exists idx_products_escandallo_id on public.products(escandallo_id);

alter table public.mermas
  add column if not exists tipo_origen_usado text null,
  add column if not exists coste_unitario_snapshot numeric(12,4) null,
  add column if not exists coste_total_snapshot numeric(12,2) null,
  add column if not exists composicion_snapshot_json jsonb null;

alter table public.mermas
  drop constraint if exists mermas_tipo_origen_usado_check;
alter table public.mermas
  add constraint mermas_tipo_origen_usado_check
  check (tipo_origen_usado is null or tipo_origen_usado in ('manual', 'master', 'escandallo', 'composicion', 'sin_precio'));

update public.mermas
set
  tipo_origen_usado = coalesce(tipo_origen_usado, 'manual'),
  coste_total_snapshot = coalesce(coste_total_snapshot, cost_eur),
  coste_unitario_snapshot = coalesce(coste_unitario_snapshot, case when quantity > 0 then round((cost_eur / quantity)::numeric, 4) else 0 end)
where true;
