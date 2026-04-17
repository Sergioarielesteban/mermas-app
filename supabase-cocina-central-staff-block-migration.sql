-- Bloqueo staff en módulo Cocina central (solo admin/manager ven datos y usan RPCs).
-- Si ya aplicaste el esquema antes: ejecuta ESTE script completo en SQL Editor.
-- Alternativa: vuelve a ejecutar supabase-cocina-central-schema.sql (idempotente en políticas con DROP IF EXISTS).

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
      and lower(p.role) in ('admin', 'manager')
  );
$$;

-- Las políticas RLS y el cuerpo de cc_register_production_batch / cc_sign_delivery_receipt /
-- cc_set_batch_estado deben coincidir con supabase-cocina-central-schema.sql en tu repo.
-- Copia desde ese archivo las secciones "RPC" y "RLS" actualizadas y ejecútalas aquí,
-- o ejecuta el .sql principal entero (recomendado en proyecto de desarrollo).
