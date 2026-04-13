-- =============================================================================
-- Historial de inventario (cierre, copias antes de quitar una línea, legado)
-- =============================================================================
-- Ejecutar en Supabase SQL Editor (tras supabase-inventory-schema.sql).
-- Tipos: inventory_final (al pulsar Terminar inventario), before_line_delete,
-- before_reset (filas antiguas).
-- =============================================================================

create table if not exists public.inventory_history_snapshots (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null,
  summary text,
  total_value_snapshot numeric(14, 2) not null default 0,
  lines_snapshot jsonb not null,
  created_by uuid references auth.users (id),
  constraint inventory_history_snapshots_event check (
    event_type in ('before_reset', 'before_line_delete', 'inventory_final')
  )
);

create index if not exists idx_inventory_history_local_created
  on public.inventory_history_snapshots (local_id, created_at desc);

alter table public.inventory_history_snapshots enable row level security;

drop policy if exists "inventory_history_snapshots same local read" on public.inventory_history_snapshots;
create policy "inventory_history_snapshots same local read"
on public.inventory_history_snapshots
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "inventory_history_snapshots same local insert" on public.inventory_history_snapshots;
create policy "inventory_history_snapshots same local insert"
on public.inventory_history_snapshots
for insert
to authenticated
with check (local_id = public.current_local_id());

drop policy if exists "inventory_history_snapshots same local delete" on public.inventory_history_snapshots;
create policy "inventory_history_snapshots same local delete"
on public.inventory_history_snapshots
for delete
to authenticated
using (local_id = public.current_local_id());

comment on table public.inventory_history_snapshots is 'Snapshots del inventario local: cierre (inventory_final), antes de quitar línea, legado.';
