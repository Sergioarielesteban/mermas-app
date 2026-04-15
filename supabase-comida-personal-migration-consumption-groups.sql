-- Agrupa varias líneas de staff_meal_records en un mismo "registro" de consumo (misma comida).

alter table public.staff_meal_records
  add column if not exists consumption_group_id uuid;

create index if not exists idx_staff_meal_records_consumption_group_id
  on public.staff_meal_records(consumption_group_id)
  where consumption_group_id is not null;
