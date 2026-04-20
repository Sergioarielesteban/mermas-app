-- Producción v2: plantillas con bloques de días configurables, secciones, productos y objetivos por bloque.
-- Ejecutar en Supabase SQL Editor tras backup. Sustituye el modelo anterior (planes Lun–Jue / Vie–Dom).
-- Días en weekdays: igual que JavaScript Date.getDay() → 0=domingo … 6=sábado.

-- ─── Quitar modelo antiguo ─────────────────────────────────────────────────

drop policy if exists chef_production_run_tasks_rw on public.chef_production_run_tasks;
drop policy if exists chef_production_runs_rw on public.chef_production_runs;
drop policy if exists chef_production_tasks_rw on public.chef_production_tasks;
drop policy if exists chef_production_sections_rw on public.chef_production_sections;
drop policy if exists chef_production_plans_rw on public.chef_production_plans;

drop table if exists public.chef_production_run_tasks cascade;
drop table if exists public.chef_production_runs cascade;
drop table if exists public.chef_production_tasks cascade;
drop table if exists public.chef_production_sections cascade;
drop table if exists public.chef_production_plans cascade;

-- ─── Nuevo modelo ─────────────────────────────────────────────────────────

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

create table public.chef_production_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.chef_production_templates(id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

create index idx_chef_production_template_sections_tpl on public.chef_production_template_sections(template_id);

create table public.chef_production_template_lines (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.chef_production_template_sections(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create index idx_chef_production_template_lines_section on public.chef_production_template_lines(section_id);

create table public.chef_production_line_targets (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.chef_production_template_lines(id) on delete cascade,
  block_id uuid not null references public.chef_production_day_blocks(id) on delete cascade,
  target_qty numeric not null default 0,
  unique (line_id, block_id)
);

create index idx_chef_production_line_targets_line on public.chef_production_line_targets(line_id);

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
  line_id uuid not null references public.chef_production_template_lines(id) on delete restrict,
  qty_on_hand numeric,
  unique (session_id, line_id)
);

create index idx_chef_production_session_lines_session on public.chef_production_session_lines(session_id);

-- RLS
alter table public.chef_production_templates enable row level security;
alter table public.chef_production_day_blocks enable row level security;
alter table public.chef_production_template_sections enable row level security;
alter table public.chef_production_template_lines enable row level security;
alter table public.chef_production_line_targets enable row level security;
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

drop policy if exists chef_production_template_sections_rw on public.chef_production_template_sections;
create policy chef_production_template_sections_rw on public.chef_production_template_sections for all to authenticated
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

drop policy if exists chef_production_template_lines_rw on public.chef_production_template_lines;
create policy chef_production_template_lines_rw on public.chef_production_template_lines for all to authenticated
  using (
    exists (
      select 1 from public.chef_production_template_sections s
      join public.chef_production_templates t on t.id = s.template_id
      where s.id = section_id and t.local_id = public.current_local_id()
    )
  )
  with check (
    exists (
      select 1 from public.chef_production_template_sections s
      join public.chef_production_templates t on t.id = s.template_id
      where s.id = section_id and t.local_id = public.current_local_id()
    )
  );

drop policy if exists chef_production_line_targets_rw on public.chef_production_line_targets;
create policy chef_production_line_targets_rw on public.chef_production_line_targets for all to authenticated
  using (
    exists (
      select 1 from public.chef_production_template_lines ln
      join public.chef_production_template_sections s on s.id = ln.section_id
      join public.chef_production_templates t on t.id = s.template_id
      where ln.id = line_id and t.local_id = public.current_local_id()
    )
  )
  with check (
    exists (
      select 1 from public.chef_production_template_lines ln
      join public.chef_production_template_sections s on s.id = ln.section_id
      join public.chef_production_templates t on t.id = s.template_id
      where ln.id = line_id and t.local_id = public.current_local_id()
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
