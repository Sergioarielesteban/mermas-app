-- =============================================================================
-- Personal / Horarios: normas de empresa + manual de operaciones + lecturas
-- Requiere: multilocal (locals, profiles), public.current_local_id(),
--           public.set_updated_at, y public.profile_is_admin()
--           (ver supabase-security-finanzas-admin-rls.sql o escandallos).
-- =============================================================================

create table if not exists public.empresa_normas (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  titulo text not null,
  categoria text not null,
  descripcion text not null default '',
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_empresa_normas_local on public.empresa_normas (local_id);
create index if not exists idx_empresa_normas_local_activa on public.empresa_normas (local_id, activa);

drop trigger if exists trg_empresa_normas_updated_at on public.empresa_normas;
create trigger trg_empresa_normas_updated_at
before update on public.empresa_normas
for each row execute procedure public.set_updated_at();

create table if not exists public.normas_lectura (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  norma_id uuid not null references public.empresa_normas(id) on delete cascade,
  fecha_lectura timestamptz not null default now(),
  unique (user_id, norma_id)
);

create index if not exists idx_normas_lectura_norma on public.normas_lectura (norma_id);
create index if not exists idx_normas_lectura_user on public.normas_lectura (user_id, local_id);

create table if not exists public.manual_procedimientos (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  titulo text not null,
  categoria text not null
    check (categoria in ('cocina', 'recepcion', 'limpieza', 'produccion')),
  pasos jsonb not null default '[]'::jsonb,
  puntos_criticos text not null default '',
  errores_comunes text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_manual_procedimientos_local on public.manual_procedimientos (local_id);
create index if not exists idx_manual_procedimientos_local_cat on public.manual_procedimientos (local_id, categoria);

drop trigger if exists trg_manual_procedimientos_updated_at on public.manual_procedimientos;
create trigger trg_manual_procedimientos_updated_at
before update on public.manual_procedimientos
for each row execute procedure public.set_updated_at();

create table if not exists public.manual_lectura (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  manual_id uuid not null references public.manual_procedimientos(id) on delete cascade,
  fecha_lectura timestamptz not null default now(),
  unique (user_id, manual_id)
);

create index if not exists idx_manual_lectura_manual on public.manual_lectura (manual_id);
create index if not exists idx_manual_lectura_user on public.manual_lectura (user_id, local_id);

alter table public.empresa_normas enable row level security;
alter table public.normas_lectura enable row level security;
alter table public.manual_procedimientos enable row level security;
alter table public.manual_lectura enable row level security;

-- empresa_normas: lectura para el local; escritura solo admin
drop policy if exists empresa_normas_select_local on public.empresa_normas;
create policy empresa_normas_select_local on public.empresa_normas
for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists empresa_normas_write_admin on public.empresa_normas;
create policy empresa_normas_write_admin on public.empresa_normas
for all to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());

-- normas_lectura
drop policy if exists normas_lectura_select_own on public.normas_lectura;
create policy normas_lectura_select_own on public.normas_lectura
for select to authenticated
using (
  local_id = public.current_local_id()
  and (user_id = auth.uid() or public.profile_is_admin())
);

drop policy if exists normas_lectura_insert_own on public.normas_lectura;
create policy normas_lectura_insert_own on public.normas_lectura
for insert to authenticated
with check (
  user_id = auth.uid()
  and local_id = public.current_local_id()
  and exists (
    select 1 from public.empresa_normas en
    where en.id = norma_id
      and en.local_id = public.current_local_id()
      and en.activa = true
  )
);

drop policy if exists normas_lectura_delete_admin on public.normas_lectura;
create policy normas_lectura_delete_admin on public.normas_lectura
for delete to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

-- manual_procedimientos
drop policy if exists manual_procedimientos_select_local on public.manual_procedimientos;
create policy manual_procedimientos_select_local on public.manual_procedimientos
for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists manual_procedimientos_write_admin on public.manual_procedimientos;
create policy manual_procedimientos_write_admin on public.manual_procedimientos
for all to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());

-- manual_lectura
drop policy if exists manual_lectura_select_own on public.manual_lectura;
create policy manual_lectura_select_own on public.manual_lectura
for select to authenticated
using (
  local_id = public.current_local_id()
  and (user_id = auth.uid() or public.profile_is_admin())
);

drop policy if exists manual_lectura_insert_own on public.manual_lectura;
create policy manual_lectura_insert_own on public.manual_lectura
for insert to authenticated
with check (
  user_id = auth.uid()
  and local_id = public.current_local_id()
  and exists (
    select 1 from public.manual_procedimientos m
    where m.id = manual_id
      and m.local_id = public.current_local_id()
      and m.activo = true
  )
);

drop policy if exists manual_lectura_delete_admin on public.manual_lectura;
create policy manual_lectura_delete_admin on public.manual_lectura
for delete to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

-- Informe admin “quién aceptó cada norma”: nombre/email del equipo requiere política extra en profiles.
-- Ejecuta también: supabase-profiles-admin-select-local.sql
