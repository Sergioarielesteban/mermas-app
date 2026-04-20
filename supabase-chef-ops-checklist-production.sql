-- Chef-One: check list operativa (apertura, turno, cierre, higiene…) y producción por secciones (verduras, cuarto frío…).
-- Ejecutar en Supabase SQL Editor. Añadir tablas a Realtime solo si lo necesitáis.

-- ─── Check list ───────────────────────────────────────────────────────────

create table if not exists public.chef_checklists (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  title text not null,
  context text not null default 'custom'
    check (context in ('opening', 'shift_change', 'closing', 'hygiene_bathroom', 'custom')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chef_checklists_local on public.chef_checklists(local_id);

create table if not exists public.chef_checklist_sections (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.chef_checklists(id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

create index if not exists idx_chef_checklist_sections_list on public.chef_checklist_sections(checklist_id);

create table if not exists public.chef_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.chef_checklists(id) on delete cascade,
  section_id uuid references public.chef_checklist_sections(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create index if not exists idx_chef_checklist_items_list on public.chef_checklist_items(checklist_id);

create table if not exists public.chef_checklist_runs (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  checklist_id uuid not null references public.chef_checklists(id) on delete restrict,
  run_date date not null,
  shift_label text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id)
);

create index if not exists idx_chef_checklist_runs_local_date on public.chef_checklist_runs(local_id, run_date desc);

create table if not exists public.chef_checklist_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.chef_checklist_runs(id) on delete cascade,
  item_id uuid not null references public.chef_checklist_items(id) on delete restrict,
  is_done boolean not null default false,
  done_at timestamptz,
  note text,
  unique (run_id, item_id)
);

create index if not exists idx_chef_checklist_run_items_run on public.chef_checklist_run_items(run_id);

drop trigger if exists trg_chef_checklists_updated_at on public.chef_checklists;
create trigger trg_chef_checklists_updated_at
before update on public.chef_checklists
for each row execute procedure public.set_updated_at();

-- ─── Producción ───────────────────────────────────────────────────────────
-- Tablas y políticas: supabase-chef-production-templates-v2.sql (plantillas, bloques de día, sesiones).

-- RLS (solo checklists en este archivo)
alter table public.chef_checklists enable row level security;
alter table public.chef_checklist_sections enable row level security;
alter table public.chef_checklist_items enable row level security;
alter table public.chef_checklist_runs enable row level security;
alter table public.chef_checklist_run_items enable row level security;

-- checklists
drop policy if exists chef_checklists_rw on public.chef_checklists;
create policy chef_checklists_rw on public.chef_checklists for all to authenticated
  using (local_id = public.current_local_id()) with check (local_id = public.current_local_id());

drop policy if exists chef_checklist_sections_rw on public.chef_checklist_sections;
create policy chef_checklist_sections_rw on public.chef_checklist_sections for all to authenticated
  using (
    exists (select 1 from public.chef_checklists c where c.id = checklist_id and c.local_id = public.current_local_id())
  )
  with check (
    exists (select 1 from public.chef_checklists c where c.id = checklist_id and c.local_id = public.current_local_id())
  );

drop policy if exists chef_checklist_items_rw on public.chef_checklist_items;
create policy chef_checklist_items_rw on public.chef_checklist_items for all to authenticated
  using (
    exists (select 1 from public.chef_checklists c where c.id = checklist_id and c.local_id = public.current_local_id())
  )
  with check (
    exists (select 1 from public.chef_checklists c where c.id = checklist_id and c.local_id = public.current_local_id())
  );

drop policy if exists chef_checklist_runs_rw on public.chef_checklist_runs;
create policy chef_checklist_runs_rw on public.chef_checklist_runs for all to authenticated
  using (local_id = public.current_local_id()) with check (local_id = public.current_local_id());

drop policy if exists chef_checklist_run_items_rw on public.chef_checklist_run_items;
create policy chef_checklist_run_items_rw on public.chef_checklist_run_items for all to authenticated
  using (
    exists (select 1 from public.chef_checklist_runs r where r.id = run_id and r.local_id = public.current_local_id())
  )
  with check (
    exists (select 1 from public.chef_checklist_runs r where r.id = run_id and r.local_id = public.current_local_id())
  );

-- Borrado de listas/ítems con historial: ejecutar supabase-chef-ops-checklist-fk-cascade.sql
