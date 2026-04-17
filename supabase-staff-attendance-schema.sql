-- Módulo Personal: horarios, fichajes e incidencias (Chef-One)
-- Requiere: public.locals, public.profiles, public.current_local_id(), public.set_updated_at()
-- Ejecutar en Supabase SQL Editor. Luego en Dashboard → Realtime: activar tablas staff_* si aplica.

-- ---------------------------------------------------------------------------
-- 1) Empleados del módulo (no confundir con auth.users: user_id opcional)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_employees (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  alias text,
  phone text,
  email text,
  operational_role text,
  weekly_hours_target numeric(6,2),
  workday_type text,
  color text,
  pin_fichaje text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_employees_local on public.staff_employees(local_id);
create index if not exists idx_staff_employees_user on public.staff_employees(user_id) where user_id is not null;
create index if not exists idx_staff_employees_local_active on public.staff_employees(local_id, active);

-- ---------------------------------------------------------------------------
-- 2) Turnos planificados
-- ---------------------------------------------------------------------------
create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  employee_id uuid not null references public.staff_employees(id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  ends_next_day boolean not null default false,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  zone text,
  notes text,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'worked', 'incident')),
  color_hint text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_shifts_local_date on public.staff_shifts(local_id, shift_date);
create index if not exists idx_staff_shifts_employee_date on public.staff_shifts(employee_id, shift_date);

-- ---------------------------------------------------------------------------
-- 3) Fichajes (eventos)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_time_entries (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  employee_id uuid not null references public.staff_employees(id) on delete cascade,
  shift_id uuid references public.staff_shifts(id) on delete set null,
  event_type text not null check (event_type in ('clock_in', 'break_start', 'break_end', 'clock_out')),
  occurred_at timestamptz not null default now(),
  source text not null default 'app' check (source in ('device', 'mobile', 'manual', 'app')),
  note text,
  geo_lat double precision,
  geo_lng double precision,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_time_local_occurred on public.staff_time_entries(local_id, occurred_at desc);
create index if not exists idx_staff_time_employee_occurred on public.staff_time_entries(employee_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 4) Incidencias
-- ---------------------------------------------------------------------------
create table if not exists public.staff_attendance_incidents (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  employee_id uuid not null references public.staff_employees(id) on delete cascade,
  shift_id uuid references public.staff_shifts(id) on delete set null,
  incident_date date not null,
  incident_type text not null check (
    incident_type in (
      'late', 'no_clock_in', 'incomplete', 'early_out', 'overlap', 'overtime', 'unassigned', 'other'
    )
  ),
  description text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_incidents_local_date on public.staff_attendance_incidents(local_id, incident_date desc);
create index if not exists idx_staff_incidents_open on public.staff_attendance_incidents(local_id, status) where status = 'open';

-- ---------------------------------------------------------------------------
-- 5) updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_staff_employees_updated_at on public.staff_employees;
create trigger trg_staff_employees_updated_at
before update on public.staff_employees
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_staff_shifts_updated_at on public.staff_shifts;
create trigger trg_staff_shifts_updated_at
before update on public.staff_shifts
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_staff_incidents_updated_at on public.staff_attendance_incidents;
create trigger trg_staff_incidents_updated_at
before update on public.staff_attendance_incidents
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6) Helpers permisos
-- ---------------------------------------------------------------------------
create or replace function public.staff_is_manager_or_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.local_id = public.current_local_id()
      and p.role in ('admin', 'manager')
  );
$$;

create or replace function public.staff_can_act_as_employee(p_employee_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_employees e
    where e.id = p_employee_id
      and e.local_id = public.current_local_id()
      and e.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 7) RPC fichaje con validación de secuencia
-- ---------------------------------------------------------------------------
create or replace function public.staff_record_time_entry(
  p_employee_id uuid,
  p_event_type text,
  p_shift_id uuid default null,
  p_observacion text default null,
  p_origen text default 'app',
  p_pin text default null,
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local uuid;
  v_new_id uuid;
  v_last_type text;
  v_pin text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select e.local_id, e.pin_fichaje
    into v_local, v_pin
  from public.staff_employees e
  where e.id = p_employee_id
    and e.active = true;

  if v_local is null then
    raise exception 'Empleado no encontrado o inactivo';
  end if;

  if v_local is distinct from public.current_local_id() then
    raise exception 'Empleado no pertenece a tu local';
  end if;

  if not p_force then
    if v_pin is not null and length(trim(v_pin)) > 0 then
      if p_pin is null or trim(p_pin) is distinct from trim(v_pin) then
        raise exception 'PIN de fichaje incorrecto';
      end if;
    end if;
  end if;

  if p_force then
    if not public.staff_is_manager_or_admin() then
      raise exception 'Sin permiso para fichaje forzado';
    end if;
  else
    if not (public.staff_is_manager_or_admin() or public.staff_can_act_as_employee(p_employee_id)) then
      raise exception 'No puedes fichar por este empleado';
    end if;
  end if;

  if p_event_type not in ('clock_in', 'break_start', 'break_end', 'clock_out') then
    raise exception 'Tipo de evento inválido';
  end if;

  select t.event_type into v_last_type
  from public.staff_time_entries t
  where t.employee_id = p_employee_id
  order by t.occurred_at desc, t.created_at desc
  limit 1;

  if not p_force then
    if v_last_type is null then
      if p_event_type is distinct from 'clock_in' then
        raise exception 'Primero debes fichar la entrada';
      end if;
    elsif v_last_type = 'clock_in' then
      if p_event_type not in ('break_start', 'clock_out') then
        raise exception 'Secuencia de fichaje inválida';
      end if;
    elsif v_last_type = 'break_start' then
      if p_event_type is distinct from 'break_end' then
        raise exception 'Debes finalizar la pausa antes de continuar';
      end if;
    elsif v_last_type = 'break_end' then
      if p_event_type not in ('break_start', 'clock_out') then
        raise exception 'Secuencia de fichaje inválida';
      end if;
    elsif v_last_type = 'clock_out' then
      if p_event_type is distinct from 'clock_in' then
        raise exception 'Ya cerraste la jornada; fichar nueva entrada';
      end if;
    end if;
  end if;

  insert into public.staff_time_entries (
    local_id, employee_id, shift_id, event_type, occurred_at, source, note, created_by
  ) values (
    v_local,
    p_employee_id,
    p_shift_id,
    p_event_type,
    now(),
    coalesce(nullif(trim(p_origen), ''), 'app'),
    nullif(trim(p_observacion), ''),
    v_uid
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.staff_record_time_entry(uuid, text, uuid, text, text, text, boolean) from public;
grant execute on function public.staff_record_time_entry(uuid, text, uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) RLS
-- ---------------------------------------------------------------------------
alter table public.staff_employees enable row level security;
alter table public.staff_shifts enable row level security;
alter table public.staff_time_entries enable row level security;
alter table public.staff_attendance_incidents enable row level security;

drop policy if exists staff_employees_select on public.staff_employees;
create policy staff_employees_select
on public.staff_employees
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists staff_employees_write on public.staff_employees;
create policy staff_employees_write
on public.staff_employees
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

drop policy if exists staff_shifts_select on public.staff_shifts;
create policy staff_shifts_select
on public.staff_shifts
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists staff_shifts_write on public.staff_shifts;
create policy staff_shifts_write
on public.staff_shifts
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

drop policy if exists staff_time_entries_select on public.staff_time_entries;
create policy staff_time_entries_select
on public.staff_time_entries
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists staff_time_entries_manager_write on public.staff_time_entries;
create policy staff_time_entries_manager_write
on public.staff_time_entries
for insert
to authenticated
with check (
  local_id = public.current_local_id()
  and public.staff_is_manager_or_admin()
);

drop policy if exists staff_time_entries_manager_update on public.staff_time_entries;
create policy staff_time_entries_manager_update
on public.staff_time_entries
for update
to authenticated
using (
  local_id = public.current_local_id()
  and public.staff_is_manager_or_admin()
)
with check (
  local_id = public.current_local_id()
  and public.staff_is_manager_or_admin()
);

drop policy if exists staff_time_entries_manager_delete on public.staff_time_entries;
create policy staff_time_entries_manager_delete
on public.staff_time_entries
for delete
to authenticated
using (
  local_id = public.current_local_id()
  and public.staff_is_manager_or_admin()
);

drop policy if exists staff_incidents_select on public.staff_attendance_incidents;
create policy staff_incidents_select
on public.staff_attendance_incidents
for select
to authenticated
using (
  local_id = public.current_local_id()
  and (
    public.staff_is_manager_or_admin()
    or employee_id in (
      select e.id from public.staff_employees e where e.user_id = auth.uid()
    )
  )
);

drop policy if exists staff_incidents_write on public.staff_attendance_incidents;
create policy staff_incidents_write
on public.staff_attendance_incidents
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

-- ---------------------------------------------------------------------------
-- 9) Realtime (ejecutar si tu proyecto aún no tiene estas tablas en la publication)
-- ---------------------------------------------------------------------------
-- alter publication supabase_realtime add table public.staff_shifts;
-- alter publication supabase_realtime add table public.staff_time_entries;
-- alter publication supabase_realtime add table public.staff_attendance_incidents;

-- ---------------------------------------------------------------------------
-- 10) Demo seed (opcional): descomenta y ajusta local_id a un local real
-- ---------------------------------------------------------------------------
-- insert into public.staff_employees (local_id, first_name, last_name, alias, operational_role, color, active)
-- select id, 'María', 'Cocina', 'María', 'Cocina mañana', '#e57373', true from public.locals where code = 'MATARO' limit 1;
-- insert into public.staff_employees (local_id, first_name, last_name, alias, operational_role, color, active)
-- select id, 'Jon', 'Sala', 'Jon', 'Sala', '#64b5f6', true from public.locals where code = 'MATARO' limit 1;

-- ---------------------------------------------------------------------------
-- 11) Demo (opcional): solo si el local aún no tiene empleados en staff_employees
-- ---------------------------------------------------------------------------
do $$
declare
  lid uuid;
  d0 date := (timezone('Europe/Madrid', now()))::date;
  e_coc uuid;
  e_sal uuid;
begin
  select id into lid from public.locals where code = 'MATARO' limit 1;
  if lid is null then
    select id into lid from public.locals order by created_at nulls last limit 1;
  end if;
  if lid is null then
    return;
  end if;
  if exists (select 1 from public.staff_employees where local_id = lid limit 1) then
    return;
  end if;

  insert into public.staff_employees (local_id, first_name, last_name, alias, operational_role, color, active)
  values (lid, 'María', 'López', 'María', 'Cocina mañana', '#e57373', true)
  returning id into e_coc;

  insert into public.staff_employees (local_id, first_name, last_name, alias, operational_role, color, active)
  values (lid, 'Jon', 'Rius', 'Jon', 'Sala', '#42a5f5', true)
  returning id into e_sal;

  insert into public.staff_shifts (
    local_id, employee_id, shift_date, start_time, end_time, break_minutes, zone, status
  )
  values
    (lid, e_coc, d0, '08:00:00', '15:00:00', 30, 'cocina', 'confirmed'),
    (lid, e_sal, d0, '12:00:00', '22:00:00', 45, 'sala', 'planned');
end;
$$;
