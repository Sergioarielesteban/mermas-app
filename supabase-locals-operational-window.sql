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

-- Nombres canónicos (la app lee estos con prioridad; si faltan, usa operational_* arriba).
alter table public.locals add column if not exists start_operating_time time;
alter table public.locals add column if not exists end_operating_time time;
alter table public.locals add column if not exists allow_next_day_end boolean;
alter table public.locals add column if not exists max_extended_end_time time null;

comment on column public.locals.start_operating_time is 'Inicio operativo (día del turno).';
comment on column public.locals.end_operating_time is 'Fin operativo; si allow_next_day_end, hora del día siguiente.';
comment on column public.locals.allow_next_day_end is 'Si true, end_operating_time es del día siguiente.';
comment on column public.locals.max_extended_end_time is 'Hora del día siguiente hasta la que se alarga la escala visual.';

-- Sincronizar desde columnas legacy la primera vez (idempotente).
update public.locals
set
  start_operating_time = coalesce(start_operating_time, operational_start, '07:30:00'),
  end_operating_time = coalesce(end_operating_time, operational_end, '00:00:00'),
  allow_next_day_end = coalesce(allow_next_day_end, operational_end_next_day, true),
  max_extended_end_time = coalesce(max_extended_end_time, operational_extend_until)
where true;

-- Ejemplos (ajustar por code o id) — preferir nombres nuevos:
-- Restaurante estándar:
--   update public.locals set start_operating_time = '07:30', end_operating_time = '00:00',
--     allow_next_day_end = true, max_extended_end_time = '02:00' where code = 'MATARO';
-- Obrador (mismo día):
--   update public.locals set start_operating_time = '05:00', end_operating_time = '14:00',
--     allow_next_day_end = false, max_extended_end_time = null where code = 'OBRADOR';
-- Local nocturno:
--   update public.locals set start_operating_time = '17:00', end_operating_time = '03:00',
--     allow_next_day_end = true, max_extended_end_time = null where code = 'NOCTURNO';
