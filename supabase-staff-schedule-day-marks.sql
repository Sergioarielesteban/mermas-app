-- Marcas de día en vista "Por empleado" (descanso / fiesta), sin turno con horario.
-- Ejecutar en Supabase SQL Editor si aún no existe la tabla.

create table if not exists public.staff_schedule_day_marks (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  employee_id uuid not null references public.staff_employees(id) on delete cascade,
  mark_date date not null,
  kind text not null check (kind in ('rest', 'holiday')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, employee_id, mark_date)
);

create index if not exists idx_staff_day_marks_local_date on public.staff_schedule_day_marks(local_id, mark_date);

drop trigger if exists trg_staff_schedule_day_marks_updated_at on public.staff_schedule_day_marks;
create trigger trg_staff_schedule_day_marks_updated_at
before update on public.staff_schedule_day_marks
for each row execute procedure public.set_updated_at();

alter table public.staff_schedule_day_marks enable row level security;

drop policy if exists staff_schedule_day_marks_select on public.staff_schedule_day_marks;
create policy staff_schedule_day_marks_select
on public.staff_schedule_day_marks
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists staff_schedule_day_marks_write on public.staff_schedule_day_marks;
create policy staff_schedule_day_marks_write
on public.staff_schedule_day_marks
for all
to authenticated
using (
  local_id = public.current_local_id()
  and public.staff_is_manager_or_admin()
)
with check (
  local_id = public.current_local_id()
  and public.staff_is_manager_or_admin()
);
