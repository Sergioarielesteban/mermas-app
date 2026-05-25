-- Pedidos / Artículos Master: documentación técnica en Storage.
-- Objetivo: adjuntar PDF o imagen a `purchase_articles` sin OCR ni procesamiento.
-- Requiere: public.locals, public.current_local_id(), public.purchase_articles.

alter table public.purchase_articles
  add column if not exists technical_file_url text;

alter table public.purchase_articles
  add column if not exists technical_file_name text;

alter table public.purchase_articles
  add column if not exists technical_file_type text;

alter table public.purchase_articles
  add column if not exists technical_file_size bigint;

comment on column public.purchase_articles.technical_file_url is
  'Ruta del archivo en Storage bucket article-documents. Se mantiene el nombre histórico "url" por compatibilidad de app.';

comment on column public.purchase_articles.technical_file_name is
  'Nombre original visible del PDF o imagen adjunta al artículo master.';

comment on column public.purchase_articles.technical_file_type is
  'MIME type del archivo adjunto: application/pdf, image/jpeg, image/png, image/webp.';

comment on column public.purchase_articles.technical_file_size is
  'Tamaño del archivo adjunto en bytes.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-documents',
  'article-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "article documents select" on storage.objects;
create policy "article documents select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'article-documents'
  and (storage.foldername(name))[1] = public.current_local_id()::text
);

drop policy if exists "article documents insert" on storage.objects;
create policy "article documents insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'article-documents'
  and (storage.foldername(name))[1] = public.current_local_id()::text
);

drop policy if exists "article documents update" on storage.objects;
create policy "article documents update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'article-documents'
  and (storage.foldername(name))[1] = public.current_local_id()::text
)
with check (
  bucket_id = 'article-documents'
  and (storage.foldername(name))[1] = public.current_local_id()::text
);

drop policy if exists "article documents delete" on storage.objects;
create policy "article documents delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'article-documents'
  and (storage.foldername(name))[1] = public.current_local_id()::text
);

