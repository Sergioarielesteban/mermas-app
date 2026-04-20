-- Publicación oficial del cuadrante semanal (estado + notificaciones manuales al publicar).
-- Requiere: public.locals, public.profiles, public.current_local_id(), public.set_updated_at()

create table if not exists public.staff_week_publications (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  week_start_monday date not null,
  status text not null check (status in ('published', 'updated_after_publish')),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, week_start_monday)
);

create index if not exists idx_staff_week_publications_local_week
  on public.staff_week_publications (local_id, week_start_monday);

comment on table public.staff_week_publications is
  'Estado de publicación del cuadrante por semana (lunes). Sin fila = borrador.';

drop trigger if exists trg_staff_week_publications_updated_at on public.staff_week_publications;
create trigger trg_staff_week_publications_updated_at
before update on public.staff_week_publications
for each row execute procedure public.set_updated_at();

alter table public.staff_week_publications enable row level security;

drop policy if exists staff_week_publications_select_local on public.staff_week_publications;
create policy staff_week_publications_select_local on public.staff_week_publications
for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists staff_week_publications_insert_admin on public.staff_week_publications;
create policy staff_week_publications_insert_admin on public.staff_week_publications
for insert to authenticated
with check (
  local_id = public.current_local_id()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.local_id = staff_week_publications.local_id
      and p.role = 'admin'
  )
);

drop policy if exists staff_week_publications_update_admin on public.staff_week_publications;
create policy staff_week_publications_update_admin on public.staff_week_publications
for update to authenticated
using (
  local_id = public.current_local_id()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.local_id = staff_week_publications.local_id
      and p.role = 'admin'
  )
)
with check (
  local_id = public.current_local_id()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.local_id = staff_week_publications.local_id
      and p.role = 'admin'
  )
);
