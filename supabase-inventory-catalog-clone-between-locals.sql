-- =============================================================================
-- Clonar catálogo de inventario entre locales (sin volverlo global)
-- =============================================================================
-- Objetivo:
--   - Copiar categorías + artículos de un local origen a uno o varios destinos.
--   - Mantener independencia: después cada local edita su catálogo sin afectar a los demás.
--
-- Requiere:
--   - supabase-inventory-catalog-per-local.sql aplicado.
--
-- Seguridad:
--   - Este script solo INSERTA lo que no exista en destino (no borra ni pisa cambios).
-- =============================================================================

create or replace function public.clone_inventory_catalog_between_locals(
  source_local_code text,
  target_local_code text
)
returns table (inserted_categories integer, inserted_items integer)
language plpgsql
as $$
declare
  source_local_id uuid;
  target_local_id uuid;
  cat_count integer := 0;
  item_count integer := 0;
begin
  select id into source_local_id
  from public.locals
  where upper(trim(code)) = upper(trim(source_local_code))
  limit 1;

  if source_local_id is null then
    raise exception 'Local origen no encontrado: %', source_local_code;
  end if;

  select id into target_local_id
  from public.locals
  where upper(trim(code)) = upper(trim(target_local_code))
  limit 1;

  if target_local_id is null then
    raise exception 'Local destino no encontrado: %', target_local_code;
  end if;

  if source_local_id = target_local_id then
    raise exception 'Origen y destino no pueden ser el mismo local (%).', source_local_code;
  end if;

  -- 1) Categorías activas del origen que no existan en destino por nombre normalizado.
  insert into public.inventory_catalog_categories (local_id, name, sort_order, is_active)
  select target_local_id, c.name, c.sort_order, c.is_active
  from public.inventory_catalog_categories c
  where c.local_id = source_local_id
    and c.is_active = true
    and not exists (
      select 1
      from public.inventory_catalog_categories t
      where t.local_id = target_local_id
        and lower(trim(t.name)) = lower(trim(c.name))
    );

  get diagnostics cat_count = row_count;

  -- 2) Artículos activos del origen que no existan en destino por (categoría+nombre).
  insert into public.inventory_catalog_items (
    local_id,
    catalog_category_id,
    name,
    unit,
    default_price_per_unit,
    format_label,
    sort_order,
    is_active
  )
  select
    target_local_id,
    tc.id as catalog_category_id,
    si.name,
    si.unit,
    si.default_price_per_unit,
    si.format_label,
    si.sort_order,
    si.is_active
  from public.inventory_catalog_items si
  join public.inventory_catalog_categories sc on sc.id = si.catalog_category_id
  join public.inventory_catalog_categories tc
    on tc.local_id = target_local_id
   and lower(trim(tc.name)) = lower(trim(sc.name))
  where si.local_id = source_local_id
    and si.is_active = true
    and not exists (
      select 1
      from public.inventory_catalog_items ti
      where ti.local_id = target_local_id
        and ti.catalog_category_id = tc.id
        and lower(trim(ti.name)) = lower(trim(si.name))
    );

  get diagnostics item_count = row_count;

  return query select cat_count, item_count;
end;
$$;

comment on function public.clone_inventory_catalog_between_locals(text, text)
  is 'Clona categorías y artículos activos de un local origen a otro destino sin sobrescribir.';

-- =============================================================================
-- EJEMPLOS DE USO
-- =============================================================================
-- 1) Copiar de PREMIA a MATARO (recuperar base en Mataró):
-- select * from public.clone_inventory_catalog_between_locals('PREMIA', 'MATARO');
--
-- 2) Copiar el mismo base a más locales:
-- select * from public.clone_inventory_catalog_between_locals('PREMIA', 'LOCAL3');
-- select * from public.clone_inventory_catalog_between_locals('PREMIA', 'LOCAL4');
--
-- 3) Ver conteo por local después de copiar:
-- select l.code, count(c.id) as categorias
-- from public.locals l
-- left join public.inventory_catalog_categories c on c.local_id = l.id and c.is_active = true
-- group by l.code
-- order by l.code;
