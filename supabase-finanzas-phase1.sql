-- Finanzas — Fase 1: ventas diarias, coste personal por periodo, gastos fijos, asientos fiscales
-- Requiere: public.locals, public.current_local_id(), public.set_updated_at()
-- Ejecutar en Supabase SQL Editor (mismo estilo que otros supabase-*.sql del repo)

-- -----------------------------------------------------------------------------
-- 1) sales_daily
-- -----------------------------------------------------------------------------
create table if not exists public.sales_daily (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  date date not null,
  net_sales_eur numeric(14, 2),
  tax_collected_eur numeric(14, 2),
  tickets_count int check (tickets_count is null or tickets_count >= 0),
  avg_ticket_eur numeric(14, 2) generated always as (
    case
      when tickets_count is not null and tickets_count > 0 and net_sales_eur is not null
        then round(net_sales_eur / tickets_count, 2)
      else null
    end
  ) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, date)
);

create index if not exists idx_sales_daily_local_date on public.sales_daily (local_id, date desc);

drop trigger if exists trg_sales_daily_updated_at on public.sales_daily;
create trigger trg_sales_daily_updated_at
before update on public.sales_daily
for each row execute procedure public.set_updated_at();

comment on table public.sales_daily is 'Cierre de ventas por día y local (TPV / manual).';

-- -----------------------------------------------------------------------------
-- 2) staff_costs_period
-- -----------------------------------------------------------------------------
create table if not exists public.staff_costs_period (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  period_type text not null check (period_type in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  labor_hours numeric(12, 2) check (labor_hours is null or labor_hours >= 0),
  labor_cost_eur numeric(14, 2) check (labor_cost_eur is null or labor_cost_eur >= 0),
  ss_cost_eur numeric(14, 2) check (ss_cost_eur is null or ss_cost_eur >= 0),
  other_staff_cost_eur numeric(14, 2) check (other_staff_cost_eur is null or other_staff_cost_eur >= 0),
  total_staff_cost_eur numeric(14, 2) generated always as (
    round(
      coalesce(labor_cost_eur, 0) + coalesce(ss_cost_eur, 0) + coalesce(other_staff_cost_eur, 0),
      2
    )
  ) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (local_id, period_type, period_start, period_end)
);

create index if not exists idx_staff_costs_local_period on public.staff_costs_period (local_id, period_start, period_end);

drop trigger if exists trg_staff_costs_period_updated_at on public.staff_costs_period;
create trigger trg_staff_costs_period_updated_at
before update on public.staff_costs_period
for each row execute procedure public.set_updated_at();

comment on table public.staff_costs_period is 'Coste de personal agregado por ventana de fechas (día/semana/mes).';

-- -----------------------------------------------------------------------------
-- 3) fixed_expenses
-- -----------------------------------------------------------------------------
create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  category text not null check (
    category in (
      'rent',
      'utilities',
      'insurance',
      'software',
      'banking_fees',
      'equipment_lease',
      'marketing',
      'other'
    )
  ),
  amount_eur numeric(14, 2) not null check (amount_eur >= 0),
  frequency text not null check (
    frequency in ('monthly', 'quarterly', 'yearly', 'one_off')
  ),
  active boolean not null default true,
  period_start date,
  period_end date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  check (
    frequency <> 'one_off' or period_start is not null
  )
);

create index if not exists idx_fixed_expenses_local_active on public.fixed_expenses (local_id, active);
create index if not exists idx_fixed_expenses_local_one_off on public.fixed_expenses (local_id, period_start, period_end)
  where frequency = 'one_off';

drop trigger if exists trg_fixed_expenses_updated_at on public.fixed_expenses;
create trigger trg_fixed_expenses_updated_at
before update on public.fixed_expenses
for each row execute procedure public.set_updated_at();

comment on table public.fixed_expenses is 'Gastos fijos recurrentes o puntuales (one_off) por local.';

-- -----------------------------------------------------------------------------
-- 4) tax_entries
-- -----------------------------------------------------------------------------
create table if not exists public.tax_entries (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  date date not null,
  tax_type text not null check (
    tax_type in ('iva_repercutido', 'iva_soportado', 'impuesto_sociedades', 'otro')
  ),
  amount_eur numeric(14, 2) not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_tax_entries_local_date on public.tax_entries (local_id, date desc);

comment on table public.tax_entries is 'Movimientos fiscales manuales (IVA repercutido/soportado, IS, otros).';

-- -----------------------------------------------------------------------------
-- 5) RLS (patrón local_id = public.current_local_id())
-- -----------------------------------------------------------------------------
alter table public.sales_daily enable row level security;
alter table public.staff_costs_period enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.tax_entries enable row level security;

-- sales_daily
drop policy if exists "sales_daily same local read" on public.sales_daily;
create policy "sales_daily same local read"
on public.sales_daily
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "sales_daily same local write" on public.sales_daily;
create policy "sales_daily same local write"
on public.sales_daily
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- staff_costs_period
drop policy if exists "staff_costs_period same local read" on public.staff_costs_period;
create policy "staff_costs_period same local read"
on public.staff_costs_period
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "staff_costs_period same local write" on public.staff_costs_period;
create policy "staff_costs_period same local write"
on public.staff_costs_period
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- fixed_expenses
drop policy if exists "fixed_expenses same local read" on public.fixed_expenses;
create policy "fixed_expenses same local read"
on public.fixed_expenses
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "fixed_expenses same local write" on public.fixed_expenses;
create policy "fixed_expenses same local write"
on public.fixed_expenses
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- tax_entries
drop policy if exists "tax_entries same local read" on public.tax_entries;
create policy "tax_entries same local read"
on public.tax_entries
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "tax_entries same local write" on public.tax_entries;
create policy "tax_entries same local write"
on public.tax_entries
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
