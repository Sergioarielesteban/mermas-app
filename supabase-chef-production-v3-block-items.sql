-- Producción v3: productos y cantidad objetivo DENTRO de cada bloque de días (no secciones globales).
-- Ejecutar en Supabase SQL Editor si ya aplicaste el v2 anterior (con template_sections / line_targets).
-- Elimina filas de chef_production_session_lines y tablas section/line/targets; crea chef_production_block_items.
-- Las sesiones abiertas se quedan sin líneas hasta volver a abrir la lista en la app (se regeneran solas).
-- No hagas DROP POLICY sobre tablas que pueden no existir: CASCADE al borrar la tabla elimina las políticas.

drop table if exists public.chef_production_session_lines cascade;
drop table if exists public.chef_production_line_targets cascade;
drop table if exists public.chef_production_template_lines cascade;
drop table if exists public.chef_production_template_sections cascade;

create table public.chef_production_block_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.chef_production_day_blocks(id) on delete cascade,
  label text not null,
  target_qty numeric not null default 0,
  sort_order int not null default 0
);

create index idx_chef_production_block_items_block on public.chef_production_block_items(block_id);

create table public.chef_production_session_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chef_production_sessions(id) on delete cascade,
  block_item_id uuid not null references public.chef_production_block_items(id) on delete restrict,
  qty_on_hand numeric,
  unique (session_id, block_item_id)
);

create index idx_chef_production_session_lines_session on public.chef_production_session_lines(session_id);

alter table public.chef_production_block_items enable row level security;
alter table public.chef_production_session_lines enable row level security;

drop policy if exists chef_production_block_items_rw on public.chef_production_block_items;
create policy chef_production_block_items_rw on public.chef_production_block_items for all to authenticated
  using (
    exists (
      select 1 from public.chef_production_day_blocks b
      join public.chef_production_templates t on t.id = b.template_id
      where b.id = block_id and t.local_id = public.current_local_id()
    )
  )
  with check (
    exists (
      select 1 from public.chef_production_day_blocks b
      join public.chef_production_templates t on t.id = b.template_id
      where b.id = block_id and t.local_id = public.current_local_id()
    )
  );

drop policy if exists chef_production_session_lines_rw on public.chef_production_session_lines;
create policy chef_production_session_lines_rw on public.chef_production_session_lines for all to authenticated
  using (
    exists (
      select 1 from public.chef_production_sessions s
      where s.id = session_id and s.local_id = public.current_local_id()
    )
  )
  with check (
    exists (
      select 1 from public.chef_production_sessions s
      where s.id = session_id and s.local_id = public.current_local_id()
    )
  );
