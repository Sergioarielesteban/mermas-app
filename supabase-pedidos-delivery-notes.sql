-- Módulo Pedidos · Albaranes (bandeja centralizada, OCR, incidencias, enlace a pedidos)
-- Ejecutar en Supabase SQL Editor tras supabase-pedidos-schema.sql y supabase-pedidos-albaran-storage.sql

-- Ampliar bucket existente para PDFs y tamaño razonable en albaranes independientes
update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
where id = 'pedido-albaranes';

-- -----------------------------------------------------------------------------
-- 1) Cabecera albarán
-- -----------------------------------------------------------------------------
create table if not exists public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  supplier_id uuid references public.pedido_suppliers(id) on delete set null,
  supplier_name text not null default '',
  delivery_note_number text not null default '',
  related_order_id uuid references public.purchase_orders(id) on delete set null,
  delivery_date date,
  status text not null default 'draft' check (
    status in ('draft', 'ocr_read', 'pending_review', 'validated', 'with_incidents', 'archived')
  ),
  subtotal numeric(14, 4),
  tax_amount numeric(14, 4),
  total_amount numeric(14, 4),
  currency text not null default 'EUR',
  ocr_status text check (ocr_status in ('pending', 'ok', 'partial', 'failed', 'skipped')),
  source_type text not null default 'manual' check (source_type in ('manual', 'ocr', 'linked_order')),
  original_storage_path text,
  original_mime_type text,
  original_file_name text,
  notes text not null default '',
  validated_at timestamptz,
  validated_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_notes_local on public.delivery_notes(local_id);
create index if not exists idx_delivery_notes_supplier on public.delivery_notes(supplier_id);
create index if not exists idx_delivery_notes_order on public.delivery_notes(related_order_id);
create index if not exists idx_delivery_notes_status on public.delivery_notes(local_id, status);
create index if not exists idx_delivery_notes_delivery_date on public.delivery_notes(local_id, delivery_date);

drop trigger if exists trg_delivery_notes_updated_at on public.delivery_notes;
create trigger trg_delivery_notes_updated_at
before update on public.delivery_notes
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Líneas
-- -----------------------------------------------------------------------------
create table if not exists public.delivery_note_items (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  supplier_product_name text not null default '',
  internal_product_id uuid references public.pedido_supplier_products(id) on delete set null,
  quantity numeric(14, 4) not null default 0 check (quantity >= 0),
  unit text not null default 'ud' check (unit in ('kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja')),
  unit_price numeric(14, 4),
  line_subtotal numeric(14, 4),
  vat_rate numeric(8, 6),
  matched_order_item_id uuid references public.purchase_order_items(id) on delete set null,
  match_status text check (
    match_status in ('unmatched', 'matched', 'mismatch_qty', 'mismatch_price', 'extra_line', 'not_applicable')
  ),
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_note_items_note on public.delivery_note_items(delivery_note_id);
create index if not exists idx_delivery_note_items_local on public.delivery_note_items(local_id);

-- -----------------------------------------------------------------------------
-- 3) Incidencias
-- -----------------------------------------------------------------------------
create table if not exists public.delivery_note_incidents (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  delivery_note_item_id uuid references public.delivery_note_items(id) on delete cascade,
  incident_type text not null check (
    incident_type in (
      'qty_diff',
      'price_diff',
      'not_ordered',
      'line_unknown',
      'total_mismatch',
      'incomplete_doc',
      'other'
    )
  ),
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_comment text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_note_incidents_note on public.delivery_note_incidents(delivery_note_id);
create index if not exists idx_delivery_note_incidents_local on public.delivery_note_incidents(local_id);
create index if not exists idx_delivery_note_incidents_open on public.delivery_note_incidents(delivery_note_id, status);

-- -----------------------------------------------------------------------------
-- 4) Log OCR (trazabilidad)
-- -----------------------------------------------------------------------------
create table if not exists public.delivery_note_ocr_runs (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete restrict,
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  provider text not null default 'textract',
  raw_text text not null default '',
  error_message text,
  duration_ms int,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_note_ocr_note on public.delivery_note_ocr_runs(delivery_note_id);

-- -----------------------------------------------------------------------------
-- 5) RLS
-- -----------------------------------------------------------------------------
alter table public.delivery_notes enable row level security;
alter table public.delivery_note_items enable row level security;
alter table public.delivery_note_incidents enable row level security;
alter table public.delivery_note_ocr_runs enable row level security;

drop policy if exists "delivery_notes same local read" on public.delivery_notes;
create policy "delivery_notes same local read"
on public.delivery_notes
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "delivery_notes same local write" on public.delivery_notes;
create policy "delivery_notes same local write"
on public.delivery_notes
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "delivery_note_items same local read" on public.delivery_note_items;
create policy "delivery_note_items same local read"
on public.delivery_note_items
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "delivery_note_items same local write" on public.delivery_note_items;
create policy "delivery_note_items same local write"
on public.delivery_note_items
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "delivery_note_incidents same local read" on public.delivery_note_incidents;
create policy "delivery_note_incidents same local read"
on public.delivery_note_incidents
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "delivery_note_incidents same local write" on public.delivery_note_incidents;
create policy "delivery_note_incidents same local write"
on public.delivery_note_incidents
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "delivery_note_ocr_runs same local read" on public.delivery_note_ocr_runs;
create policy "delivery_note_ocr_runs same local read"
on public.delivery_note_ocr_runs
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "delivery_note_ocr_runs same local write" on public.delivery_note_ocr_runs;
create policy "delivery_note_ocr_runs same local write"
on public.delivery_note_ocr_runs
for insert
to authenticated
with check (local_id = public.current_local_id());

comment on table public.delivery_notes is
  'Albaranes de proveedor: bandeja, OCR opcional, vínculo opcional a purchase_orders.';
comment on table public.delivery_note_items is
  'Líneas del albarán; match_status vs pedido cuando related_order_id está informado.';
comment on table public.delivery_note_incidents is
  'Incidencias de recepción / documento asociadas al albarán.';
