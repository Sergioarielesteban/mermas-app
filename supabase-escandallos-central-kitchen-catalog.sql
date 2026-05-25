-- Escandallos + Cocina Central: catálogo público seguro sin exponer fórmula interna.

alter table public.escandallo_recipe_lines
  add column if not exists central_production_recipe_id uuid references public.production_recipes(id) on delete set null;

create index if not exists idx_escandallo_lines_central_recipe_id
  on public.escandallo_recipe_lines(central_production_recipe_id)
  where central_production_recipe_id is not null;

alter table public.escandallo_recipe_lines
  drop constraint if exists escandallo_recipe_lines_source_type_check;

alter table public.escandallo_recipe_lines
  add constraint escandallo_recipe_lines_source_type_check
  check (source_type in ('raw', 'processed', 'manual', 'subrecipe', 'central_kitchen'));

drop function if exists public.cc_list_public_recipe_catalog();

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
  v_central_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if public.profile_local_is_central() then
    v_central_id := public.current_local_id();
  else
    select l.id
      into v_central_id
    from public.locals l
    where l.is_central_kitchen = true and coalesce(l.is_active, true)
    order by l.name
    limit 1;
  end if;

  if v_central_id is null then
    raise exception 'No hay cocina central configurada';
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
    on a.local_id = r.local_central_id
   and a.central_production_recipe_id = r.id
  where r.local_central_id = v_central_id
  order by lower(trim(r.name)) asc;
end;
$fn$;

revoke all on function public.cc_list_public_recipe_catalog() from public;
grant execute on function public.cc_list_public_recipe_catalog() to authenticated;
