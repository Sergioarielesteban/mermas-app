-- Ventana operativa por local (cuadrante / planificación).
-- Ejecutar en Supabase SQL Editor cuando quieras activar la escala configurable.

alter table public.locals add column if not exists operational_start time default '07:30:00';
alter table public.locals add column if not exists operational_end time default '00:00:00';
alter table public.locals add column if not exists operational_end_next_day boolean default true;
alter table public.locals add column if not exists operational_extend_until time null;

comment on column public.locals.operational_start is 'Inicio del servicio operativo (hora local del día del turno).';
comment on column public.locals.operational_end is 'Fin operativo; si operational_end_next_day, esta hora es del día siguiente al de la fecha del turno.';
comment on column public.locals.operational_end_next_day is 'Si true, operational_end interpreta medianoche/cierre en el día siguiente.';
comment on column public.locals.operational_extend_until is 'Opcional: hasta qué hora del día siguiente se alarga la escala visual (p. ej. 02:00).';

-- Ejemplos (ajustar por code o id):
-- Restaurante estándar (07:30 → 00:00 +1, escala hasta +1 02:00):
--   update public.locals set operational_start = '07:30', operational_end = '00:00',
--     operational_end_next_day = true, operational_extend_until = '02:00' where code = 'MATARO';
-- Obrador (mismo día):
--   update public.locals set operational_start = '05:00', operational_end = '14:00',
--     operational_end_next_day = false, operational_extend_until = null where code = 'OBRADOR';
-- Local nocturno:
--   update public.locals set operational_start = '17:00', operational_end = '03:00',
--     operational_end_next_day = true, operational_extend_until = null where code = 'NOCTURNO';
