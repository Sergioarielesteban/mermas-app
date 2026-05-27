-- =============================================================================
-- Chef One SaaS multi-organización: base estructural de aislamiento
--
-- Ejecutar en Supabase SQL Editor antes de vender/activar varias organizaciones.
-- Idempotente: puede ejecutarse varias veces.
--
-- Objetivo:
-- - organization_id como tenant principal.
-- - locals pertenecen a una organization.
-- - profiles pertenecen a una organization y un local.
-- - tablas con local_id / local_central_id reciben organization_id automáticamente.
-- - RLS existente por local queda reforzada con una política RESTRICTIVE por organization_id.
-- - RPCs de Cocina Central dejan de buscar "la primera central global" y buscan la central de la organización actual.
--
-- Importante:
-- - Esta migración NO activa FORCE RLS, para no romper SECURITY DEFINER RPCs existentes.
-- - No elimina datos. Los datos existentes quedan bajo una organización legacy única.
-- - Para separar datos legacy en varias organizaciones, crear organizaciones nuevas y reasignar locals antes de abrir acceso real.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Tenant principal
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'PRO',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
before update on public.organizations
for each row execute procedure public.set_updated_at();

insert into public.organizations (name, slug, plan)
select 'Chef One Legacy', 'chef-one-legacy', 'PRO'
where not exists (select 1 from public.organizations);

alter table public.locals
  add column if not exists organization_id uuid;

alter table public.profiles
  add column if not exists organization_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.locals'::regclass
      and conname = 'locals_organization_id_fkey'
  ) then
    alter table public.locals
      add constraint locals_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_organization_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end $$;

with default_org as (
  select id
  from public.organizations
  order by created_at asc, id asc
  limit 1
)
update public.locals l
set organization_id = d.id
from default_org d
where l.organization_id is null;

update public.profiles p
set organization_id = l.organization_id
from public.locals l
where p.local_id = l.id
  and p.organization_id is null;

alter table public.locals
  alter column organization_id set not null;

alter table public.profiles
  alter column organization_id set not null;

-- Permite repetir códigos de local entre organizaciones, sin permitir duplicados dentro de la misma organización.
alter table public.locals
  drop constraint if exists locals_code_key;

create unique index if not exists locals_organization_code_uidx
  on public.locals (organization_id, lower(trim(code)));

create index if not exists idx_locals_organization_id
  on public.locals (organization_id);

create index if not exists idx_profiles_organization_id
  on public.profiles (organization_id);

-- ---------------------------------------------------------------------------
-- 2) Helpers tenant-aware
-- ---------------------------------------------------------------------------
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.organization_id, l.organization_id)
  from public.profiles p
  left join public.locals l on l.id = p.local_id
  where p.user_id = auth.uid()
    and coalesce(p.is_active, true)
  limit 1
$$;

create or replace function public.current_local_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.local_id
  from public.profiles p
  where p.user_id = auth.uid()
    and coalesce(p.is_active, true)
  limit 1
$$;

create or replace function public.profile_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active, true)
      and p.organization_id = public.current_organization_id()
      and lower(trim(p.role)) = 'admin'
  )
$$;

create or replace function public.profile_local_is_central()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(l.is_central_kitchen, false)
  from public.profiles p
  join public.locals l on l.id = p.local_id
  where p.user_id = auth.uid()
    and coalesce(p.is_active, true)
    and p.organization_id = l.organization_id
  limit 1
$$;

create or replace function public.profile_can_access_cocina_central_module()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active, true)
      and p.organization_id = public.current_organization_id()
      and lower(trim(p.role)) = 'admin'
  )
$$;

create or replace function public.profile_can_manage_central_shipments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.locals l on l.id = p.local_id
    where p.user_id = auth.uid()
      and coalesce(p.is_active, true)
      and p.organization_id = public.current_organization_id()
      and l.organization_id = p.organization_id
      and coalesce(l.is_central_kitchen, false)
      and lower(trim(p.role)) in ('admin', 'manager')
  )
$$;

create or replace function public.current_central_kitchen_local_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from public.locals l
  where l.organization_id = public.current_organization_id()
    and coalesce(l.is_central_kitchen, false)
    and coalesce(l.is_active, true)
  order by l.name asc, l.id asc
  limit 1
$$;

comment on function public.current_organization_id() is
  'organization_id del usuario autenticado. Tenant principal multiempresa Chef One.';

comment on function public.current_central_kitchen_local_id() is
  'Cocina central activa de la organización actual; evita seleccionar una central global de otra empresa.';

grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_local_id() to authenticated;
grant execute on function public.profile_is_admin() to authenticated;
grant execute on function public.profile_local_is_central() to authenticated;
grant execute on function public.profile_can_access_cocina_central_module() to authenticated;
grant execute on function public.profile_can_manage_central_shipments() to authenticated;
grant execute on function public.current_central_kitchen_local_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) organization_id automático para tablas operativas con local
-- ---------------------------------------------------------------------------
create or replace function public.set_row_organization_id_from_local()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  v_local uuid;
  v_org uuid;
begin
  if j ? 'local_id' and nullif(j->>'local_id', '') is not null then
    v_local := (j->>'local_id')::uuid;
  elsif j ? 'local_central_id' and nullif(j->>'local_central_id', '') is not null then
    v_local := (j->>'local_central_id')::uuid;
  elsif j ? 'local_origen_id' and nullif(j->>'local_origen_id', '') is not null then
    v_local := (j->>'local_origen_id')::uuid;
  elsif j ? 'local_solicitante_id' and nullif(j->>'local_solicitante_id', '') is not null then
    v_local := (j->>'local_solicitante_id')::uuid;
  elsif j ? 'local_destino_id' and nullif(j->>'local_destino_id', '') is not null then
    v_local := (j->>'local_destino_id')::uuid;
  end if;

  if v_local is not null then
    select l.organization_id
      into v_org
    from public.locals l
    where l.id = v_local;
  end if;

  if v_org is null and auth.uid() is not null then
    v_org := public.current_organization_id();
  end if;

  if v_org is null then
    return new;
  end if;

  if new.organization_id is null then
    new.organization_id := v_org;
  elsif new.organization_id is distinct from v_org then
    raise exception 'organization_id no coincide con el local de la fila';
  end if;

  return new;
end;
$$;

grant execute on function public.set_row_organization_id_from_local() to authenticated;

do $$
declare
  r record;
  has_local_id boolean;
  has_local_central_id boolean;
  has_local_origen_id boolean;
  has_local_solicitante_id boolean;
  has_local_destino_id boolean;
  null_count bigint;
  idx_name text;
begin
  for r in
    select c.table_schema, c.table_name, format('%I.%I', c.table_schema, c.table_name) as fqtn
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('local_id', 'local_central_id', 'local_origen_id', 'local_solicitante_id', 'local_destino_id')
      and c.table_name not in ('locals', 'profiles', 'organizations')
    group by c.table_schema, c.table_name
  loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = r.table_schema and table_name = r.table_name and column_name = 'local_id'
    ) into has_local_id;

    select exists (
      select 1 from information_schema.columns
      where table_schema = r.table_schema and table_name = r.table_name and column_name = 'local_central_id'
    ) into has_local_central_id;

    select exists (
      select 1 from information_schema.columns
      where table_schema = r.table_schema and table_name = r.table_name and column_name = 'local_origen_id'
    ) into has_local_origen_id;

    select exists (
      select 1 from information_schema.columns
      where table_schema = r.table_schema and table_name = r.table_name and column_name = 'local_solicitante_id'
    ) into has_local_solicitante_id;

    select exists (
      select 1 from information_schema.columns
      where table_schema = r.table_schema and table_name = r.table_name and column_name = 'local_destino_id'
    ) into has_local_destino_id;

    execute format('alter table %s add column if not exists organization_id uuid', r.fqtn);

    if not exists (
      select 1
      from pg_constraint
      where conrelid = (r.fqtn)::regclass
        and conname = 'organization_id_fkey'
    ) then
      execute format(
        'alter table %s add constraint organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete restrict',
        r.fqtn
      );
    end if;

    if has_local_id then
      execute format(
        'update %s t set organization_id = l.organization_id from public.locals l where t.organization_id is null and t.local_id = l.id',
        r.fqtn
      );
    end if;

    if has_local_central_id then
      execute format(
        'update %s t set organization_id = l.organization_id from public.locals l where t.organization_id is null and t.local_central_id = l.id',
        r.fqtn
      );
    end if;

    if has_local_origen_id then
      execute format(
        'update %s t set organization_id = l.organization_id from public.locals l where t.organization_id is null and t.local_origen_id = l.id',
        r.fqtn
      );
    end if;

    if has_local_solicitante_id then
      execute format(
        'update %s t set organization_id = l.organization_id from public.locals l where t.organization_id is null and t.local_solicitante_id = l.id',
        r.fqtn
      );
    end if;

    if has_local_destino_id then
      execute format(
        'update %s t set organization_id = l.organization_id from public.locals l where t.organization_id is null and t.local_destino_id = l.id',
        r.fqtn
      );
    end if;

    idx_name := 'idx_' || substr(md5(r.table_name || '_organization_id'), 1, 18) || '_org';
    execute format('create index if not exists %I on %s (organization_id)', idx_name, r.fqtn);

    execute format('drop trigger if exists trg_set_organization_id_from_local on %s', r.fqtn);
    execute format(
      'create trigger trg_set_organization_id_from_local before insert or update on %s for each row execute procedure public.set_row_organization_id_from_local()',
      r.fqtn
    );

    execute format('select count(*) from %s where organization_id is null', r.fqtn) into null_count;
    if null_count = 0 then
      execute format('alter table %s alter column organization_id set not null', r.fqtn);
    else
      raise notice '%.% queda con % filas sin organization_id; revisar datos legacy antes de exigir NOT NULL.',
        r.table_schema, r.table_name, null_count;
    end if;

    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = r.table_schema
        and c.relname = r.table_name
        and c.relrowsecurity = true
    ) then
      execute format('drop policy if exists tenant_organization_guard on %s', r.fqtn);
      execute format(
        'create policy tenant_organization_guard on %s as restrictive for all to authenticated using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id())',
        r.fqtn
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) RLS explícita para organizaciones y perfiles
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.locals enable row level security;
alter table public.profiles enable row level security;

drop policy if exists organizations_select_current on public.organizations;
create policy organizations_select_current
on public.organizations
for select
to authenticated
using (id = public.current_organization_id() and is_active = true);

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin
on public.organizations
for update
to authenticated
using (id = public.current_organization_id() and public.profile_is_admin())
with check (id = public.current_organization_id() and public.profile_is_admin());

drop policy if exists locals_select_current_org on public.locals;
create policy locals_select_current_org
on public.locals
for select
to authenticated
using (organization_id = public.current_organization_id());

drop policy if exists locals_write_current_org_admin on public.locals;
create policy locals_write_current_org_admin
on public.locals
for all
to authenticated
using (organization_id = public.current_organization_id() and public.profile_is_admin())
with check (organization_id = public.current_organization_id() and public.profile_is_admin());

drop policy if exists profiles_select_current_org on public.profiles;
create policy profiles_select_current_org
on public.profiles
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and (
    user_id = auth.uid()
    or public.profile_is_admin()
  )
);

drop policy if exists profiles_write_current_org_admin on public.profiles;
create policy profiles_write_current_org_admin
on public.profiles
for all
to authenticated
using (organization_id = public.current_organization_id() and public.profile_is_admin())
with check (organization_id = public.current_organization_id() and public.profile_is_admin());

-- ---------------------------------------------------------------------------
-- 5) RLS reforzada para tablas Advisor de Cocina Central
-- ---------------------------------------------------------------------------
alter table public.central_inventory_products enable row level security;
alter table public.central_catalog_products enable row level security;
alter table public.cc_lote_counters enable row level security;

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
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_inv_products_insert_same_central
on public.central_inventory_products
for insert
to authenticated
with check (
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_inv_products_update_same_central
on public.central_inventory_products
for update
to authenticated
using (
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
)
with check (
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_inv_products_delete_same_central
on public.central_inventory_products
for delete
to authenticated
using (
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

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
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_catalog_products_insert_same_central
on public.central_catalog_products
for insert
to authenticated
with check (
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_catalog_products_update_same_central
on public.central_catalog_products
for update
to authenticated
using (
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
)
with check (
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_catalog_products_delete_same_central
on public.central_catalog_products
for delete
to authenticated
using (
  organization_id = public.current_organization_id()
  and local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

drop policy if exists cc_lote_counters_select_same_central on public.cc_lote_counters;
drop policy if exists cc_lote_counters_insert_same_central on public.cc_lote_counters;
drop policy if exists cc_lote_counters_update_same_central on public.cc_lote_counters;
drop policy if exists cc_lote_counters_delete_same_central on public.cc_lote_counters;

create policy cc_lote_counters_select_same_central
on public.cc_lote_counters
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_lote_counters_insert_same_central
on public.cc_lote_counters
for insert
to authenticated
with check (
  organization_id = public.current_organization_id()
  and local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_lote_counters_update_same_central
on public.cc_lote_counters
for update
to authenticated
using (
  organization_id = public.current_organization_id()
  and local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
)
with check (
  organization_id = public.current_organization_id()
  and local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

create policy cc_lote_counters_delete_same_central
on public.cc_lote_counters
for delete
to authenticated
using (
  organization_id = public.current_organization_id()
  and local_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

-- ---------------------------------------------------------------------------
-- 6) Cocina Central: RPCs sin fuga multiempresa
-- ---------------------------------------------------------------------------
create or replace function public.cc_list_delivery_destinations()
returns table (id uuid, code text, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.profile_can_manage_central_shipments() then
    raise exception 'No autorizado';
  end if;

  return query
  select l.id, l.code, l.name
  from public.locals l
  where coalesce(l.is_active, true)
    and l.organization_id = public.current_organization_id()
    and l.id is distinct from public.current_local_id()
  order by l.name;
end;
$$;

create or replace function public.cc_list_central_supply_catalog()
returns table (
  catalog_product_id uuid,
  nombre_producto text,
  descripcion text,
  unidad_venta text,
  precio_venta numeric
)
language plpgsql
security definer
set search_path = public
as $cc_list$
declare
  v_central_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if public.profile_local_is_central() then
    raise exception 'El catálogo de pedido es solo para sedes satélite';
  end if;

  v_central_id := public.current_central_kitchen_local_id();
  if v_central_id is null then
    raise exception 'No hay cocina central configurada para esta organización';
  end if;

  return query
  select
    c.id,
    c.nombre_producto,
    coalesce(c.descripcion, '')::text,
    c.unidad_venta,
    c.precio_venta
  from public.central_catalog_products c
  where c.organization_id = public.current_organization_id()
    and c.local_central_id = v_central_id
    and c.activo = true
    and c.visible_para_locales = true
  order by c.orden asc, c.nombre_producto asc;
end;
$cc_list$;

create or replace function public.cc_submit_supply_order(
  p_fecha_entrega date,
  p_items jsonb,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_solicitante uuid;
  v_central_id uuid;
  v_order uuid;
  v_lab_sol text;
  v_lab_cen text;
  x jsonb;
  v_cid uuid;
  v_pid uuid;
  v_qty numeric;
  v_name text;
  v_unit text;
  v_pu numeric;
  v_line numeric;
  v_sum numeric := 0;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if public.profile_local_is_central() then
    raise exception 'Solo sedes satélite pueden crear pedidos de suministro';
  end if;

  v_org := public.current_organization_id();
  v_solicitante := public.current_local_id();
  v_central_id := public.current_central_kitchen_local_id();

  if v_org is null then raise exception 'Sin organización en perfil'; end if;
  if v_solicitante is null then raise exception 'Sin local en perfil'; end if;
  if v_central_id is null then raise exception 'No hay cocina central configurada para esta organización'; end if;

  select l.name into v_lab_sol
  from public.locals l
  where l.id = v_solicitante
    and l.organization_id = v_org
  limit 1;

  select l.name into v_lab_cen
  from public.locals l
  where l.id = v_central_id
    and l.organization_id = v_org
  limit 1;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Añade al menos una línea al pedido';
  end if;

  insert into public.central_supply_orders (
    organization_id,
    local_solicitante_id,
    local_central_id,
    fecha_entrega_deseada,
    estado,
    notas,
    local_solicitante_label,
    local_central_label,
    created_by,
    total_eur
  )
  values (
    v_org,
    v_solicitante,
    v_central_id,
    p_fecha_entrega,
    'enviado',
    nullif(trim(p_notas), ''),
    v_lab_sol,
    v_lab_cen,
    v_uid,
    0
  )
  returning id into v_order;

  for x in select * from jsonb_array_elements(p_items) loop
    v_qty := (x->>'cantidad')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida en una línea';
    end if;

    if (x ? 'catalog_product_id') and (x->>'catalog_product_id') is not null
       and btrim(x->>'catalog_product_id') <> '' then
      v_cid := (x->>'catalog_product_id')::uuid;
      select c.nombre_producto, c.unidad_venta, c.precio_venta
      into v_name, v_unit, v_pu
      from public.central_catalog_products c
      where c.id = v_cid
        and c.organization_id = v_org
        and c.local_central_id = v_central_id
        and c.activo = true
        and c.visible_para_locales = true;

      if v_name is null then
        raise exception 'Producto de catálogo no disponible';
      end if;

      v_line := round(v_qty * v_pu, 2);
      v_sum := v_sum + v_line;

      insert into public.central_supply_order_items (
        organization_id,
        order_id,
        catalog_product_id,
        product_id,
        product_name,
        cantidad,
        unidad,
        precio_unitario_eur,
        line_total_eur
      ) values (
        v_org,
        v_order,
        v_cid,
        null,
        v_name,
        v_qty,
        v_unit,
        v_pu,
        v_line
      );
    elsif (x ? 'product_id') and (x->>'product_id') is not null
          and btrim(x->>'product_id') <> '' then
      v_pid := (x->>'product_id')::uuid;
      select p.name, p.unit::text, p.price_per_unit
      into v_name, v_unit, v_pu
      from public.products p
      where p.id = v_pid
        and p.organization_id = v_org
        and p.local_id = v_central_id
        and p.is_active = true;

      if v_name is null then
        raise exception 'Producto no disponible en catálogo central (legado)';
      end if;

      v_line := round(v_qty * v_pu, 2);
      v_sum := v_sum + v_line;

      insert into public.central_supply_order_items (
        organization_id,
        order_id,
        catalog_product_id,
        product_id,
        product_name,
        cantidad,
        unidad,
        precio_unitario_eur,
        line_total_eur
      ) values (
        v_org,
        v_order,
        null,
        v_pid,
        v_name,
        v_qty,
        v_unit,
        v_pu,
        v_line
      );
    else
      raise exception 'Cada línea debe incluir catalog_product_id o product_id (legado)';
    end if;
  end loop;

  update public.central_supply_orders
  set total_eur = round(v_sum, 2)
  where id = v_order
    and organization_id = v_org;

  return v_order;
end;
$fn$;

create or replace function public.cc_list_public_recipe_catalog()
returns table (
  id uuid,
  local_central_id uuid,
  name text,
  category text,
  output_quantity numeric,
  output_unit text,
  unit_cost numeric,
  format_cost numeric,
  active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_central_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  v_org := public.current_organization_id();
  if public.profile_local_is_central() then
    v_central_id := public.current_local_id();
  else
    v_central_id := public.current_central_kitchen_local_id();
  end if;

  if v_org is null then
    raise exception 'Sin organización en perfil';
  end if;
  if v_central_id is null then
    raise exception 'No hay cocina central configurada para esta organización';
  end if;

  return query
  select
    r.id,
    r.local_central_id,
    r.name,
    coalesce(r.recipe_category, 'otro')::text,
    case
      when r.base_yield_quantity is not null and r.base_yield_quantity > 0 then r.base_yield_quantity
      else 1
    end as output_quantity,
    coalesce(nullif(trim(a.unidad_uso), ''), nullif(trim(r.final_unit), ''), nullif(trim(r.base_yield_unit), ''), 'ud')::text as output_unit,
    coalesce(a.coste_unitario_uso, a.coste_master) as unit_cost,
    case
      when coalesce(a.coste_unitario_uso, a.coste_master) is not null
        and r.base_yield_quantity is not null
        and r.base_yield_quantity > 0
      then round((coalesce(a.coste_unitario_uso, a.coste_master) * r.base_yield_quantity)::numeric, 4)
      else null
    end as format_cost,
    coalesce(r.is_active, true) as active,
    greatest(r.updated_at, a.updated_at) as updated_at
  from public.production_recipes r
  left join public.purchase_articles a
    on a.organization_id = v_org
   and a.local_id = r.local_central_id
   and a.central_production_recipe_id = r.id
  where r.organization_id = v_org
    and r.local_central_id = v_central_id
  order by lower(trim(r.name)) asc;
end;
$fn$;

revoke all on function public.cc_list_delivery_destinations() from public;
revoke all on function public.cc_list_central_supply_catalog() from public;
revoke all on function public.cc_submit_supply_order(date, jsonb, text) from public;
revoke all on function public.cc_list_public_recipe_catalog() from public;

grant execute on function public.cc_list_delivery_destinations() to authenticated;
grant execute on function public.cc_list_central_supply_catalog() to authenticated;
grant execute on function public.cc_submit_supply_order(date, jsonb, text) to authenticated;
grant execute on function public.cc_list_public_recipe_catalog() to authenticated;

-- La vista depende de purchase_articles, que queda reforzada por organization_id + RLS.
do $$
begin
  if to_regclass('public.purchase_article_duplicate_candidates') is not null then
    execute 'alter view public.purchase_article_duplicate_candidates set (security_invoker = true)';
    comment on view public.purchase_article_duplicate_candidates is
      'Pares de artículos con nombre parecido (pg_trgm). SECURITY INVOKER: hereda RLS tenant-aware de purchase_articles.';
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Verificación manual tras ejecutar:
-- ---------------------------------------------------------------------------
-- select id, name, slug, is_active from public.organizations order by created_at;
-- select id, code, name, organization_id from public.locals order by name;
-- select user_id, email, local_id, organization_id, role, is_active from public.profiles order by email;
--
-- Tablas con organization_id nulo que requieren revisión:
-- select table_schema, table_name
-- from information_schema.columns
-- where table_schema = 'public' and column_name = 'organization_id'
-- order by table_name;
--
-- Advisor/RLS:
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('central_inventory_products', 'central_catalog_products', 'cc_lote_counters');
--
-- Restrictive guards aplicadas:
-- select schemaname, tablename, policyname, permissive, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and policyname = 'tenant_organization_guard'
-- order by tablename;
