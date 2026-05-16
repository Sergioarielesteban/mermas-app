-- Pedidos: logos de proveedores (ejecutar en Supabase SQL Editor).
-- Añade una URL opcional por proveedor y un bucket público controlado por local.
-- Si ves "new row violates row-level security policy" al subir, ejecuta TODO este archivo.

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

-- Valida ruta {local_id}/{supplier_id}/archivo contra pedido_suppliers + current_local_id().
create or replace function public.pedido_supplier_logo_storage_path_ok(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  parts text[];
  v_local uuid;
  v_supplier uuid;
  v_profile_local uuid;
begin
  v_profile_local := public.current_local_id();
  if v_profile_local is null then
    return false;
  end if;

  parts := storage.foldername(object_name);
  if parts is null or coalesce(array_length(parts, 1), 0) < 2 then
    return false;
  end if;

  begin
    v_local := lower(trim(parts[1]))::uuid;
    v_supplier := lower(trim(parts[2]))::uuid;
  exception
    when others then
      return false;
  end;

  if v_local is distinct from v_profile_local then
    return false;
  end if;

  return exists (
    select 1
    from public.pedido_suppliers ps
    where ps.id = v_supplier
      and ps.local_id = v_local
  );
end;
$$;

grant execute on function public.pedido_supplier_logo_storage_path_ok(text) to authenticated;

-- Ruta usada por la app: {local_id}/{supplier_id}/archivo
drop policy if exists "pedido supplier logos insert same local" on storage.objects;
create policy "pedido supplier logos insert same local"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pedido-supplier-logos'
  and public.pedido_supplier_logo_storage_path_ok(name)
);

drop policy if exists "pedido supplier logos update same local" on storage.objects;
create policy "pedido supplier logos update same local"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pedido-supplier-logos'
  and public.pedido_supplier_logo_storage_path_ok(name)
)
with check (
  bucket_id = 'pedido-supplier-logos'
  and public.pedido_supplier_logo_storage_path_ok(name)
);

drop policy if exists "pedido supplier logos delete same local" on storage.objects;
create policy "pedido supplier logos delete same local"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pedido-supplier-logos'
  and public.pedido_supplier_logo_storage_path_ok(name)
);

-- Lectura autenticada (el bucket es público; esto cubre listados/API internos).
drop policy if exists "pedido supplier logos select same local" on storage.objects;
create policy "pedido supplier logos select same local"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pedido-supplier-logos'
  and public.pedido_supplier_logo_storage_path_ok(name)
);
