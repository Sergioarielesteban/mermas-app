-- Cocina central: fórmula con prefijo de lote, kg por rendimiento base, meta en lote,
-- y códigos de lote {PREFIJO}{YYYYMMDD}{SEQ} frente a CC-YYYYMMDD-#### genérico.
-- Ejecutar en Supabase después de las migraciones de producción anteriores.

-- 1) Receta: prefijo lote (opcional) y kg totales de salida para el rendimiento base
-- ---------------------------------------------------------------------------
alter table public.production_recipes
  add column if not exists lot_code_prefix text;

alter table public.production_recipes
  add column if not exists weight_kg_per_base_yield numeric(14,4)
  check (weight_kg_per_base_yield is null or weight_kg_per_base_yield > 0);

comment on column public.production_recipes.lot_code_prefix is
  'Prefijo para códigos de lote (p. ej. SALBRAVA). Alfanumérico mayúsculas, sin espacios.';
comment on column public.production_recipes.weight_kg_per_base_yield is
  'Kilogramos de salida del producto para un bloque "rendimiento base" (p. ej. 4 kg para 1 bolsa de la receta base).';

-- 2) Contador de secuencia por local, día y prefijo
-- ---------------------------------------------------------------------------
create table if not exists public.cc_recipe_lote_day_counters (
  local_central_id uuid not null references public.locals(id) on delete cascade,
  day date not null,
  code_prefix text not null,
  seq int not null default 0,
  primary key (local_central_id, day, code_prefix)
);

create index if not exists idx_cc_rec_lote_d_loc_day
  on public.cc_recipe_lote_day_counters (local_central_id, day desc);

-- 3) Próximo código: PREFIJO-YYYYMMDD-NNN (3 dígitos, por prefijo y día)
-- ---------------------------------------------------------------------------
create or replace function public.cc_next_codigo_lote_receta(
  p_local_central_id uuid,
  p_prefix_sanitized text,
  p_day date
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
  ymd text := to_char(p_day, 'YYYYMMDD');
  pref text;
begin
  if p_prefix_sanitized is null or char_length(p_prefix_sanitized) = 0 then
    raise exception 'Prefijo lote inválido';
  end if;
  pref := p_prefix_sanitized;

  insert into public.cc_recipe_lote_day_counters (local_central_id, day, code_prefix, seq)
  values (p_local_central_id, p_day, pref, 1)
  on conflict (local_central_id, day, code_prefix) do update
  set seq = public.cc_recipe_lote_day_counters.seq + 1
  returning seq into n;

  return pref || '-' || ymd || '-' || lpad(n::text, 3, '0');
end;
$$;

revoke all on function public.cc_next_codigo_lote_receta(uuid, text, date) from public;
grant execute on function public.cc_next_codigo_lote_receta(uuid, text, date) to authenticated;

-- 4) Meta almacenada en el lote (costes, kg, fórmula) — rellenada al confirmar
-- ---------------------------------------------------------------------------
alter table public.production_batches
  add column if not exists lote_produccion_meta jsonb;

comment on column public.production_batches.lote_produccion_meta is
  'Snapshot al confirmar: fórmula, kg, costes, unidades.';

-- 5) Sustituir registro de lote: códigos por receta + meta opcional
-- ---------------------------------------------------------------------------
drop function if exists public.cc_register_production_batch_v2(uuid, uuid, uuid, date, date, numeric, text, jsonb);
drop function if exists public.cc_register_production_batch_v2(uuid, uuid, uuid, date, date, numeric, text, jsonb, jsonb);

create or replace function public.cc_register_production_batch_v2(
  p_order_id uuid,
  p_preparation_id uuid,
  p_local_central_id uuid,
  p_fecha_elaboracion date,
  p_fecha_caducidad date,
  p_cantidad numeric,
  p_unidad text,
  p_ingredients jsonb default '[]'::jsonb,
  p_lote_produccion_meta jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_code text;
  v_legacy_product_id uuid;
  v_lot_prefix text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.profile_can_access_cocina_central_module() then
    raise exception 'Solo administradores o encargados pueden registrar producción en cocina central';
  end if;
  if p_local_central_id is distinct from public.current_local_id() then
    raise exception 'Solo puedes producir en tu local';
  end if;
  if not public.profile_local_is_central() then
    raise exception 'Solo cocina central puede registrar lotes';
  end if;
  if not exists (select 1 from public.locals l where l.id = p_local_central_id and l.is_central_kitchen) then
    raise exception 'El local no está marcado como cocina central';
  end if;
  if p_preparation_id is null then
    raise exception 'Elaboración obligatoria';
  end if;
  if p_unidad is null or p_unidad not in ('kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades') then
    raise exception 'Unidad de lote no válida';
  end if;

  select cp.legacy_product_id
    into v_legacy_product_id
  from public.central_preparations cp
  where cp.id = p_preparation_id
    and cp.local_central_id = p_local_central_id
  limit 1;

  if not found then
    raise exception 'Elaboración no válida para este local';
  end if;

  v_lot_prefix := null;
  if p_order_id is not null then
    select upper(regexp_replace(trim(r.lot_code_prefix), '[^A-Z0-9]', '', 'g')) into v_lot_prefix
    from public.production_orders o
    join public.production_recipes r on r.id = o.production_recipe_id
    where o.id = p_order_id
    limit 1;
  end if;
  if v_lot_prefix is not null and char_length(v_lot_prefix) between 1 and 32 then
    v_code := public.cc_next_codigo_lote_receta(p_local_central_id, v_lot_prefix, p_fecha_elaboracion);
  else
    v_code := public.cc_next_codigo_lote(p_local_central_id);
  end if;

  insert into public.production_batches (
    production_order_id, product_id, preparation_id, local_central_id, codigo_lote,
    fecha_elaboracion, fecha_caducidad, cantidad_producida, unidad, estado, lote_produccion_meta
  ) values (
    p_order_id, v_legacy_product_id, p_preparation_id, p_local_central_id, v_code,
    p_fecha_elaboracion, p_fecha_caducidad, p_cantidad, p_unidad, 'disponible', p_lote_produccion_meta
  )
  returning id into v_batch_id;

  insert into public.batch_stock (batch_id, local_id, cantidad)
  values (v_batch_id, p_local_central_id, p_cantidad)
  on conflict (batch_id, local_id) do update set cantidad = batch_stock.cantidad + excluded.cantidad;

  insert into public.batch_movements (
    batch_id, local_from, local_to, cantidad, tipo, created_by
  ) values (
    v_batch_id, null, p_local_central_id, p_cantidad, 'produccion', v_uid
  );

  if p_ingredients is not null and jsonb_typeof(p_ingredients) = 'array' then
    insert into public.batch_ingredient_trace (
      batch_id, ingredient_preparation_id, ingredient_product_id, cantidad, unidad
    )
    select
      v_batch_id,
      (x->>'preparation_id')::uuid,
      (
        select cp.legacy_product_id
        from public.central_preparations cp
        where cp.id = (x->>'preparation_id')::uuid
          and cp.local_central_id = p_local_central_id
        limit 1
      ),
      (x->>'cantidad')::numeric,
      coalesce(x->>'unidad', p_unidad)
    from jsonb_array_elements(p_ingredients) x
    where (x->>'preparation_id') is not null
      and (x->>'cantidad') is not null
      and coalesce(x->>'unidad', p_unidad) in ('kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades');
  end if;

  return v_batch_id;
end;
$fn$;

revoke all on function public.cc_register_production_batch_v2(uuid, uuid, uuid, date, date, numeric, text, jsonb, jsonb) from public;
grant execute on function public.cc_register_production_batch_v2(uuid, uuid, uuid, date, date, numeric, text, jsonb, jsonb) to authenticated;

comment on function public.cc_register_production_batch_v2(uuid, uuid, uuid, date, date, numeric, text, jsonb, jsonb) is
  'Crea lote, stock y trazas. Código: por prefijo de receta si la orden trae fórmula, si no CC-YYYYMMDD-####.';
