-- Plantillas de pedido reutilizables (cantidades + artículos; sin precios fijos).
-- Ejecutar en Supabase tras autenticación con current_local_id() ya definida.

create table if not exists public.pedido_templates (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  supplier_id uuid not null references public.pedido_suppliers(id) on delete restrict,
  name text not null,
  category text,
  local_label text,
  is_favorite boolean not null default false,
  source_order_id uuid references public.purchase_orders(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_pedido_templates_local_id on public.pedido_templates(local_id);
create index if not exists idx_pedido_templates_supplier_id on public.pedido_templates(supplier_id);
create index if not exists idx_pedido_templates_last_used on public.pedido_templates(local_id, last_used_at desc nulls last);

create table if not exists public.pedido_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.pedido_templates(id) on delete cascade,
  local_id uuid not null references public.locals(id) on delete restrict,
  supplier_product_id uuid references public.pedido_supplier_products(id) on delete set null,
  product_name text not null,
  unit text not null,
  quantity numeric(12,4) not null check (quantity >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_pedido_template_items_template on public.pedido_template_items(template_id);
create index if not exists idx_pedido_template_items_local_id on public.pedido_template_items(local_id);

create or replace function public.pedido_templates_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pedido_templates_updated_at on public.pedido_templates;
create trigger trg_pedido_templates_updated_at
before update on public.pedido_templates
for each row execute procedure public.pedido_templates_touch_updated_at();

alter table public.pedido_templates enable row level security;
alter table public.pedido_template_items enable row level security;

drop policy if exists "pedido templates same local read" on public.pedido_templates;
create policy "pedido templates same local read"
on public.pedido_templates
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedido templates same local write" on public.pedido_templates;
create policy "pedido templates same local write"
on public.pedido_templates
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "pedido template items same local read" on public.pedido_template_items;
create policy "pedido template items same local read"
on public.pedido_template_items
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedido template items same local write" on public.pedido_template_items;
create policy "pedido template items same local write"
on public.pedido_template_items
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
