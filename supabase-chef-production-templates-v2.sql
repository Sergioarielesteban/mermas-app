-- Producción: plantillas → bloques de días → productos con objetivo por bloque.
-- Días en weekdays: JavaScript Date.getDay() → 0=domingo … 6=sábado.
-- Instalación limpia: ejecutar este script (o v2 antiguo + supabase-chef-production-v3-block-items.sql).

-- ─── Quitar todo el stack de producción de la app (reinstalación limpia) ─
-- No uses DROP POLICY aquí: si la tabla no existe, Postgres falla. CASCADE borra políticas al borrar la tabla.

drop table if exists public.chef_production_session_lines cascade;
drop table if exists public.chef_production_sessions cascade;
drop table if exists public.chef_production_block_items cascade;
drop table if exists public.chef_production_line_targets cascade;
drop table if exists public.chef_production_template_lines cascade;
drop table if exists public.chef_production_template_sections cascade;
drop table if exists public.chef_production_day_blocks cascade;
drop table if exists public.chef_production_templates cascade;

drop table if exists public.chef_production_run_tasks cascade;
drop table if exists public.chef_production_runs cascade;
drop table if exists public.chef_production_tasks cascade;
drop table if exists public.chef_production_sections cascade;
drop table if exists public.chef_production_plans cascade;

-- ─── Tablas actuales ─────────────────────────────────────────────────────

create table public.chef_production_templates (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_chef_production_templates_local on public.chef_production_templates(local_id);

drop trigger if exists trg_chef_production_templates_updated_at on public.chef_production_templates;
create trigger trg_chef_production_templates_updated_at
before update on public.chef_production_templates
for each row execute procedure public.set_updated_at();

create table public.chef_production_day_blocks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.chef_production_templates(id) on delete cascade,
  label text not null,
  weekdays integer[] not null
    check (
      cardinality(weekdays) >= 1
      and weekdays <@ array[0,1,2,3,4,5,6]::integer[]
    ),
  sort_order int not null default 0
);

create index idx_chef_production_day_blocks_template on public.chef_production_day_blocks(template_id);

create table public.chef_production_block_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.chef_production_day_blocks(id) on delete cascade,
  label text not null,
  target_qty numeric not null default 0,
  sort_order int not null default 0
);

create index idx_chef_production_block_items_block on public.chef_production_block_items(block_id);

create table public.chef_production_sessions (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  template_id uuid not null references public.chef_production_templates(id) on delete restrict,
  work_date date not null,
  forced_block_id uuid references public.chef_production_day_blocks(id) on delete set null,
  period_label text,
  lines_snapshot jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  unique (local_id, template_id, work_date)
);

create index idx_chef_production_sessions_local on public.chef_production_sessions(local_id, work_date desc);

create table public.chef_production_session_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chef_production_sessions(id) on delete cascade,
  block_item_id uuid not null references public.chef_production_block_items(id) on delete restrict,
  qty_on_hand numeric,
  unique (session_id, block_item_id)
);

create index idx_chef_production_session_lines_session on public.chef_production_session_lines(session_id);

-- RLS
alter table public.chef_production_templates enable row level security;
alter table public.chef_production_day_blocks enable row level security;
alter table public.chef_production_block_items enable row level security;
alter table public.chef_production_sessions enable row level security;
alter table public.chef_production_session_lines enable row level security;

drop policy if exists chef_production_templates_rw on public.chef_production_templates;
create policy chef_production_templates_rw on public.chef_production_templates for all to authenticated
  using (local_id = public.current_local_id()) with check (local_id = public.current_local_id());

drop policy if exists chef_production_day_blocks_rw on public.chef_production_day_blocks;
create policy chef_production_day_blocks_rw on public.chef_production_day_blocks for all to authenticated
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

drop policy if exists chef_production_sessions_rw on public.chef_production_sessions;
create policy chef_production_sessions_rw on public.chef_production_sessions for all to authenticated
  using (local_id = public.current_local_id()) with check (local_id = public.current_local_id());

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
