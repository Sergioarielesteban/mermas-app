-- Histórico unificado de precios: solo recepción (albarán validado).
-- Ejecutar en Supabase SQL Editor tras delivery_notes y purchase_articles.
-- Opcional: migra filas desde pedido_supplier_product_price_history.

create table if not exists public.historico_precios (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  articulo_id uuid references public.purchase_articles(id) on delete set null,
  proveedor_id uuid references public.pedido_suppliers(id) on delete set null,
  supplier_product_id uuid not null references public.pedido_supplier_products(id) on delete cascade,
  fecha date not null,
  precio_anterior numeric(14, 4) not null,
  precio_nuevo numeric(14, 4) not null,
  diferencia numeric(14, 4) not null,
  diferencia_pct numeric(14, 4),
  unidad_comparacion text not null default 'ud',
  albaran_id uuid references public.delivery_notes(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_historico_precios_local_product_created
  on public.historico_precios (local_id, supplier_product_id, created_at desc);

create index if not exists idx_historico_precios_local_fecha
  on public.historico_precios (local_id, fecha desc);

create index if not exists idx_historico_precios_local_articulo
  on public.historico_precios (local_id, articulo_id)
  where articulo_id is not null;

create index if not exists idx_historico_precios_local_proveedor
  on public.historico_precios (local_id, proveedor_id)
  where proveedor_id is not null;

comment on table public.historico_precios is
  'Cambios de precio comparables registrados solo al validar albarán; evolución de precios lee solo esta tabla.';

alter table public.historico_precios enable row level security;

drop policy if exists "historico precios same local read" on public.historico_precios;
create policy "historico precios same local read"
on public.historico_precios
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "historico precios same local insert" on public.historico_precios;
create policy "historico precios same local insert"
on public.historico_precios
for insert
to authenticated
with check (local_id = public.current_local_id());

drop policy if exists "historico precios same local delete" on public.historico_precios;
create policy "historico precios same local delete"
on public.historico_precios
for delete
to authenticated
using (local_id = public.current_local_id());

-- Backfill desde tabla legada (solo si existe)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'pedido_supplier_product_price_history'
  ) then
    insert into public.historico_precios (
      local_id,
      articulo_id,
      proveedor_id,
      supplier_product_id,
      fecha,
      precio_anterior,
      precio_nuevo,
      diferencia,
      diferencia_pct,
      unidad_comparacion,
      albaran_id,
      created_by,
      created_at
    )
    select
      h.local_id,
      p.article_id,
      p.supplier_id,
      h.supplier_product_id,
      coalesce(d.delivery_date, (h.created_at at time zone 'UTC')::date),
      h.old_price_per_unit,
      h.new_price_per_unit,
      round((h.new_price_per_unit - h.old_price_per_unit)::numeric, 4),
      case
        when h.old_price_per_unit > 0
        then round(((h.new_price_per_unit - h.old_price_per_unit) / h.old_price_per_unit * 100)::numeric, 4)
        else null
      end,
      case
        when p.unit = 'kg' then 'kg'
        when p.billing_unit = 'kg' and coalesce(p.billing_qty_per_order_unit, 0) > 0 then 'kg'
        when coalesce(p.estimated_kg_per_unit, 0) > 0 then 'kg'
        when p.unit = 'litro' then 'litro'
        else coalesce(p.unit::text, 'ud')
      end,
      h.delivery_note_id,
      h.created_by,
      h.created_at
    from public.pedido_supplier_product_price_history h
    join public.pedido_supplier_products p
      on p.id = h.supplier_product_id and p.local_id = h.local_id
    left join public.delivery_notes d
      on d.id = h.delivery_note_id
    where h.source = 'delivery_note_validated'
      and not exists (
        select 1 from public.historico_precios x
        where x.local_id = h.local_id
          and x.supplier_product_id = h.supplier_product_id
          and x.created_at = h.created_at
          and x.precio_anterior = h.old_price_per_unit
          and x.precio_nuevo = h.new_price_per_unit
      );
  end if;
end $$;
