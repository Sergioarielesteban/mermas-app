-- Ajustes de fichaje con auditoría (sin sobrescribir registros originales)
-- Requiere: supabase-staff-attendance-schema.sql (staff_employees, current_local_id, set_updated_at, staff_is_manager_or_admin)

create table if not exists public.staff_time_entry_adjustments (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  employee_id uuid not null references public.staff_employees(id) on delete cascade,
  work_date date not null,
  clock_in_original timestamptz,
  clock_out_original timestamptz,
  clock_in_adjusted timestamptz,
  clock_out_adjusted timestamptz,
  adjustment_reason text,
  adjusted_by_user_id uuid references auth.users(id) on delete set null,
  adjusted_at timestamptz,
  is_adjusted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_time_adjustments_reason_required
    check ((is_adjusted = false) or (adjustment_reason is not null and length(trim(adjustment_reason)) > 0))
);

create unique index if not exists ux_staff_time_adjustments_local_employee_day
  on public.staff_time_entry_adjustments(local_id, employee_id, work_date);

create index if not exists idx_staff_time_adjustments_local_date
  on public.staff_time_entry_adjustments(local_id, work_date desc);

drop trigger if exists trg_staff_time_adjustments_updated_at on public.staff_time_entry_adjustments;
create trigger trg_staff_time_adjustments_updated_at
before update on public.staff_time_entry_adjustments
for each row execute procedure public.set_updated_at();

alter table public.staff_time_entry_adjustments enable row level security;

drop policy if exists "staff time adjustments read local" on public.staff_time_entry_adjustments;
create policy "staff time adjustments read local"
on public.staff_time_entry_adjustments
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "staff time adjustments write manager admin" on public.staff_time_entry_adjustments;
create policy "staff time adjustments write manager admin"
on public.staff_time_entry_adjustments
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

