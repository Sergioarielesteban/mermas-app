create table if not exists public.staff_meal_records (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  service text not null,
  meal_date date not null,
  people_count numeric(8,2) not null default 1,
  unit_cost_eur numeric(10,2) not null default 0,
  total_cost_eur numeric(12,2) not null default 0,
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz
);

alter table public.staff_meal_records
  drop constraint if exists staff_meal_records_service_check;
alter table public.staff_meal_records
  add constraint staff_meal_records_service_check
  check (service in ('desayuno', 'comida', 'cena', 'snack', 'otro'));

alter table public.staff_meal_records
  drop constraint if exists staff_meal_records_people_count_check;
alter table public.staff_meal_records
  add constraint staff_meal_records_people_count_check
  check (people_count > 0);

alter table public.staff_meal_records
  drop constraint if exists staff_meal_records_unit_cost_eur_check;
alter table public.staff_meal_records
  add constraint staff_meal_records_unit_cost_eur_check
  check (unit_cost_eur >= 0);

alter table public.staff_meal_records
  drop constraint if exists staff_meal_records_total_cost_eur_check;
alter table public.staff_meal_records
  add constraint staff_meal_records_total_cost_eur_check
  check (total_cost_eur >= 0);

create index if not exists idx_staff_meal_records_local_id on public.staff_meal_records(local_id);
create index if not exists idx_staff_meal_records_meal_date on public.staff_meal_records(meal_date desc);
create index if not exists idx_staff_meal_records_service on public.staff_meal_records(service);
create index if not exists idx_staff_meal_records_voided_at on public.staff_meal_records(voided_at);

alter table public.staff_meal_records enable row level security;

drop policy if exists "staff meal records same local read" on public.staff_meal_records;
create policy "staff meal records same local read"
on public.staff_meal_records
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "staff meal records same local write" on public.staff_meal_records;
create policy "staff meal records same local write"
on public.staff_meal_records
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
