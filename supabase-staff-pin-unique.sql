-- Garantiza PIN de fichaje único por local.
-- Normaliza PIN existentes y resuelve duplicados previos dejando solo el más reciente.

update public.staff_employees
set pin_fichaje = nullif(btrim(pin_fichaje), '')
where pin_fichaje is not null;

with ranked as (
  select
    id,
    row_number() over (
      partition by local_id, pin_fichaje
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.staff_employees
  where pin_fichaje is not null
)
update public.staff_employees e
set pin_fichaje = null
from ranked r
where e.id = r.id
  and r.rn > 1;

create unique index if not exists staff_employees_local_pin_unique
  on public.staff_employees(local_id, pin_fichaje)
  where pin_fichaje is not null;
