-- =============================================================================
-- Migración: permitir event_type inventory_final (proyectos ya creados)
-- =============================================================================
-- Ejecutar una vez en Supabase SQL Editor si ya aplicaste supabase-inventory-history.sql
-- sin el valor inventory_final.
-- =============================================================================

alter table public.inventory_history_snapshots
  drop constraint if exists inventory_history_snapshots_event;

alter table public.inventory_history_snapshots
  add constraint inventory_history_snapshots_event check (
    event_type in ('before_reset', 'before_line_delete', 'inventory_final')
  );
