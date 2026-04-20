-- =============================================================================
-- Corrige error PostgreSQL: "stack depth limit exceeded"
-- Causa típica: política RLS en `profiles` que usa `profile_is_admin()` o
-- `current_local_id()`, mientras esas funciones consultan `profiles` con el
-- mismo rol → recursión al evaluar políticas.
-- Solución: helpers con SECURITY DEFINER que leen `profiles` sin re-aplicar RLS.
--
-- Ejecutar en Supabase SQL Editor DESPUÉS de multilocal y SI usas:
--   supabase-profiles-admin-select-local.sql
-- =============================================================================

create or replace function public.current_local_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.local_id
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1
$$;

create or replace function public.profile_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.is_active = true
      and lower(trim(p.role)) = 'admin'
  );
$$;

comment on function public.current_local_id() is
  'local_id del usuario autenticado; SECURITY DEFINER evita recursión con RLS en profiles.';

comment on function public.profile_is_admin() is
  'True si el usuario tiene rol admin activo; SECURITY DEFINER evita recursión con RLS en profiles.';

grant execute on function public.current_local_id() to authenticated;
grant execute on function public.profile_is_admin() to authenticated;
