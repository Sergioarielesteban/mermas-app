-- =============================================================================
-- Inventario: escritura en catálogo global + snapshots mensuales (KPIs / PDF)
-- =============================================================================
-- Ejecutar en Supabase SQL Editor después de supabase-inventory-schema.sql
--
-- 1) Permite a usuarios autenticados crear categorías y artículos del catálogo
--    desde la app (botones + Categoría / + Artículo).
-- 2) Tabla inventory_month_snapshots: un registro por local y mes (YYYY-MM)
--    para gráficos mes a mes; se rellena al descargar el PDF mensual.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo global: INSERT desde la app
-- -----------------------------------------------------------------------------

drop policy if exists "inventory_catalog_categories insert auth" on public.inventory_catalog_categories;
create policy "inventory_catalog_categories insert auth"
on public.inventory_catalog_categories
for insert
to authenticated
with check (true);

drop policy if exists "inventory_catalog_items insert auth" on public.inventory_catalog_items;
create policy "inventory_catalog_items insert auth"
on public.inventory_catalog_items
for insert
to authenticated
with check (true);

-- -----------------------------------------------------------------------------
-- Snapshots mensuales por local
-- -----------------------------------------------------------------------------

create table if not exists public.inventory_month_snapshots (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete cascade,
  year_month text not null,
  total_value numeric(14, 2) not null,
  lines_count integer not null,
  category_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inventory_month_snapshots_year_month_fmt check (year_month ~ '^\d{4}-\d{2}$'),
  constraint inventory_month_snapshots_local_month unique (local_id, year_month)
);

create index if not exists idx_inventory_month_snapshots_local_month
  on public.inventory_month_snapshots (local_id, year_month desc);

alter table public.inventory_month_snapshots enable row level security;

drop policy if exists "inventory_month_snapshots same local read" on public.inventory_month_snapshots;
create policy "inventory_month_snapshots same local read"
on public.inventory_month_snapshots
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "inventory_month_snapshots same local write" on public.inventory_month_snapshots;
create policy "inventory_month_snapshots same local write"
on public.inventory_month_snapshots
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
