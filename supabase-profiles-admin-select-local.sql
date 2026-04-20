-- =============================================================================
-- Permite a administradores leer perfiles del mismo local (equipo).
-- Necesario para informes como “quién aceptó las normas de empresa”.
-- Requiere: public.profile_is_admin(), public.current_local_id()
--           (p. ej. supabase-security-finanzas-admin-rls.sql).
-- Coexiste con la política “solo mi perfil”: las políticas SELECT se combinan con OR.
-- =============================================================================

drop policy if exists "profiles select same local admin" on public.profiles;
create policy "profiles select same local admin"
on public.profiles
for select
to authenticated
using (
  local_id = public.current_local_id()
  and public.profile_is_admin()
);
