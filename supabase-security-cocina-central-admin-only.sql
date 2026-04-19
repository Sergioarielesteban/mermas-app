-- Cocina central en app: alinear RLS con UI (solo admin). Sustituye admin+manager por solo admin.
-- Ejecutar en Supabase SQL Editor después de supabase-cocina-central-schema.sql.

create or replace function public.profile_can_access_cocina_central_module()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.is_active = true
      and lower(trim(p.role)) = 'admin'
  );
$$;

comment on function public.profile_can_access_cocina_central_module() is
  'Solo rol admin puede usar políticas y RPCs del módulo cocina central (alineado con la app).';
