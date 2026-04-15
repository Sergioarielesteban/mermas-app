create table if not exists public.staff_meal_workers (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (local_id, name)
);

create index if not exists idx_staff_meal_workers_local_id on public.staff_meal_workers(local_id);
create index if not exists idx_staff_meal_workers_active on public.staff_meal_workers(is_active);

alter table public.staff_meal_workers enable row level security;

drop policy if exists "staff meal workers same local read" on public.staff_meal_workers;
create policy "staff meal workers same local read"
on public.staff_meal_workers
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "staff meal workers same local write" on public.staff_meal_workers;
create policy "staff meal workers same local write"
on public.staff_meal_workers
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

alter table public.staff_meal_records
  add column if not exists worker_id uuid references public.staff_meal_workers(id) on delete set null;
alter table public.staff_meal_records
  add column if not exists worker_name_snapshot text;
alter table public.staff_meal_records
  add column if not exists source_product_id uuid references public.products(id) on delete set null;
alter table public.staff_meal_records
  add column if not exists source_product_name text;

create index if not exists idx_staff_meal_records_worker_id on public.staff_meal_records(worker_id);
create index if not exists idx_staff_meal_records_source_product_id on public.staff_meal_records(source_product_id);
