-- =============================================================================
-- Pedidos / Compras: artículos base (purchase_articles) + vínculo catálogo proveedor
-- =============================================================================
-- Objetivo: cada fila de pedido_supplier_products puede enlazar a un artículo base
-- sin borrar ni sustituir datos existentes. Migración idempotente y revisable.
--
-- Requisitos previos: public.locals, public.pedido_suppliers, public.pedido_supplier_products,
--                     public.set_updated_at(), public.current_local_id()
--
-- Cómo ejecutar: Supabase Dashboard → SQL → pegar todo → Run
-- Puede ejecutarse varias veces: solo crea artículos y enlaces faltantes.
--
-- Reversión manual (solo si hace falta): ver comentario al final del archivo.
-- =============================================================================

create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- 1) Tabla artículos base (compras)
-- -----------------------------------------------------------------------------
create table if not exists public.purchase_articles (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  nombre text not null,
  nombre_corto text,
  categoria text,
  subcategoria text,
  descripcion text,
  unidad_base text,
  activo boolean not null default true,
  coste_master numeric(12, 4),
  metodo_coste_master text,
  /** Momento en que se fijó coste_master en migración o alta automática (trazabilidad). */
  coste_master_fijado_en timestamptz,
  proveedor_preferido_id uuid references public.pedido_suppliers(id) on delete set null,
  observaciones text not null default '',
  /**
   * Trazabilidad 1:1 con el producto de catálogo que originó el artículo en migración o alta.
   * Nullable para artículos creados manualmente en el futuro.
   */
  created_from_supplier_product_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_articles_unidad_base_chk check (
    unidad_base is null
    or unidad_base in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')
  )
);

create unique index if not exists purchase_articles_created_from_supplier_product_uidx
  on public.purchase_articles(created_from_supplier_product_id)
  where created_from_supplier_product_id is not null;

create index if not exists idx_purchase_articles_local_id on public.purchase_articles(local_id);
create index if not exists idx_purchase_articles_nombre_lower_trgm
  on public.purchase_articles using gin (lower(nombre) gin_trgm_ops);
create index if not exists idx_purchase_articles_proveedor_pref on public.purchase_articles(proveedor_preferido_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchase_articles_created_from_fkey'
  ) then
    alter table public.purchase_articles
      add constraint purchase_articles_created_from_fkey
      foreign key (created_from_supplier_product_id)
      references public.pedido_supplier_products(id)
      on delete set null;
  end if;
end $$;

drop trigger if exists trg_purchase_articles_updated_at on public.purchase_articles;
create trigger trg_purchase_articles_updated_at
before update on public.purchase_articles
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Catálogo proveedor: enlace opcional + trazabilidad migración
-- -----------------------------------------------------------------------------
alter table public.pedido_supplier_products
  add column if not exists article_id uuid references public.purchase_articles(id) on delete set null;

alter table public.pedido_supplier_products
  add column if not exists migrated_to_article boolean not null default false;

alter table public.pedido_supplier_products
  add column if not exists migrated_at timestamptz;

create index if not exists idx_pedido_supplier_products_article_id
  on public.pedido_supplier_products(article_id);

-- -----------------------------------------------------------------------------
-- 3) RLS (mismo criterio que el resto de pedidos)
-- -----------------------------------------------------------------------------
alter table public.purchase_articles enable row level security;

drop policy if exists "purchase articles same local read" on public.purchase_articles;
create policy "purchase articles same local read"
on public.purchase_articles
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "purchase articles same local write" on public.purchase_articles;
create policy "purchase articles same local write"
on public.purchase_articles
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- -----------------------------------------------------------------------------
-- 4) Vista: posibles duplicados por nombre parecido (revisión manual; NO fusiona)
-- -----------------------------------------------------------------------------
-- Umbral: ajustar similarity (0–1). Más bajo = más filas. Revisar en SQL Editor.
create or replace view public.purchase_article_duplicate_candidates as
select
  a.id as article_id_a,
  b.id as article_id_b,
  a.local_id,
  a.nombre as nombre_a,
  b.nombre as nombre_b,
  similarity(lower(a.nombre), lower(b.nombre))::real as score
from public.purchase_articles a
join public.purchase_articles b
  on a.local_id = b.local_id
  and a.id < b.id
where a.activo
  and b.activo
  and similarity(lower(a.nombre), lower(b.nombre)) > 0.42;

comment on view public.purchase_article_duplicate_candidates is
  'Pares de artículos con nombre parecido (pg_trgm). Solo referencia humana; no agrupa automáticamente.';

-- -----------------------------------------------------------------------------
-- 5) Migración de datos (idempotente)
-- -----------------------------------------------------------------------------
-- Crea un artículo por cada producto de proveedor sin article_id y sin fila puente previa.
-- Incluye activos e inactivos para no perder histórico de catálogo.

begin;

insert into public.purchase_articles (
  local_id,
  nombre,
  nombre_corto,
  unidad_base,
  activo,
  coste_master,
  metodo_coste_master,
  coste_master_fijado_en,
  proveedor_preferido_id,
  observaciones,
  created_from_supplier_product_id
)
select
  p.local_id,
  p.name,
  case
    when length(trim(p.name)) > 48 then left(trim(p.name), 48)
    else null
  end,
  p.unit::text,
  p.is_active,
  p.price_per_unit,
  'migrado',
  now(),
  p.supplier_id,
  'Artículo base generado en migración v1 (supabase-pedidos-migration-purchase-articles.sql) desde pedido_supplier_products.',
  p.id
from public.pedido_supplier_products p
where p.article_id is null
  and not exists (
    select 1
    from public.purchase_articles pa
    where pa.created_from_supplier_product_id = p.id
  );

update public.pedido_supplier_products p
set
  article_id = pa.id,
  migrated_to_article = true,
  migrated_at = coalesce(p.migrated_at, now())
from public.purchase_articles pa
where pa.created_from_supplier_product_id = p.id
  and p.article_id is null;

commit;

-- =============================================================================
-- Notas
-- =============================================================================
-- • Compatibilidad: pedidos, líneas, escandallos y albaranes siguen usando
--   pedido_supplier_products y supplier_product_id; article_id es capa nueva.
-- • Idempotencia: segunda ejecución no duplica (índice único created_from + WHERE NOT EXISTS).
-- • Duplicados: consultar select * from purchase_article_duplicate_candidates where local_id = '…';
--
-- Reversión manual (emergencia, tras backup):
--   update pedido_supplier_products set article_id = null, migrated_to_article = false, migrated_at = null;
--   delete from purchase_articles where metodo_coste_master = 'migrado';
--   (Ajustar si hubo artículos no migrados que quieras conservar.)
-- =============================================================================
