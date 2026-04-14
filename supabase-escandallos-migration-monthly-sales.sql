-- Unidades vendidas por plato y mes (food cost real ponderado por mix).
-- Ejecutar en Supabase tras supabase-escandallos-schema.sql

create table if not exists public.escandallo_monthly_sales (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  recipe_id uuid not null references public.escandallo_recipes(id) on delete cascade,
  quantity_sold numeric(12, 2) not null default 0 check (quantity_sold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, year_month, recipe_id)
);

create index if not exists idx_escandallo_monthly_sales_local_month on public.escandallo_monthly_sales(local_id, year_month);
create index if not exists idx_escandallo_monthly_sales_recipe on public.escandallo_monthly_sales(recipe_id);

drop trigger if exists trg_escandallo_monthly_sales_updated_at on public.escandallo_monthly_sales;
create trigger trg_escandallo_monthly_sales_updated_at
before update on public.escandallo_monthly_sales
for each row execute procedure public.set_updated_at();

alter table public.escandallo_monthly_sales enable row level security;

drop policy if exists "escandallo_monthly_sales same local read" on public.escandallo_monthly_sales;
create policy "escandallo_monthly_sales same local read"
on public.escandallo_monthly_sales
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "escandallo_monthly_sales same local write" on public.escandallo_monthly_sales;
create policy "escandallo_monthly_sales same local write"
on public.escandallo_monthly_sales
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
