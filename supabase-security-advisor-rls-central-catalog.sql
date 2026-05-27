-- =============================================================================
-- Security Advisor: RLS Cocina Central + SECURITY INVOKER duplicate candidates
--
-- Ejecutar en Supabase SQL Editor.
-- Idempotente: se puede ejecutar varias veces.
--
-- Tenant real del esquema Chef One:
-- - central_inventory_products: local_central_id
-- - central_catalog_products: local_central_id
-- - cc_lote_counters: local_id
--
-- No se han encontrado columnas group_id / organization_id / restaurant_id en
-- estas tablas dentro del esquema actual. Si se añaden, deben incorporarse a las
-- funciones/políticas de tenant antes de permitir uso multi-organización.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) central_inventory_products
-- ---------------------------------------------------------------------------
alter table public.central_inventory_products enable row level security;

drop policy if exists cc_inv_products_rw on public.central_inventory_products;
drop policy if exists cc_inv_products_select_same_central on public.central_inventory_products;
drop policy if exists cc_inv_products_insert_same_central on public.central_inventory_products;
drop policy if exists cc_inv_products_update_same_central on public.central_inventory_products;
drop policy if exists cc_inv_products_delete_same_central on public.central_inventory_products;

create policy cc_inv_products_select_same_central
on public.central_inventory_products
for select
to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_inv_products_insert_same_central
on public.central_inventory_products
for insert
to authenticated
with check (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_inv_products_update_same_central
on public.central_inventory_products
for update
to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
)
with check (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_inv_products_delete_same_central
on public.central_inventory_products
for delete
to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

-- ---------------------------------------------------------------------------
-- 2) central_catalog_products
-- ---------------------------------------------------------------------------
alter table public.central_catalog_products enable row level security;

drop policy if exists cc_catalog_products_rw on public.central_catalog_products;
drop policy if exists cc_catalog_products_select_same_central on public.central_catalog_products;
drop policy if exists cc_catalog_products_insert_same_central on public.central_catalog_products;
drop policy if exists cc_catalog_products_update_same_central on public.central_catalog_products;
drop policy if exists cc_catalog_products_delete_same_central on public.central_catalog_products;

create policy cc_catalog_products_select_same_central
on public.central_catalog_products
for select
to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_catalog_products_insert_same_central
on public.central_catalog_products
for insert
to authenticated
with check (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_catalog_products_update_same_central
on public.central_catalog_products
for update
to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
)
with check (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_catalog_products_delete_same_central
on public.central_catalog_products
for delete
to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

-- ---------------------------------------------------------------------------
-- 3) cc_lote_counters
-- ---------------------------------------------------------------------------
alter table public.cc_lote_counters enable row level security;

drop policy if exists cc_lote_counters_select_same_central on public.cc_lote_counters;
drop policy if exists cc_lote_counters_insert_same_central on public.cc_lote_counters;
drop policy if exists cc_lote_counters_update_same_central on public.cc_lote_counters;
drop policy if exists cc_lote_counters_delete_same_central on public.cc_lote_counters;

create policy cc_lote_counters_select_same_central
on public.cc_lote_counters
for select
to authenticated
using (
  local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_lote_counters_insert_same_central
on public.cc_lote_counters
for insert
to authenticated
with check (
  local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_lote_counters_update_same_central
on public.cc_lote_counters
for update
to authenticated
using (
  local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
)
with check (
  local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_lote_counters_delete_same_central
on public.cc_lote_counters
for delete
to authenticated
using (
  local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

-- ---------------------------------------------------------------------------
-- 4) Vista purchase_article_duplicate_candidates
-- ---------------------------------------------------------------------------
-- La vista solo lee purchase_articles, que ya tiene RLS por local_id.
-- SECURITY INVOKER evita bypass de RLS y fuga multiempresa.
alter view public.purchase_article_duplicate_candidates
set (security_invoker = true);

comment on view public.purchase_article_duplicate_candidates is
  'Pares de artículos con nombre parecido (pg_trgm). SECURITY INVOKER: hereda RLS de purchase_articles por local_id.';

commit;

-- ---------------------------------------------------------------------------
-- Verificación manual recomendada tras ejecutar:
-- ---------------------------------------------------------------------------
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('central_inventory_products', 'central_catalog_products', 'cc_lote_counters');
--
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('central_inventory_products', 'central_catalog_products', 'cc_lote_counters')
-- order by tablename, policyname;
--
-- select n.nspname as schemaname, c.relname as viewname, c.reloptions
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname = 'purchase_article_duplicate_candidates';
