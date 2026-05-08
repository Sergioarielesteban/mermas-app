-- Albaranes: Storage + registro opcional por pedido (ejecutar en Supabase SQL Editor).
-- Requiere: public.locals, public.profiles, public.current_local_id(), public.purchase_orders.

-- 1) Bucket privado (2 MB por objeto; solo imágenes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pedido-albaranes',
  'pedido-albaranes',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Tabla de metadatos (trazabilidad; la imagen vive en Storage)
create table if not exists public.purchase_order_albaran_attachments (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete restrict,
  order_id uuid not null references public.purchase_orders (id) on delete cascade,
  storage_path text not null,
  file_size_bytes integer,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_po_albaran_attach_local on public.purchase_order_albaran_attachments (local_id);
create index if not exists idx_po_albaran_attach_order on public.purchase_order_albaran_attachments (order_id);

alter table public.purchase_order_albaran_attachments enable row level security;

drop policy if exists "po albaran attach select same local" on public.purchase_order_albaran_attachments;
create policy "po albaran attach select same local"
on public.purchase_order_albaran_attachments
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "po albaran attach insert same local" on public.purchase_order_albaran_attachments;
create policy "po albaran attach insert same local"
on public.purchase_order_albaran_attachments
for insert
to authenticated
with check (
  local_id = public.current_local_id ()
  and exists (
    select 1
    from public.purchase_orders o
    where o.id = order_id
      and o.local_id = public.current_local_id ()
  )
);

-- 3) Storage: ruta {local_id}/{order_id}/archivo
drop policy if exists "pedido albaranes select" on storage.objects;
create policy "pedido albaranes select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pedido-albaranes'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
);

drop policy if exists "pedido albaranes insert" on storage.objects;
create policy "pedido albaranes insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pedido-albaranes'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
);

drop policy if exists "pedido albaranes update" on storage.objects;
create policy "pedido albaranes update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pedido-albaranes'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
)
with check (
  bucket_id = 'pedido-albaranes'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
);

drop policy if exists "pedido albaranes delete" on storage.objects;
create policy "pedido albaranes delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pedido-albaranes'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
);

comment on table public.purchase_order_albaran_attachments is
  'Registro de fotos de albarán subidas desde la app (Storage bucket pedido-albaranes).';
