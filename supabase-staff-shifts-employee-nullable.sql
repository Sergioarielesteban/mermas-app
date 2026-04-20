-- Turnos planificados sin empleado asignado (cuadrante operativo).
-- Ejecutar en Supabase SQL editor cuando despliegues la funcionalidad.
alter table public.staff_shifts
  alter column employee_id drop not null;

comment on column public.staff_shifts.employee_id is
  'Empleado asignado; null = hueco / pendiente de asignar en cuadrante operativo.';
