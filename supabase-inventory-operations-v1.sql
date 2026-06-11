-- =============================================================================
-- Inventario operativo v1 — movimientos trazables, conteos, alertas mínimas
-- =============================================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de supabase-inventory-schema.sql
-- y migraciones de inventario ya aplicadas en el proyecto.
--
-- Objetivo: stock con snapshot en inventory_items + auditoría en inventory_movements.
-- Todo cambio de stock debe crear movimiento (app o RPC).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- inventory_items: umbrales y último conteo
-- -----------------------------------------------------------------------------

alter table public.inventory_items
  add column if not exists min_stock numeric(14, 3) check (min_stock is null or min_stock >= 0);

alter table public.inventory_items
  add column if not exists last_counted_at timestamptz;

comment on column public.inventory_items.min_stock is
  'Umbral operativo para alertas de stock bajo/crítico. Null = sin alerta configurada.';
comment on column public.inventory_items.last_counted_at is
  'Último conteo físico registrado (conteo rápido o ajuste count_adjustment).';

-- -----------------------------------------------------------------------------
-- inventory_movements: campos operativos (compat con quantity_delta / reason)
-- -----------------------------------------------------------------------------

alter table public.inventory_movements
  add column if not exists movement_type text;

alter table public.inventory_movements
  add column if not exists unit text;

alter table public.inventory_movements
  add column if not exists previous_stock numeric(14, 3);

alter table public.inventory_movements
  add column if not exists new_stock numeric(14, 3);

alter table public.inventory_movements
  add column if not exists source_module text;

alter table public.inventory_movements
  add column if not exists source_id uuid;

alter table public.inventory_movements
  add column if not exists notes text;

-- Backfill tipo legacy si existían filas sin movement_type
update public.inventory_movements
set movement_type = 'manual_adjustment'
where movement_type is null;

alter table public.inventory_movements
  alter column movement_type set default 'manual_adjustment';

alter table public.inventory_movements
  alter column movement_type set not null;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_chk;

alter table public.inventory_movements
  add constraint inventory_movements_movement_type_chk check (
    movement_type in (
      'purchase_receipt',
      'central_kitchen_receipt',
      'initial_stock',
      'waste',
      'breakage',
      'staff_consumption',
      'transfer_in',
      'transfer_out',
      'manual_adjustment',
      'count_adjustment'
    )
  );

create index if not exists idx_inventory_movements_local_type
  on public.inventory_movements (local_id, movement_type, occurred_at desc);

-- -----------------------------------------------------------------------------
-- inventory_counts: sesiones de conteo rápido (opcional, trazabilidad agrupada)
-- -----------------------------------------------------------------------------

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  notes text,
  started_by uuid references auth.users (id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_counts_local
  on public.inventory_counts (local_id, created_at desc);

alter table public.inventory_counts enable row level security;

drop policy if exists "inventory_counts same local read" on public.inventory_counts;
create policy "inventory_counts same local read"
on public.inventory_counts
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "inventory_counts same local write" on public.inventory_counts;
create policy "inventory_counts same local write"
on public.inventory_counts
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop trigger if exists trg_inventory_counts_updated_at on public.inventory_counts;
create trigger trg_inventory_counts_updated_at
before update on public.inventory_counts
for each row execute procedure public.set_updated_at();

alter table public.inventory_movements
  add column if not exists count_session_id uuid references public.inventory_counts (id) on delete set null;

-- -----------------------------------------------------------------------------
-- RPC: aplicar movimiento atómico (actualiza stock + inserta movimiento)
-- -----------------------------------------------------------------------------

create or replace function public.inventory_apply_stock_movement(
  p_local_id uuid,
  p_inventory_item_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_unit text default null,
  p_reason text default '',
  p_notes text default null,
  p_source_module text default null,
  p_source_id uuid default null,
  p_count_session_id uuid default null,
  p_created_by uuid default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_prev numeric(14, 3);
  v_new numeric(14, 3);
  v_row public.inventory_movements%rowtype;
begin
  if p_local_id is distinct from public.current_local_id() then
    raise exception 'inventory_apply_stock_movement: local_id no coincide con el local activo';
  end if;

  select * into strict v_item
  from public.inventory_items i
  where i.id = p_inventory_item_id
    and i.local_id = p_local_id
    and i.is_active = true
  for update;

  v_prev := coalesce(v_item.quantity_on_hand, 0);
  v_new := round((v_prev + p_quantity_delta)::numeric, 3);

  if v_new < 0 then
    raise exception 'inventory_apply_stock_movement: stock resultante negativo (% → %)', v_prev, v_new;
  end if;

  update public.inventory_items
  set
    quantity_on_hand = v_new,
    last_counted_at = case
      when p_movement_type = 'count_adjustment' then now()
      else last_counted_at
    end,
    updated_at = now()
  where id = p_inventory_item_id;

  insert into public.inventory_movements (
    local_id,
    inventory_item_id,
    quantity_delta,
    movement_type,
    unit,
    previous_stock,
    new_stock,
    reason,
    notes,
    source_module,
    source_id,
    count_session_id,
    occurred_at,
    created_by
  )
  values (
    p_local_id,
    p_inventory_item_id,
    round(p_quantity_delta::numeric, 3),
    p_movement_type,
    coalesce(nullif(trim(p_unit), ''), v_item.unit),
    v_prev,
    v_new,
    coalesce(p_reason, ''),
    p_notes,
    p_source_module,
    p_source_id,
    p_count_session_id,
    now(),
    p_created_by
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.inventory_apply_stock_movement(uuid, uuid, text, numeric, text, text, text, text, uuid, uuid, uuid) from public;
grant execute on function public.inventory_apply_stock_movement(uuid, uuid, text, numeric, text, text, text, text, uuid, uuid, uuid) to authenticated;

comment on function public.inventory_apply_stock_movement is
  'Aplica delta de stock con trazabilidad. Usar desde la app en lugar de UPDATE directo a quantity_on_hand.';
