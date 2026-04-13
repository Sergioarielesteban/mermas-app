-- =============================================================================
-- Login por usuario (alias) + contraseña para Supabase Auth
-- =============================================================================
-- Objetivo:
--   - Permitir que el equipo entre con "usuario" (ej. sergio.mataro) en lugar de email.
--   - Mantener compatibilidad: también acepta email.
--
-- Flujo en app:
--   1) El usuario escribe "usuario" o email.
--   2) La app llama a public.resolve_login_email().
--   3) Se hace signInWithPassword usando el email real.
-- =============================================================================

alter table public.profiles
  add column if not exists login_username text;

create unique index if not exists uq_profiles_login_username_lower
  on public.profiles (lower(trim(login_username)))
  where login_username is not null and trim(login_username) <> '';

comment on column public.profiles.login_username is
  'Alias de acceso para login (ej. sergio.mataro). Único, sin depender del email.';

create or replace function public.resolve_login_email(login_identifier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  raw text := lower(trim(coalesce(login_identifier, '')));
  found_email text;
begin
  if raw = '' then
    return null;
  end if;

  -- Si ya parece email, usarlo tal cual.
  if position('@' in raw) > 1 then
    return raw;
  end if;

  -- Buscar por alias de login.
  select lower(trim(p.email))
    into found_email
  from public.profiles p
  where lower(trim(p.login_username)) = raw
    and p.is_active = true
  limit 1;

  return found_email;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- =============================================================================
-- EJEMPLOS
-- =============================================================================
-- 1) Poner alias a usuarios:
-- update public.profiles
-- set login_username = 'sergio.mataro'
-- where lower(email) = 'sergio.mataro@chefone.local';
--
-- 2) Probar resolución:
-- select public.resolve_login_email('sergio.mataro'); -- -> sergio.mataro@chefone.local
-- select public.resolve_login_email('sergio.mataro@chefone.local');
