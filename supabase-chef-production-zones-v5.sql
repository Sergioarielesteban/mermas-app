-- Producción v5: zonas de pizarra opcionales + FK en líneas de bloque (produccion_zone_id).
-- Ejecutar en Supabase después de tener chef_production_templates y chef_production_block_items.
-- Migra uso de texto kitchen_section → selector de zona; la columna kitchen_section puede mantenerse en BD por compatibilidad.

create table if not exists public.chef_production_zones (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.chef_production_templates(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create index if not exists idx_chef_production_zones_template on public.chef_production_zones(template_id);

alter table public.chef_production_block_items
  add column if not exists production_zone_id uuid references public.chef_production_zones(id) on delete set null;

comment on column public.chef_production_block_items.production_zone_id is
  'Zona opcional para agrupar en la pizarra (ej. Plancha, Quesos).';

alter table public.chef_production_zones enable row level security;

drop policy if exists chef_production_zones_rw on public.chef_production_zones;

create policy chef_production_zones_rw on public.chef_production_zones for all to authenticated
  using (
    exists (
      select 1 from public.chef_production_templates t
      where t.id = template_id and t.local_id = public.current_local_id()
    )
  )
  with check (
    exists (
      select 1 from public.chef_production_templates t
      where t.id = template_id and t.local_id = public.current_local_id()
    )
  );
