-- Snapshot histórico del «resumen inteligente» al validar recepción (no se recalcula después).
-- Ejecutar en Supabase SQL tras backup si procede.

create table if not exists public.pedidos_reception_summaries (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  supplier_id uuid not null references public.pedido_suppliers(id) on delete restrict,
  supplier_name text not null,
  usuario_nombre text not null default '',
  completed_at timestamptz not null,
  total_previsto numeric(14, 4) not null,
  total_recibido numeric(14, 4) not null,
  diferencia_euros numeric(14, 4) not null,
  diferencia_porcentaje numeric(10, 4),
  lineas_totales int not null,
  lineas_correctas int not null,
  lineas_incidencia int not null,
  alertas_count int not null default 0,
  alertas_subida_count int not null default 0,
  summary_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint pedidos_reception_summaries_local_order_unique unique (local_id, purchase_order_id)
);

create index if not exists idx_pedidos_reception_summaries_local_id on public.pedidos_reception_summaries (local_id);
create index if not exists idx_pedidos_reception_summaries_completed_at on public.pedidos_reception_summaries (completed_at desc);

alter table public.pedidos_reception_summaries enable row level security;

drop policy if exists "pedidos reception summaries same local read" on public.pedidos_reception_summaries;
create policy "pedidos reception summaries same local read"
on public.pedidos_reception_summaries
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "pedidos reception summaries same local write" on public.pedidos_reception_summaries;
create policy "pedidos reception summaries same local write"
on public.pedidos_reception_summaries
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());
