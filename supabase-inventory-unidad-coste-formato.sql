-- Inventario: unidad de coste (kg/L/ud) independiente de la unidad de stock y del formato operativo.
-- Idempotente. Ejecutar en Supabase SQL Editor.

alter table public.inventory_items
  add column if not exists unidad_coste text;

alter table public.inventory_items
  add column if not exists formato_operativo text;

-- Backfill: si la fila ya usa kg/l/ud como unidad de stock, misma unidad de coste; si no, kg (coste típico por peso).
update public.inventory_items
set unidad_coste = lower(trim(unit))
where unidad_coste is null
  and lower(trim(unit)) in ('kg', 'l', 'ud');

update public.inventory_items
set unidad_coste = 'kg'
where unidad_coste is null or trim(unidad_coste) = '';

alter table public.inventory_items
  alter column unidad_coste set default 'kg';

alter table public.inventory_items
  alter column unidad_coste set not null;

alter table public.inventory_items
  drop constraint if exists inventory_items_unidad_coste_chk;

alter table public.inventory_items
  add constraint inventory_items_unidad_coste_chk
  check (unidad_coste in ('kg', 'l', 'ud'));

comment on column public.inventory_items.unidad_coste is
  'Unidad del precio de valoración (€/kg, €/L, €/ud). El coste desde máster compara con esta unidad, no con unit.';
comment on column public.inventory_items.formato_operativo is
  'Etiqueta de presentación (bandeja, caja…); no participa en el cálculo de coste.';
