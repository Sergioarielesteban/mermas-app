-- Solicitudes de personal (días libres, etc.). Ejecutar tras supabase-staff-attendance-schema.sql
-- Requiere: public.set_updated_at(), public.current_local_id(), staff_is_manager_or_admin(), staff_can_act_as_employee()

create table if not exists public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  employee_id uuid not null references public.staff_employees(id) on delete cascade,
  request_type text not null default 'time_off' check (request_type in ('time_off', 'other')),
  start_date date not null,
  end_date date,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_requests_local_status on public.staff_requests(local_id, status);
create index if not exists idx_staff_requests_employee on public.staff_requests(employee_id, created_at desc);

drop trigger if exists trg_staff_requests_updated_at on public.staff_requests;
create trigger trg_staff_requests_updated_at
before update on public.staff_requests
for each row execute procedure public.set_updated_at();

alter table public.staff_requests enable row level security;

drop policy if exists staff_requests_select on public.staff_requests;
create policy staff_requests_select
on public.staff_requests
for select
to authenticated
using (
  local_id = public.current_local_id()
  and (
    public.staff_is_manager_or_admin()
    or public.staff_can_act_as_employee(employee_id)
  )
);

drop policy if exists staff_requests_insert_own on public.staff_requests;
create policy staff_requests_insert_own
on public.staff_requests
for insert
to authenticated
with check (
  local_id = public.current_local_id()
  and public.staff_can_act_as_employee(employee_id)
);

drop policy if exists staff_requests_update_manager on public.staff_requests;
create policy staff_requests_update_manager
on public.staff_requests
for update
to authenticated
using (
  local_id = public.current_local_id()
  and public.staff_is_manager_or_admin()
)
with check (local_id = public.current_local_id());
