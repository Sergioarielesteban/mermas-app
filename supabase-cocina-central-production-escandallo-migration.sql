-- =============================================================================
-- Cocina central: producción enlazada a recetas/escandallo (lectura) + líneas
-- de orden. Ejecutar en Supabase SQL Editor DESPUÉS de:
--   supabase-cocina-central-schema.sql
--   supabase-cocina-central-elaboraciones-migration.sql
--   supabase-escandallos-schema.sql (tabla escandallo_recipes)
-- =============================================================================

-- 1) Ampliar unidades en lotes y trazabilidad (vinagretas, etc.)
-- ---------------------------------------------------------------------------
alter table public.production_batches
  drop constraint if exists production_batches_unidad_check;

alter table public.production_batches
  add constraint production_batches_unidad_check
  check (unidad in ('kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades'));

alter table public.batch_ingredient_trace
  drop constraint if exists batch_ingredient_trace_unidad_check;

alter table public.batch_ingredient_trace
  add constraint batch_ingredient_trace_unidad_check
  check (unidad in ('kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades'));

-- 2) Elaboración: enlace con escandallo (solo cocina central; no modifica módulo escandallos)
-- ---------------------------------------------------------------------------
alter table public.central_preparations
  add column if not exists escandallo_recipe_id uuid references public.escandallo_recipes(id) on delete set null;

alter table public.central_preparations
  add column if not exists escandallo_raw_supplier_product_id uuid;

alter table public.central_preparations
  add column if not exists escandallo_processed_product_id uuid;

comment on column public.central_preparations.escandallo_recipe_id is
  'Receta de escandallo cuya elaboración representa (salida de producción).';
comment on column public.central_preparations.escandallo_raw_supplier_product_id is
  'Línea de escandallo (ingrediente crudo) — deduplicar elaboración de ingrediente.';
comment on column public.central_preparations.escandallo_processed_product_id is
  'Producto transformado de escandallo (ingrediente) — deduplicar elaboración.';

create unique index if not exists uq_cc_prep_elaboracion_por_receta
  on public.central_preparations (local_central_id, escandallo_recipe_id)
  where escandallo_recipe_id is not null;

create unique index if not exists uq_cc_prep_ingrediente_raw
  on public.central_preparations (local_central_id, escandallo_raw_supplier_product_id)
  where escandallo_raw_supplier_product_id is not null;

create unique index if not exists uq_cc_prep_ingrediente_proc
  on public.central_preparations (local_central_id, escandallo_processed_product_id)
  where escandallo_processed_product_id is not null;

-- 3) Orden de producción: notas, receta de origen
-- ---------------------------------------------------------------------------
alter table public.production_orders
  add column if not exists notes text;

alter table public.production_orders
  add column if not exists escandallo_recipe_id uuid references public.escandallo_recipes(id) on delete set null;

alter table public.production_orders
  add column if not exists cantidad_producida numeric(14,4) check (cantidad_producida is null or cantidad_producida > 0);

comment on column public.production_orders.escandallo_recipe_id is
  'Receta/escandallo desde la que se generó la orden (snapshot lógico).';
comment on column public.production_orders.cantidad_producida is
  'Rellenar al confirmar producción; si null, se usa cantidad_objetivo.';

create index if not exists idx_production_orders_escandallo_recipe
  on public.production_orders(escandallo_recipe_id)
  where escandallo_recipe_id is not null;

-- 4) Líneas de ingredientes por orden (teórico / real / lote origen)
-- ---------------------------------------------------------------------------
create table if not exists public.production_order_lines (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  ingredient_preparation_id uuid not null references public.central_preparations(id) on delete restrict,
  label_snapshot text not null,
  theoretical_qty numeric(14,4) not null check (theoretical_qty >= 0),
  unidad text not null
    check (unidad in ('kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades')),
  real_qty numeric(14,4) check (real_qty is null or real_qty >= 0),
  origin_batch_id uuid references public.production_batches(id) on delete set null,
  cost_estimated_eur numeric(14,4),
  cost_real_eur numeric(14,4),
  escandallo_line_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_order_lines_order
  on public.production_order_lines (production_order_id);

drop trigger if exists trg_production_order_lines_u on public.production_order_lines;
create trigger trg_production_order_lines_u
before update on public.production_order_lines
for each row execute procedure public.set_updated_at();

alter table public.production_order_lines enable row level security;

drop policy if exists cc_prod_order_lines_rw on public.production_order_lines;
create policy cc_prod_order_lines_rw on public.production_order_lines
for all to authenticated
using (
  exists (
    select 1
    from public.production_orders po
    where po.id = production_order_lines.production_order_id
      and po.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
      and public.profile_can_access_cocina_central_module()
  )
)
with check (
  exists (
    select 1
    from public.production_orders po
    where po.id = production_order_lines.production_order_id
      and po.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
      and public.profile_can_access_cocina_central_module()
  )
);

-- 5) Sustituir RPC de registro de lote para aceptar nuevas unidades en trazas
-- ---------------------------------------------------------------------------
-- Misma lógica que v2: solo cambia el check implícito al insertar trazas.
create or replace function public.cc_register_production_batch_v2(
  p_order_id uuid,
  p_preparation_id uuid,
  p_local_central_id uuid,
  p_fecha_elaboracion date,
  p_fecha_caducidad date,
  p_cantidad numeric,
  p_unidad text,
  p_ingredients jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_code text;
  v_legacy_product_id uuid;
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

  v_code := public.cc_next_codigo_lote(p_local_central_id);

  insert into public.production_batches (
    production_order_id, product_id, preparation_id, local_central_id, codigo_lote,
    fecha_elaboracion, fecha_caducidad, cantidad_producida, unidad, estado
  ) values (
    p_order_id, v_legacy_product_id, p_preparation_id, p_local_central_id, v_code,
    p_fecha_elaboracion, p_fecha_caducidad, p_cantidad, p_unidad, 'disponible'
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
