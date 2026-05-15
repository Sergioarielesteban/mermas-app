-- Pedidos: logos de proveedores (ejecutar en Supabase SQL Editor).
-- Añade una URL opcional por proveedor y un bucket público controlado por local.

alter table public.pedido_suppliers
  add column if not exists logo_url text;

comment on column public.pedido_suppliers.logo_url is
  'URL pública del logo del proveedor para UI de Pedidos.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pedido-supplier-logos',
  'pedido-supplier-logos',
  true,
  1500000,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ruta usada por la app: {local_id}/{supplier_id}/archivo
drop policy if exists "pedido supplier logos insert same local" on storage.objects;
create policy "pedido supplier logos insert same local"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pedido-supplier-logos'
  and (storage.foldername(name))[1] = public.current_local_id()::text
);

drop policy if exists "pedido supplier logos update same local" on storage.objects;
create policy "pedido supplier logos update same local"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pedido-supplier-logos'
  and (storage.foldername(name))[1] = public.current_local_id()::text
)
with check (
  bucket_id = 'pedido-supplier-logos'
  and (storage.foldername(name))[1] = public.current_local_id()::text
);

drop policy if exists "pedido supplier logos delete same local" on storage.objects;
create policy "pedido supplier logos delete same local"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pedido-supplier-logos'
  and (storage.foldername(name))[1] = public.current_local_id()::text
);

