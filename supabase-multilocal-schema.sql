-- Multi-local aislado para App de Mermas
-- Ejecutar en Supabase SQL Editor

create extension if not exists pgcrypto;

-- 1) Locales (sedes)
create table if not exists public.locals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) Perfiles de usuario (1:1 con auth.users)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  local_id uuid not null references public.locals(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_local_id on public.profiles(local_id);

-- 3) Productos por local
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  name text not null,
  unit text not null check (unit in ('kg', 'ud', 'bolsa', 'racion')),
  price_per_unit numeric(10,2) not null check (price_per_unit >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, name)
);

create index if not exists idx_products_local_id on public.products(local_id);

-- 4) Mermas por local
create table if not exists public.mermas (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(10,2) not null check (quantity > 0),
  motive_key text not null check (
    motive_key in ('se-quemo', 'mal-estado', 'cliente-cambio', 'error-cocina', 'sobras-marcaje', 'cancelado')
  ),
  notes text not null default '',
  occurred_at timestamptz not null,
  photo_data_url text,
  cost_eur numeric(12,2) not null check (cost_eur >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mermas_local_id on public.mermas(local_id);
create index if not exists idx_mermas_occurred_at on public.mermas(occurred_at desc);

-- 5) Trigger para updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_mermas_updated_at on public.mermas;
create trigger trg_mermas_updated_at
before update on public.mermas
for each row execute procedure public.set_updated_at();

-- 6) Activar RLS
alter table public.locals enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.mermas enable row level security;

-- 7) Helper: local_id del usuario autenticado
create or replace function public.current_local_id()
returns uuid
language sql
stable
as $$
  select p.local_id
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1
$$;

-- 8) Políticas RLS (aislamiento por local)
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "locals same local read" on public.locals;
create policy "locals same local read"
on public.locals
for select
to authenticated
using (id = public.current_local_id());

drop policy if exists "products same local read" on public.products;
create policy "products same local read"
on public.products
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "products same local write" on public.products;
create policy "products same local write"
on public.products
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "mermas same local read" on public.mermas;
create policy "mermas same local read"
on public.mermas
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "mermas same local write" on public.mermas;
create policy "mermas same local write"
on public.mermas
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- 9) Seed mínimo de locales (ejemplo)
insert into public.locals (code, name, city)
values
  ('MATARO', 'Chef-One Mataro', 'Mataro'),
  ('PREMIA', 'Chef-One Premia', 'Premia')
on conflict (code) do nothing;
